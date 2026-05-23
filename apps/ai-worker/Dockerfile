FROM python:3.11-slim

# faster-whisper 는 ffmpeg 로 audio decode 한다.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 모델을 빌드 시점에 미리 받아 docker layer 로 캐싱한다. main.py 수정으로 인한
# layer 재빌드 시에도 모델 다운로드가 다시 일어나지 않게 main.py COPY 위에 둔다.
# main.py 의 STT_MODEL_SIZE default 와 일치시킨다.
ARG STT_MODEL_SIZE=small
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('${STT_MODEL_SIZE}', device='cpu', compute_type='int8')"

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
