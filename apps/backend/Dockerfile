# 운영용 backend 이미지.
#
# - base 는 Debian-slim. Alpine 은 mediasoup prebuilt binary(glibc) 와 호환되지 않는다.
# - context 는 monorepo root 로 잡는다(pnpm workspace + @convene/shared-interfaces 가 필요).
#   `docker build -f apps/backend/Dockerfile .` 또는 docker-compose 의 `context: .` + `dockerfile: apps/backend/Dockerfile`.
# - mediasoup native worker 는 builder stage 에서만 빌드된다. runtime stage 에는 ffmpeg 만 필요.

# ============================================================================
# Stage 1: builder
#   - 전체 deps 설치(여기서 mediasoup worker 빌드)
#   - shared-interfaces → backend 순으로 빌드
#   - 마지막에 pnpm prune --prod 로 dev deps 제거(빌드된 mediasoup worker 바이너리는 유지)
# ============================================================================
FROM node:20-bookworm-slim AS builder

# mediasoup 가 prebuilt binary 다운로드에 실패하면 source 빌드로 fallback 한다.
# 이때 python3 + build-essential 이 필요하므로 안전망으로 설치한다.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 \
      build-essential \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# 1) workspace manifest 만 먼저 복사 → 소스 변경에도 install 레이어 캐시 유지.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared-interfaces/package.json ./packages/shared-interfaces/

# 2) 전체 deps 설치. mediasoup worker 가 이 단계에서 빌드된다.
#    HUSKY=0 으로 husky postinstall 비활성화(컨테이너엔 .git 이 없다).
RUN HUSKY=0 pnpm install --frozen-lockfile

# 3) 소스 복사 후 shared-interfaces → backend 순으로 빌드.
COPY apps/backend ./apps/backend
COPY packages/shared-interfaces ./packages/shared-interfaces

RUN pnpm --filter @convene/shared-interfaces build \
 && pnpm --filter @convene/backend build

# 4) dev deps 제거. mediasoup 는 dependencies 라 prune 후에도 worker 바이너리는 살아남는다.
RUN HUSKY=0 pnpm prune --prod

# ============================================================================
# Stage 2: runtime
#   - ffmpeg(recording BC 가 PlainTransport RTP → ffmpeg subprocess → Redis LIST).
#   - builder 에서 prune 된 node_modules + dist 만 복사. pnpm 재설치 없음.
#   - pnpm workspace 의 symlink(node_modules/@convene/shared-interfaces → packages/...)
#     를 유지하기 위해 monorepo 디렉터리 구조를 그대로 보존한다.
# ============================================================================
FROM node:20-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ffmpeg \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# monorepo 구조 그대로 복사. backend node_modules 가 packages/shared-interfaces 로
# symlink 되어 있으므로 양쪽 경로가 모두 존재해야 require 가 해석된다.
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/package.json ./apps/backend/
COPY --from=builder /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/packages/shared-interfaces/package.json ./packages/shared-interfaces/
COPY --from=builder /app/packages/shared-interfaces/dist ./packages/shared-interfaces/dist

WORKDIR /app/apps/backend

ENV NODE_ENV=production

# HTTP/WS 포트(server.config.ts DEFAULT_PORT). mediasoup RTC 포트 범위는 docker-compose 에서
# RTC_MIN_PORT/RTC_MAX_PORT env 와 함께 별도 노출한다.
EXPOSE 5000

CMD ["node", "dist/main.js"]