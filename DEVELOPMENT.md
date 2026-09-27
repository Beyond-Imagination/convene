# Development

Convene를 로컬에서 실행·테스트하고 기여하는 방법. 아키텍처(BC·레이어·MVVM·시퀀스)는 Notion 문서를 본다.

## 요구사항

| 도구               | 버전         | 용도                                          |
|------------------|------------|---------------------------------------------|
| Node.js · pnpm   | 20+ · 9+   | backend·frontend·shared 빌드와 실행 (pnpm 워크스페이스 + Turborepo) |
| Python           | 3.10+      | ai-worker (FastAPI + faster-whisper 음성 인식)        |
| ffmpeg           | —          | 회의 음성을 캡처해 STT용 PCM으로 변환 (`ffmpeg -version`)  |
| MongoDB          | 로컬 또는 Atlas | 회의·회의록 원본 저장                                |
| Redis            | 7+         | 진행 중 회의의 캐시·채팅·오디오 버퍼                        |
| Docker           | 선택         | Redis를 `docker-compose.local.yml`로 띄울 때        |

## 모노레포 구조

```
apps/
├── backend/     NestJS — 회의·미디어(Mediasoup)·채팅·회의록·노션 연동
├── frontend/    Next.js App Router — 정적 export(S3 + CloudFront)
└── ai-worker/   FastAPI — POST /transcribe (faster-whisper)
packages/
└── shared-interfaces/   backend ↔ frontend 공유 wire 타입 + 이벤트 이름 상수
```

한 기능을 따라갈 때는 `packages/shared-interfaces/src/`의 타입부터 본다. backend와 frontend는 이 타입으로만 약속한다.

## 실행

### 1. 설치와 환경 변수

```bash
pnpm install

cp apps/backend/.env.template apps/backend/.env
cp apps/frontend/.env.template apps/frontend/.env.local
cp apps/ai-worker/.env.template apps/ai-worker/.env   # 선택 — 기본값으로 동작
```

- **backend** — `GEMINI_API_KEY`(요약)와 `MONGO_URI`·`MONGO_DB_NAME`(저장)이 핵심이다. 나머지는 `.env.template` 주석을 따른다.
  - 템플릿의 값은 `[운영필수]`·`[게이트]`·`[튜닝]`으로 표시돼 있다.
  - **운영필수**: 로컬 기본값이 있지만 `NODE_ENV=production`에서 비어 있으면 부팅이 실패한다.
  - **게이트**: 비우면 그 기능만 꺼진 채 뜬다. 무엇이 꺼졌는지는 `backend listening` 로그의 `features`로 확인한다.
- **frontend** — `NEXT_PUBLIC_API_URL`(기본 `http://localhost:5000`)로 backend를 가리킨다. 빌드 시점에 박히므로 배포 빌드에는 운영 URL을 넣는다.
- 새 env 키를 추가하면 해당 앱의 `.env.template`도 함께 갱신한다.

### 2. 서비스 띄우기

```bash
docker compose -f docker-compose.local.yml up -d redis   # AOF 영속화된 Redis. `down -v`는 데이터를 지운다
pnpm dev                                                 # backend + frontend (turbo)
```

ai-worker는 Python이라 따로 띄운다. 없으면 회의록의 음성 전사가 되지 않는다.

```bash
cd apps/ai-worker
pip install -r requirements.txt
uvicorn main:app --port 8000
```

| 서비스           | 포트                    | 비고                          |
|---------------|-----------------------|-----------------------------|
| frontend      | 3000                  | http://localhost:3000       |
| backend       | 5000                  | HTTP + WebSocket(Socket.IO) |
| ai-worker     | 8000                  | STT                         |
| redis         | 6379                  |                             |
| mediasoup RTC | 40000–49999 (UDP/TCP) | `RTC_MIN/MAX_PORT`로 조정       |

## 테스트

```bash
pnpm test          # unit — backend=jest, frontend·shared=vitest
pnpm test:e2e      # backend e2e + frontend Playwright
pnpm build         # shared 빌드 + 타입체크 + frontend 정적 export
pnpm lint
pnpm build:shared  # shared-interfaces만 빌드
```

