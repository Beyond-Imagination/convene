"""migration v1 ai-worker — STT via faster-whisper.

`POST /transcribe` 는 raw audio bytes (application/octet-stream) 를 받아
faster-whisper 로 한국어 STT 를 수행한 뒤 segment 배열을 돌려준다.

backend 의 `TranscriberPort` (`apps/backend/src/recording/domain/ports/transcriber.port.ts`)
와 호환되는 wire format:

    Request:
        Content-Type: application/octet-stream
        Body: opus/wav/... 오디오 바이트(faster-whisper 가 ffmpeg 로 decode)

    Response 200 OK:
        {
            "segments": [
                { "text": "...", "startMs": 0, "endMs": 1200 },
                ...
            ]
        }

backend ↔ ai-worker 는 HTTP body 로 audio 를 흘려보낸다(공유 volume / 임시 디스크
경로 미사용). PLAN.md §3 — "STT 후 즉시 폐기, S3 미사용" 원칙.
"""

from __future__ import annotations

import io
import logging
import os
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from faster_whisper import WhisperModel

logger = logging.getLogger("ai-worker")
logging.basicConfig(level=logging.INFO)

CPU_THREADS = int(os.getenv("STT_CPU_THREADS", "1"))
BEAM_SIZE = int(os.getenv("STT_BEAM_SIZE", "1"))
MODEL_SIZE = os.getenv("STT_MODEL_SIZE", "small")
LANGUAGE = os.getenv("STT_LANGUAGE", "ko")

# 모듈 import 시점에 모델을 1회 로드(warm-start). 컨테이너 부팅 시 cold-load 비용
# 한 번만 지불하고, 이후 매 요청은 transcribe 만 호출한다.
model = WhisperModel(
    MODEL_SIZE,
    device="cpu",
    compute_type="int8",
    cpu_threads=CPU_THREADS,
)

app = FastAPI(title="migration-ai-worker", version="1.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe(request: Request) -> dict[str, Any]:
    audio = await request.body()
    if not audio:
        # 호출 측에서 audio 가 null/empty 인 회의도 들어올 수 있다(녹음 미캡처).
        # backend 의 RecordingService 가 빈 transcript 로 finalize 하도록 허용한다.
        return {"segments": []}

    logger.info("transcribe: bytes=%d", len(audio))

    try:
        # faster-whisper 는 file path / BinaryIO / ndarray 를 받는다.
        # BytesIO 로 감싸 디스크 통과 없이 메모리에서 바로 처리한다.
        segments_iter, _info = model.transcribe(
            io.BytesIO(audio),
            beam_size=BEAM_SIZE,
            language=LANGUAGE,
        )

        segments: list[dict[str, Any]] = []
        for seg in segments_iter:
            text = seg.text.strip()
            if not text:
                continue
            segments.append(
                {
                    "text": text,
                    # backend wire format 은 정수 ms (TranscriptionSegmentPayload).
                    "startMs": int(round(seg.start * 1000)),
                    "endMs": int(round(seg.end * 1000)),
                }
            )

        logger.info("transcribe done: %d segments", len(segments))
        return {"segments": segments}

    except Exception as exc:  # noqa: BLE001 — 외부 라이브러리 예외 일괄 매핑.
        logger.exception("transcribe failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
