"""STT 설정 비교용 벤치 하네스.

`bench/samples/` 의 (오디오, 정답 전사) 쌍에 대해 여러 디코딩 설정을 돌려 CER/WER · 처리시간 · 피크 RSS 를 한 표로 비교한다.
설정 변경은 대부분 품질과 비용을 맞바꾸는 것이라 세 지표를 항상 같이 낸다.

설정마다 자식 프로세스를 새로 띄운다.
피크 RSS(`ru_maxrss`)는 프로세스 생애 최대값이라, 한 프로세스에서 연속 측정하면 앞 설정의 피크가 뒤에 그대로 남는다.

한국어는 어절 단위 WER 이 띄어쓰기 차이에 과민해서 **CER 을 주 지표**로 본다. WER 은 참고용으로만 같이 낸다.

사용법(설정 JSON 작성 예시는 bench/README.md):
    python bench/run_bench.py --configs bench/configs.mine.json --out bench/result.json
"""

from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import time
import unicodedata
import wave
from pathlib import Path
from typing import Any

try:
    # ru_maxrss 는 Unix 전용. Windows 개발 머신에서는 RSS 측정만 생략하고 나머지는 그대로 돈다.
    import resource
except ImportError:  # pragma: no cover - 플랫폼 분기
    resource = None  # type: ignore[assignment]

BENCH_DIR = Path(__file__).resolve().parent
SAMPLES_DIR = BENCH_DIR / "samples"

# 자식 프로세스 하나를 기다리는 상한. 첫 실행은 모델 다운로드가 끼므로 넉넉히 잡는다.
CONFIG_TIMEOUT_S = 3600


class Sample:
    """비교 대상 오디오 한 건과 그 정답 전사."""

    def __init__(self, name: str, audio_path: Path, reference: str, seconds: float) -> None:
        self.name = name
        self.audio_path = audio_path
        self.reference = reference
        self.seconds = seconds


def normalize(text: str) -> str:
    """CER/WER 비교 전 정규화.

    STT 가 맞히는 게 무의미한 차이(유니코드 정규형, 문장부호, 중복 공백)를 걷어낸다.
    문장부호는 유니코드 카테고리 P* 로 판별해 한글 문장부호까지 함께 지운다.
    """
    text = unicodedata.normalize("NFC", text).lower()
    stripped = "".join(" " if unicodedata.category(ch).startswith("P") else ch for ch in text)
    return " ".join(stripped.split())


def edit_distance(reference: list[str], hypothesis: list[str]) -> int:
    """두 시퀀스의 Levenshtein 거리. 두 행만 유지해 메모리를 O(min) 으로 둔다."""
    if len(reference) < len(hypothesis):
        reference, hypothesis = hypothesis, reference
    previous = list(range(len(hypothesis) + 1))
    for i, ref_item in enumerate(reference, start=1):
        current = [i]
        for j, hyp_item in enumerate(hypothesis, start=1):
            cost = 0 if ref_item == hyp_item else 1
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost))
        previous = current
    return previous[-1]


def wav_seconds(path: Path) -> float:
    with wave.open(str(path), "rb") as wav:
        return wav.getnframes() / float(wav.getframerate())


def load_samples() -> list[Sample]:
    """`<name>.wav` + `<name>.txt`(정답 전사) 쌍을 모은다. 화자별 하위 폴더까지 훑는다."""
    if not SAMPLES_DIR.is_dir():
        raise SystemExit(f"샘플 디렉터리가 없습니다: {SAMPLES_DIR}")

    samples: list[Sample] = []
    for audio_path in sorted(SAMPLES_DIR.rglob("*.wav")):
        # 비교용으로 남겨 둔 과거 수집분은 벤치 대상이 아니다.
        if any(part.startswith("prev-") for part in audio_path.relative_to(SAMPLES_DIR).parts):
            continue
        reference_path = audio_path.with_suffix(".txt")
        if not reference_path.is_file():
            print(f"  건너뜀: {audio_path.name} — 정답 전사({reference_path.name})가 없습니다.")
            continue
        reference = reference_path.read_text(encoding="utf-8").strip()
        if not reference:
            continue
        # 화자 폴더 이름을 붙여 결과 표에서 구분되게 한다.
        label = f"{audio_path.parent.name}/{audio_path.stem}"
        samples.append(Sample(label, audio_path, reference, wav_seconds(audio_path)))

    if not samples:
        raise SystemExit(
            f"측정할 샘플이 없습니다. {SAMPLES_DIR} 에 <name>.wav 와 <name>.txt 를 쌍으로 넣으세요."
        )
    return samples


def peak_rss_mb() -> float | None:
    if resource is None:
        return None
    # Linux 는 KB 단위로 돌려준다(컨테이너 기준).
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024


