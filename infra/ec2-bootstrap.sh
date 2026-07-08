#!/usr/bin/env bash
# Convene 단일 EC2 부트스트랩 — docker/compose 설치 + repo 클론까지만.
# Ubuntu 22.04/24.04 기준 (Amazon Linux 2023 은 아래 주석의 dnf 명령으로 대체).
#
# .env·이미지 pull·재기동·GHCR 로그인은 모두 GitHub Actions(Deploy)가 SSH 로 수행한다.
# 특히 .env 는 GitHub Secrets/Variables 로 매 배포 시 생성되므로 EC2 에 수동 .env 가 필요 없다.
#
# 사용:
#   1) EC2 에 SSH 접속.
#   2) 스크립트 실행:  REPO_URL=https://github.com/Beyond-Imagination/convene.git bash ec2-bootstrap.sh
#   3) GitHub Secrets/Variables 등록 + DEPLOY_ENABLED=true → Deploy 워크플로 실행.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Beyond-Imagination/convene.git}"
APP_DIR="${APP_DIR:-/opt/convene}"
BRANCH="${BRANCH:-main}"

echo "==> docker 설치"
if ! command -v docker >/dev/null 2>&1; then
	curl -fsSL https://get.docker.com | sh
	sudo usermod -aG docker "$USER" || true
	# Amazon Linux 2023:  sudo dnf install -y docker && sudo systemctl enable --now docker
fi

echo "==> docker compose plugin 확인"
if ! docker compose version >/dev/null 2>&1; then
	sudo apt-get update && sudo apt-get install -y docker-compose-plugin
fi

echo "==> repo 클론/갱신 ($APP_DIR)"
if [ ! -d "$APP_DIR/.git" ]; then
	sudo mkdir -p "$APP_DIR"
	sudo chown "$USER":"$USER" "$APP_DIR"
	git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
else
	git -C "$APP_DIR" pull --ff-only
fi

cat <<'NEXT'

==> 부트스트랩 완료(docker + repo clone). 남은 단계는 모두 GitHub 쪽:
    1) Secrets:   EC2_HOST / EC2_USER / EC2_SSH_KEY / GEMINI_API_KEY / MONGO_URI
       Variables: DOMAIN / CORS_ORIGIN / ANNOUNCED_IP / RTC_MIN_PORT / RTC_MAX_PORT / MONGO_DB_NAME
                  (선택) GEMINI_MODEL / MEDIASOUP_WORKER_NUM / STT_MODEL_SIZE / DEPLOY_ENABLED=true
                  ANNOUNCED_IP = 이 호스트의 고정 퍼블릭 IP(EC2 EIP / Lightsail 정적 IP).
    2) Deploy 워크플로 실행 → .env 생성 + 빌드·배포 (GHCR 로그인 자동)
    3) 방화벽: 443/tcp, 443/udp, 40000-40199/udp, 40000-40199/tcp, 22/tcp(admin) 오픈.
       5000/8000/6379 는 열지 말 것(내부망 전용).
NEXT
