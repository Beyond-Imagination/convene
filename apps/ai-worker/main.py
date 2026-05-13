"""migration v1 ai-worker — STT via faster-whisper.

Skeleton only. Real `/transcribe` endpoint and whisper model loading are added
in the implementation step (see PLAN.md §9 and CLAUDE.md workflow).
"""

from fastapi import FastAPI

app = FastAPI(title="migration-ai-worker", version="1.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
