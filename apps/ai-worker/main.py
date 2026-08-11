"""faster-whisper 기반 STT worker.

`POST /transcribe`가 raw audio bytes(application/octet-stream)를 받아 한국어 STT를
수행하고 `{ "segments": [{ text, startMs, endMs }] }`를 돌려준다.
audio는 디스크에 남기지 않고 STT 후 즉시 폐기한다.
"""

from __future__ import annotations

import asyncio
import io
import itertools
import logging
import os
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from faster_whisper import WhisperModel

logger = logging.getLogger("ai-worker")
logging.basicConfig(level=logging.INFO)

CPU_THREADS = int(os.getenv("STT_CPU_THREADS", "1"))
BEAM_SIZE = int(os.getenv("STT_BEAM_SIZE", "1"))
MODEL_SIZE = os.getenv("STT_MODEL_SIZE", "small")
LANGUAGE = os.getenv("STT_LANGUAGE", "ko")

# 개발 전용 오디오 덤프. 벤치 샘플(bench/samples/)을 실제 파이프라인에서 떠내기 위한 것으로,
# 받은 body를 그대로 wav로 저장한다 — 모델이 보는 것과 바이트 단위로 동일하다.
#
# 운영에서는 절대 설정하지 않는다. CLAUDE.md 의 "audio is ephemeral" 규칙상 오디오를
# 남기는 경로는 로컬 개발에만 존재해야 한다(docker-compose.prod.yml 은 이 변수를 넘기지 않는다).
DUMP_DIR = os.getenv("STT_DUMP_DIR", "").strip()
_dump_sequence = itertools.count()

# 동시 디코드 상한. 2GB 인스턴스에서 디코드가 겹치면 RAM 피크가 배로 뛰어 컨테이너가
# OOM 으로 죽는다. 백엔드 스케줄러도 직렬로 호출하지만, 여기서 한 번 더 막는다.
TRANSCRIBE_SEMAPHORE = asyncio.Semaphore(1)


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    # 미설정(None)뿐 아니라 빈 문자열·공백("STT_VAD_FILTER=")도 기본값으로 본다.
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


# faster-whisper small 한국어 STT의 오인식·환각을 줄이는 디코딩 옵션.
#
# - VAD_FILTER: Silero VAD로 무음 구간을 잘라낸다. 회의 오디오는 긴 정적
#   구간이 많아 그대로 디코드하면 무음에 환각 자막이 붙는다(특히 30s 청크).
# - INITIAL_PROMPT: 도메인 어휘를 모델에 미리 알려 영어 기술 용어 오인식
#   (예: "MySQL" → "마이스쿨")을 줄인다. 빈 문자열이면 비활성(None).
#   도메인이 다르면 STT_INITIAL_PROMPT로 교체한다.
DEFAULT_INITIAL_PROMPT = (
    "이 녹음은 IT 개발 동아리의 화상 회의입니다. "
    "API, OAuth, MySQL, Redis, Docker, 백엔드, 프론트엔드, 배포, 리팩터링 같은 "
    "기술 용어와 영어 약어가 자주 등장합니다."
)
VAD_FILTER = _env_bool("STT_VAD_FILTER", True)
INITIAL_PROMPT = (os.getenv("STT_INITIAL_PROMPT", DEFAULT_INITIAL_PROMPT).strip() or None)

# 모듈 import 시점에 모델을 1회 로드(warm-start). 컨테이너 부팅 시 cold-load 비용
# 한 번만 지불하고, 이후 매 요청은 transcribe만 호출한다.
model = WhisperModel(
    MODEL_SIZE,
    device="cpu",
    compute_type="int8",
    cpu_threads=CPU_THREADS,
)

app = FastAPI(title="convene-ai-worker", version="1.0.0")


def dump_audio(audio: bytes) -> None:
    """받은 wav를 STT_DUMP_DIR에 떨군다. 덤프 실패가 전사를 막지 않도록 예외는 삼킨다."""
    try:
        directory = Path(DUMP_DIR)
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{int(time.time())}-{next(_dump_sequence):04d}.wav"
        path.write_bytes(audio)
        logger.info("audio dumped: %s (%d bytes)", path, len(audio))
    except Exception:  # noqa: BLE001 — 개발 편의 기능이라 실패해도 전사는 계속한다.
        logger.exception("audio dump failed")


def run_transcription(audio: bytes) -> list[dict[str, Any]]:
    """CPU 바운드 전사 본체. 이벤트 루프가 아닌 threadpool 에서 호출된다."""
    # faster-whisper는 file path / BinaryIO / ndarray를 받는다.
    # BytesIO로 감싸 디스크 통과 없이 메모리에서 바로 처리한다.
    segments_iter, _info = model.transcribe(
        io.BytesIO(audio),
        beam_size=BEAM_SIZE,
        language=LANGUAGE,
        vad_filter=VAD_FILTER,
        initial_prompt=INITIAL_PROMPT,
        # 청크 전사는 청크마다 독립 호출이라 이전 청크 문맥이 없다. 기본값
        # (True)은 직전 텍스트에 조건을 걸어 반복·드리프트 환각을 유발하므로
        # 청크 단위 안정성을 위해 끈다.
        condition_on_previous_text=False,
    )

    segments: list[dict[str, Any]] = []
    for seg in segments_iter:
        text = seg.text.strip()
        if not text:
            continue
        segments.append(
            {
                "text": text,
                # backend wire format은 정수 ms (TranscriptionSegmentPayload).
                "startMs": int(round(seg.start * 1000)),
                "endMs": int(round(seg.end * 1000)),
            }
        )
    return segments


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe(request: Request) -> dict[str, Any]:
    audio = await request.body()
    if not audio:
        # 호출 측에서 audio가 null/empty인 회의도 들어올 수 있다(녹음 미캡처).
        # backend의 RecordingService가 빈 transcript로 finalize 하도록 허용한다.
        return {"segments": []}

    logger.info("transcribe: bytes=%d", len(audio))

    if DUMP_DIR:
        dump_audio(audio)

    try:
        # 전사는 CPU 바운드 블로킹 호출이라 threadpool 로 넘긴다. 이벤트 루프에서
        # 그대로 돌리면 디코딩 내내 /health 까지 막혀 헬스체크가 오탐한다.
        # 세마포어로 동시 디코드를 1건으로 묶어 RAM 피크가 배로 뛰는 것을 막는다
        # (CTranslate2 는 연산 중 GIL 을 놓으므로 threadpool 로도 병렬이 된다).
        async with TRANSCRIBE_SEMAPHORE:
            segments = await run_in_threadpool(run_transcription, audio)

        logger.info("transcribe done: %d segments", len(segments))
        return {"segments": segments}

    except Exception as exc:  # noqa: BLE001 — 외부 라이브러리 예외 일괄 매핑.
        logger.exception("transcribe failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
