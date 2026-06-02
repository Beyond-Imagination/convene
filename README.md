# web12-plum-migration

WebRTC 화상회의 + 실시간 채팅 + 구조화된 **회의록**(STT + LLM 요약)을 제공하는 모노레포 프로젝트.
`web12-plum` 을 슬림화해 마이그레이션한 **v1.0.0** 이며, AWS 단일 인스턴스 + 정적 호스팅 배포를 목표로 한다.

## 주요 기능

- **화상회의**: Mediasoup SFU 기반 다자 화상/음성, 화면 공유(동시 1인)
- **실시간 채팅**: Socket.IO
- **회의록**: 회의 종료 시 음성 STT(faster-whisper) → LLM 요약(Gemini) → 구조화 회의록(요약·결정사항·액션아이템·핵심토픽) 자동 생성
- 닉네임 기반 입장(회원 개념 없음), 회의 링크 공유 + 모달 입장, 회의 제목 지정, host 회의 종료 권한, idle 자동 종료
- 미디어 lazy acquisition — 입장 시 카메라/마이크를 잡지 않고, 사용자가 켤 때 취득

## 기술 스택

| 영역 | 스택 |
|------|------|
| Backend | NestJS 11 (CommonJS) · Mediasoup 3 · Socket.IO 4 · Redis(ioredis) · MongoDB(mongoose) |
| Frontend | Next.js 14 App Router · TypeScript · Zustand · mediasoup-client · Tailwind v3 (정적 export) |
| AI Worker | FastAPI · faster-whisper (STT, small 모델) |
| 모노레포 | pnpm 9 + Turborepo. 공유 타입은 `packages/shared-interfaces` |

## 모노레포 구조

```
migration/
├── apps/
│   ├── backend/    NestJS — Layered MVC + DDD 4-layer (interface/application/domain/infrastructure)
│   ├── frontend/   Next.js App Router — MVVM (components=View / hooks=ViewModel / stores·services=Model)
│   └── ai-worker/  FastAPI — POST /transcribe (faster-whisper STT)
├── packages/
│   └── shared-interfaces/   frontend ↔ backend 공유 wire 타입 + 이벤트 상수 (데코레이터 없음)
├── docker-compose.local.yml
└── PLAN.md · ARCHITECTURE.md · CLAUDE.md
```

## 빠른 시작

### 요구사항
- Node.js 20+, pnpm 9+
- ffmpeg (오디오 캡처/디코드 — `ffmpeg -version` 으로 확인)
- Python 3.10+ (ai-worker), Docker (선택 — `docker-compose.local.yml` 로 일괄 실행)

### 설치
```bash
pnpm install
```

### 환경 변수
`apps/backend/.env`:
```
GEMINI_API_KEY=...          # LLM 요약(Gemini)
MONGO_URI=...               # MongoDB Atlas 또는 로컬
MONGO_DB_NAME=migration-dev
```
프론트엔드는 `NEXT_PUBLIC_API_URL`(기본 `http://localhost:5000`)로 백엔드를 가리킨다.

### 개발 실행
```bash
pnpm dev          # turbo — backend(5000) + frontend(3000) 동시 실행
```
ai-worker 는 Python 이라 별도 실행한다:
```bash
cd apps/ai-worker
pip install -r requirements.txt
uvicorn main:app --port 8000
```
Redis 는 로컬(6379)에 떠 있어야 한다(Docker 등).

| 서비스 | 포트 |
|--------|------|
| backend | 5000 |
| frontend | 3000 |
| ai-worker | 8000 |
| redis | 6379 |

### 테스트 · 빌드 · 린트
```bash
pnpm test          # backend=jest, frontend·shared=vitest
pnpm test:e2e      # backend e2e + frontend Playwright
pnpm build         # shared 빌드 + 타입체크 + frontend 정적 export
pnpm lint
pnpm build:shared  # shared-interfaces 만 빌드 — 타입 변경 후 backend/frontend 가 참조한다
```
> 공유 타입(`packages/shared-interfaces`)을 수정하면 `pnpm build:shared` 로 먼저 빌드해야
> backend·frontend 가 새 타입을 본다.

## 아키텍처

- **Backend** — Layered MVC + DDD 4-layer. 의존 방향 `Interface → Application → Domain ← Infrastructure`.
  Domain 은 프레임워크 import 0, Application 은 Port 로만 Infrastructure 와 통신.
  Bounded Context: `meeting` · `chat` · `mediasoup` · `recording` · `reports`.
- **Frontend** — MVVM. View(`components/`)는 props 만 받는 dumb 컴포넌트로 fetch/socket/state 를
  직접 호출하지 않는다. 모든 상태·부수효과는 `useXxxViewModel` hook(ViewModel)에, 데이터는
  zustand store + api/socket service(Model)에 둔다.
- **회의록 파이프라인** — `meeting.ended` → STT → LLM 요약 → MongoDB finalize.
  cross-BC 결합은 도메인 이벤트(`@nestjs/event-emitter`) 또는 Port 로만 한다.

자세한 내용은 [`ARCHITECTURE.md`](./ARCHITECTURE.md)(도메인 모델·시퀀스·상태도),
[`PLAN.md`](./PLAN.md)(범위·작업 순서)를 참조한다.

## 협업 가이드

- **커밋 컨벤션**: `type(scope): 한국어 설명`. type = `feat`/`fix`/`test`/`refactor`/`docs`/`chore`,
  scope = BC·앱 이름(`meeting`, `reports`, `mediasoup`, `frontend` 등).
- **TDD**: spec(red) → impl(green) 순서로 진행하고, 가능하면 커밋도 분리한다(`test(...)` → `feat(...)`).
- **테스트 위치**: unit spec 은 `src/` 인라인(`*.spec.ts(x)`), e2e 는 `apps/*/test/`.
- **코드 주석·JSDoc·테스트 라벨은 한국어**로 쓴다(식별자·파일명은 영어 유지) — 협업자가 읽을 수 있게.
- **DTO 규칙**: class-validator 데코레이터 DTO 는 backend 에만 둔다. `shared-interfaces` 는 순수
  TS 타입·상수만 노출한다(데코레이터 금지).
- **View 규칙**: View 컴포넌트에서 `fetch`/`useEffect`/`useState`/socket/zustand setter 를 직접
  호출하지 않는다 — 전부 ViewModel hook 으로 옮긴다.
- AI 협업(예: Claude Code) 컨텍스트와 하드 룰은 [`CLAUDE.md`](./CLAUDE.md) 에 정리되어 있다.
```
