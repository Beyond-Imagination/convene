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
SWAP_FILE="${SWAP_FILE:-/swapfile}"
SWAP_SIZE="${SWAP_SIZE:-2G}"

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

echo "==> swapfile 확인 (${SWAP_SIZE})"
# Lightsail 2GB 인스턴스는 기본 swap 이 없다. STT 모델 콜드로드 스파이크와
# 컨테이너 mem_limit 합계가 물리 RAM 을 잠깐 넘는 구간을 흡수한다.
# 정상 동작 시 거의 쓰이지 않으므로 swappiness 를 낮게 둬 상시 스왑을 막는다.
if ! sudo swapon --show | grep -q "$SWAP_FILE"; then
	sudo fallocate -l "$SWAP_SIZE" "$SWAP_FILE" || sudo dd if=/dev/zero of="$SWAP_FILE" bs=1M count=2048
	sudo chmod 600 "$SWAP_FILE"
	sudo mkswap "$SWAP_FILE"
	sudo swapon "$SWAP_FILE"
	grep -q "^$SWAP_FILE" /etc/fstab || echo "$SWAP_FILE none swap sw 0 0" | sudo tee -a /etc/fstab
	echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-convene-swap.conf
	sudo sysctl -w vm.swappiness=10
else
	echo "    이미 활성화됨 — 건너뜀"
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

NEXT