def run_config(config: dict[str, Any], samples: list[Sample], result_queue: mp.Queue) -> None:
    """자식 프로세스 진입점 — 설정 하나로 전 샘플을 전사하고 지표를 큐에 넣는다."""
    from faster_whisper import WhisperModel

    model_options = dict(config.get("model", {}))
    decode_options = dict(config.get("decode", {}))
    model_size = model_options.pop("size", "small")

    load_started = time.perf_counter()
    model = WhisperModel(model_size, device="cpu", **model_options)
    load_seconds = time.perf_counter() - load_started

    char_edits = char_length = word_edits = word_length = 0
    transcribe_seconds = 0.0
    per_sample: list[dict[str, Any]] = []

    for sample in samples:
        started = time.perf_counter()
        segments_iter, _info = model.transcribe(str(sample.audio_path), **decode_options)
        hypothesis = " ".join(segment.text.strip() for segment in segments_iter).strip()
        elapsed = time.perf_counter() - started
        transcribe_seconds += elapsed

        reference_norm = normalize(sample.reference)
        hypothesis_norm = normalize(hypothesis)
        # CER 은 띄어쓰기를 빼고 센다 — Whisper 의 한국어 띄어쓰기는 흔들리지만 의미 오류가 아니다.
        sample_char_edits = edit_distance(
            list(reference_norm.replace(" ", "")), list(hypothesis_norm.replace(" ", ""))
        )
        sample_char_length = len(reference_norm.replace(" ", ""))
        sample_word_edits = edit_distance(reference_norm.split(), hypothesis_norm.split())
        sample_word_length = len(reference_norm.split())

        char_edits += sample_char_edits
        char_length += sample_char_length
        word_edits += sample_word_edits
        word_length += sample_word_length

        per_sample.append(
            {
                "sample": sample.name,
                "cer": sample_char_edits / sample_char_length if sample_char_length else None,
                "seconds": round(elapsed, 2),
                "hypothesis": hypothesis,
            }
        )

    audio_seconds = sum(sample.seconds for sample in samples)
    result_queue.put(
        {
            "name": config.get("name", model_size),
            # 샘플별 평균이 아니라 편집거리 합 / 전체 길이 합(micro average).
            # 짧은 샘플이 과대 대표되지 않는다.
            "cer": char_edits / char_length if char_length else None,
            "wer": word_edits / word_length if word_length else None,
            "load_seconds": round(load_seconds, 2),
            "transcribe_seconds": round(transcribe_seconds, 2),
            "audio_seconds": round(audio_seconds, 2),
            # 오디오 길이 대비 처리시간. 참가자 수를 곱한 값이 1.0 을 넘으면 실시간 처리가 밀린다.
            "rtf": transcribe_seconds / audio_seconds if audio_seconds else None,
            "peak_rss_mb": peak_rss_mb(),
            "per_sample": per_sample,
        }
    )


def measure(config: dict[str, Any], samples: list[Sample]) -> dict[str, Any]:
    """설정 하나를 격리된 자식 프로세스에서 측정한다(피크 RSS 를 독립적으로 얻기 위함)."""
    result_queue: mp.Queue = mp.Queue()
    process = mp.Process(target=run_config, args=(config, samples, result_queue))
    process.start()
    try:
        result = result_queue.get(timeout=CONFIG_TIMEOUT_S)
    except Exception as exc:  # noqa: BLE001 — 한 설정의 실패로 나머지 비교를 멈추지 않는다.
        process.terminate()
        result = {"name": config.get("name", "?"), "error": str(exc)}
    process.join(timeout=30)
    return result


def _percent(value: float | None) -> str:
    return "-" if value is None else f"{value * 100:.2f}%"


def _number(value: float | None, digits: int = 2) -> str:
    return "-" if value is None else f"{value:.{digits}f}"


def format_table(results: list[dict[str, Any]]) -> str:
    lines = [
        "| 설정 | CER | WER | RTF | 전사(초) | 로드(초) | 피크 RSS(MB) |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for result in results:
        if "error" in result:
            lines.append(f"| {result['name']} | 실패: {result['error']} | - | - | - | - | - |")
            continue
        lines.append(
            f"| {result['name']} "
            f"| {_percent(result['cer'])} "
            f"| {_percent(result['wer'])} "
            f"| {_number(result['rtf'], 3)} "
            f"| {_number(result['transcribe_seconds'], 1)} "
            f"| {_number(result['load_seconds'], 1)} "
            f"| {_number(result['peak_rss_mb'], 0)} |"
        )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="faster-whisper 설정 비교 벤치")
    parser.add_argument("--configs", type=Path, required=True, help="비교할 설정 JSON 경로")
    parser.add_argument("--out", type=Path, help="결과 JSON 을 저장할 경로")
    args = parser.parse_args()

    if not args.configs.is_file():
        raise SystemExit(f"설정 파일이 없습니다: {args.configs} — 작성 예시는 bench/README.md 참고")
    configs = json.loads(args.configs.read_text(encoding="utf-8"))
    samples = load_samples()
    total_seconds = sum(sample.seconds for sample in samples)
    print(f"샘플 {len(samples)}건 / 오디오 {total_seconds:.1f}초 / 설정 {len(configs)}개\n")

    results = []
    for config in configs:
        print(f"→ {config.get('name', '?')} 측정 중...", flush=True)
        result = measure(config, samples)
        results.append(result)
        # 오래 걸리는 sweep 에서 중간 결과를 볼 수 있게 설정마다 바로 찍는다.
        print(format_table([result]).splitlines()[-1], flush=True)

    print("\n" + format_table(results))

    if args.out:
        args.out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n결과 저장: {args.out}")


if __name__ == "__main__":
    main()