- 테스트 러너는 패키지마다 다르다. backend는 jest, frontend와 shared-interfaces는 vitest.
- **unit spec**은 대상 파일 옆 `src/` 안에 `*.spec.ts(x)`로 둔다. **e2e**는 `apps/*/test/`에만 둔다.
- backend는 domain → application(Port fake 사용) → infrastructure → interface(controller·gateway) → e2e 순으로 쌓는다.
- frontend는 ViewModel hook을 `renderHook`으로, View는 props만 넣어 렌더해 검증한다. 화면 흐름은 Playwright e2e로 본다.
- vitest는 타입체크를 하지 않는다. 타입 안전성은 `pnpm build`로 확인한다.
- `packages/shared-interfaces`를 고쳤으면 `pnpm build:shared`를 먼저 돌려야 backend·frontend가 새 타입을 본다.
- 에러 문구나 로그 출력은 단언하지 않는다. 에러 타입과 동작으로 검증한다.

## 기여

### 작업 흐름

1. `develop`에서 이슈 번호로 브랜치를 딴다(예: `CNV-61`). `main`에 직접 올리지 않는다.
2. TDD로 진행한다 — spec을 먼저 쓰고 실패(red)를 확인한 뒤 구현해서 통과(green)시킨다. 가능하면 커밋도 `test(...)` → `feat(...)`로 나눈다.
3. 커밋 메시지는 `type(scope): 한국어 설명`. type = `feat`/`fix`/`test`/`refactor`/`docs`/`chore`, scope = BC·앱 이름(`meeting`, `reports`, `frontend` 등).
4. PR 전에 루트에서 `pnpm lint`와 `pnpm test`를 통과시키고 `develop`으로 PR을 연다. 경로를 좁혀 돌리면 `test/`를 놓친다.

### 새 기능을 추가하는 순서

1. **shared-interfaces** — wire 타입·이벤트 이름 상수를 추가하고 `pnpm build:shared`.
2. **domain** — aggregate 메서드·Value Object와 spec.
3. **application** — service 메서드(필요하면 도메인 이벤트 발행)와 spec. 외부 의존은 Port fake로 대신한다.
4. **interface** — `<context>.dto.ts`에 DTO를 추가하고 controller·gateway와 spec. DTO 파일은 BC당 하나다.
5. **infrastructure** — repository·adapter 구현과 spec.
6. **frontend** — `shared/api` 또는 `shared/socket` → `useXxxViewModel` hook(+spec) → View 컴포넌트(+spec).

새 Bounded Context는 `apps/backend/src/<context>/{interface,application,domain,infrastructure}`와 `<context>.module.ts`를 만들고 `app.module.ts`에 등록한다.

### 코드 규칙

- **백엔드 계층** — BC마다 `interface → application → domain ← infrastructure` 4계층. `domain/`은 NestJS·mongoose·ioredis 등 프레임워크 import 금지.
  BC 간에는 도메인 이벤트(알림)나 상대 BC의 Application Service 주입(반환값이 필요할 때)으로만 결합한다. Aggregate·Repository는 BC 경계를 넘지 않는다.
- **Port** — DB·외부 API·서드파티처럼 교체 가능한 outbound에만 둔다. 인터페이스 옆에 같은 이름의 `Symbol` 토큰을 두고 `@Inject(TOKEN)`으로 주입한다.
  그 밖(controller → service, BC → BC, 로거·이벤트 버스·시계 등)은 구체 클래스를 주입한다.
- **검증** — 모든 HTTP·WS 입력은 DTO 클래스로 받는다. `class-validator` DTO는 backend에만 두고, `shared-interfaces`에는 순수 타입·상수만 둔다.
- **프런트 MVVM** — View 컴포넌트는 props만 받는다. `fetch`·`useEffect`·`useState`·socket·zustand setter는 `useXxxViewModel` hook에서만 쓴다.
  store·api·socket(Model)은 `src/shared/`에서 feature끼리 공유한다.
- **정적 export** — frontend는 `output: 'export'`다. `route.ts`·server action·middleware를 쓰지 않고, 데이터는 클라이언트에서 `NEXT_PUBLIC_API_URL`로 가져온다.
- **파일 나누기** — 개수가 아니라 "같이 고치는가"로 가른다. 같이 고칠 것은 한 파일에 두고, 긴 파일은 괜찮다. 폴더는 파일이 2개 이상일 때만 만든다.
- **주석** — 코드가 말하지 못하는 것만 한두 줄로 쓴다. 주석·JSDoc·테스트 라벨은 한국어, 식별자·파일명은 영어.
