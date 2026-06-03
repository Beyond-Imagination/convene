#!/usr/bin/env bash
# Convene 단일 EC2 부트스트랩 — docker/compose 설치 + repo 클론 + .env 준비.
# Ubuntu 22.04/24.04 기준 (Amazon Linux 2023 은 아래 주석의 dnf 명령으로 대체).
#
# 사용:
#   1) EC2 에 SSH 접속.
#   2) 스크립트 실행:  REPO_URL=https://github.com/Beyond-Imagination/convene.git bash ec2-bootstrap.sh
#   3) GHCR 로그인(비공개 이미지 pull):  echo <PAT> | docker login ghcr.io -u <github-id> --password-stdin
#   4) /opt/convene/.env 를 .env.prod.template 기준으로 채운다.
#   5) cd /opt/convene && docker compose -f docker-compose.prod.yml up -d
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

echo "==> .env 준비"
if [ ! -f "$APP_DIR/.env" ]; then
	cp "$APP_DIR/.env.prod.template" "$APP_DIR/.env"
	echo "    => $APP_DIR/.env 를 편집해 값을 채우세요(DOMAIN/ANNOUNCED_IP/CORS_ORIGIN/GEMINI/MONGO)."
fi

cat <<'NEXT'

==> 부트스트랩 완료. 남은 단계:
    1) GHCR 로그인:  echo <PAT(read:packages)> | docker login ghcr.io -u <github-id> --password-stdin
    2) /opt/convene/.env 값 채우기
    3) cd /opt/convene && docker compose -f docker-compose.prod.yml up -d
    4) 보안그룹: 443/tcp, 40000-40199/udp, 40000-40199/tcp, 22/tcp(admin) 오픈.
       5000/8000/6379 는 열지 말 것(내부망 전용).
NEXT
