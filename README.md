# Convene

링크 하나로 시작하는 화상회의 — WebRTC 화상/음성 + 실시간 채팅 + 회의 종료 후 자동 생성되는
구조화 **회의록**(STT + LLM 요약)을 제공하는 모노레포 프로젝트. **v1.0.0**, AWS 단일 인스턴스 +
정적 호스팅 배포를 목표로 한다.

## 주요 기능

- **화상회의**: Mediasoup SFU 기반 다자 화상/음성, 화면 공유(동시 1인)
- **실시간 채팅**: Socket.IO
- **회의록**: 회의 종료 시 음성 STT(faster-whisper) → LLM 요약(Gemini) → 구조화 회의록(요약·결정사항·액션아이템·핵심토픽) 자동 생성
- 닉네임 기반 입장(회원 개념 없음), 회의 링크 공유 + 모달 입장, 회의 제목 지정, host 회의 종료 권한, idle 자동 종료
- 미디어 lazy acquisition — 입장 시 카메라/마이크를 잡지 않고, 사용자가 켤 때 취득

## 문서

| 문서                                         | 내용                                            |
|--------------------------------------------|-----------------------------------------------|
| [`README.md`](./README.md)                 | 이 문서 — 실행·스크립트·트러블슈팅                          |
| [`CODEBASE_GUIDE.md`](./CODEBASE_GUIDE.md) | 코드를 따라 읽고 기여하는 실무 가이드 — 디렉토리 맵·핵심 흐름 경로·기여 절차 |
| [`CLAUDE.md`](./CLAUDE.md)                 | AI 협업(Claude Code)용 컨텍스트와 하드 룰                |
| Notion (외부)                                | 아키텍처 패턴·도메인 모델·BC 맵·레이어·시퀀스·상태도·ADR           |

> 처음이라면 README → Notion(아키텍처) → CODEBASE_GUIDE(섹션#2 핵심 흐름) 순서를 권장한다.

## 기술 스택

| 영역        | 스택                                                                                        |
|-----------|-------------------------------------------------------------------------------------------|
| Backend   | NestJS 11 (CommonJS) · Mediasoup 3 · Socket.IO 4 · Redis(ioredis) · MongoDB(mongoose)     |
| Frontend  | Next.js 14 App Router · TypeScript · Zustand · mediasoup-client · Tailwind v3 (정적 export) |
| AI Worker | FastAPI · faster-whisper (STT, small 모델)                                                  |
| 모노레포      | pnpm 9 + Turborepo. 공유 타입은 `packages/shared-interfaces`                                   |

## 모노레포 구조

```
convene/
├── apps/
│   ├── backend/    NestJS — Layered MVC + DDD 4-layer (interface/application/domain/infrastructure)
│   ├── frontend/   Next.js App Router — MVVM (components=View / hooks=ViewModel / stores·services=Model)
│   └── ai-worker/  FastAPI — POST /transcribe (faster-whisper STT)
├── packages/
│   └── shared-interfaces/   frontend ↔ backend 공유 wire 타입 + 이벤트 상수 (데코레이터 없음)
├── docker-compose.local.yml
└── README · CODEBASE_GUIDE · CLAUDE   (아키텍처·계획 문서는 Notion)
```

Bounded Context: `meeting`(채팅 포함) · `mediasoup` · `recording` · `reports` + `shared-kernel`.
자세한 매핑은 Notion 아키텍처 문서, 코드 흐름은 [`CODEBASE_GUIDE.md`](./CODEBASE_GUIDE.md) 섹션#2.

## 빠른 시작

### 요구사항

- Node.js 20+, pnpm 9+
- ffmpeg (오디오 캡처/디코드 — `ffmpeg -version`으로 확인)
- Python 3.10+ (ai-worker), Docker (선택 — `docker-compose.local.yml`로 일괄 실행)
- MongoDB(로컬 또는 Atlas), Redis(로컬 6379)

### 설치

```bash
pnpm install
```

### 환경 변수

각 앱의 `.env.template`을 복사해 채운다.

```bash
cp apps/backend/.env.template apps/backend/.env
cp apps/frontend/.env.template apps/frontend/.env.local
cp apps/ai-worker/.env.template apps/ai-worker/.env   # 선택 — 모두 기본값으로 동작
```

- **backend** 핵심: `GEMINI_API_KEY`(LLM 요약), `MONGO_URI`·`MONGO_DB_NAME`(회의록 저장).
  나머지(Redis·Mediasoup·CORS·포트 등)는 `.env.template` 주석 참조.
- **frontend**: `NEXT_PUBLIC_API_URL`(기본 `http://localhost:5000`)로 백엔드를 가리킨다.
  정적 export 라 빌드 타임에 인라인되므로 배포 빌드 시 운영 백엔드 URL을 넣어야 한다.

### 개발 실행

```bash
pnpm dev          # turbo — backend(5000) + frontend(3000) 동시 실행
```

ai-worker는 Python이라 별도 실행한다:

```bash
cd apps/ai-worker
pip install -r requirements.txt
uvicorn main:app --port 8000
```

Redis는 로컬(6379)에 떠 있어야 한다 — `docker compose -f docker-compose.local.yml up -d redis`.
회의 원장은 MongoDB지만 진행 중인 회의의 채팅·오디오 버퍼는 redis에만 있으므로,
AOF 영속화가 걸린 이 컨테이너를 쓴다(`down -v` 금지).

| 서비스           | 포트                    | 비고                                 |
|---------------|-----------------------|------------------------------------|
| backend       | 5000                  | HTTP + WebSocket(Socket.IO)        |
| frontend      | 3000                  | Next.js dev                        |
| ai-worker     | 8000                  | FastAPI(STT)                       |
| redis         | 6379                  | 회의 캐시·채팅·오디오 버퍼 (회의 원장은 MongoDB)     |
| mediasoup RTC | 40000–49999 (UDP/TCP) | WebRTC 미디어. `RTC_MIN/MAX_PORT`로 조정 |

### 테스트 · 빌드 · 린트

```bash
pnpm test          # backend=jest, frontend·shared=vitest
pnpm test:e2e      # backend e2e + frontend Playwright
pnpm build         # shared 빌드 + 타입체크 + frontend 정적 export
pnpm lint
pnpm build:shared  # shared-interfaces만 빌드 — 타입 변경 후 backend/frontend가 참조한다
```

> 공유 타입(`packages/shared-interfaces`)을 수정하면 `pnpm build:shared`로 먼저 빌드해야
> backend·frontend가 새 타입을 본다. vitest는 타입체크를 하지 않으므로 타입 안전성은 `pnpm build`로 확인한다.

## 사용 흐름

1. 메인(`/`)에서 **회의 만들기**(닉네임 + 제목 선택) → 회의 생성자는 host 권한(종료 권한) 보유
2. 회의 URL `/meetings/{code}`을 공유 → 받은 사람은 메인의 **입장** 폼 또는 **링크 직접 접속 시 닉네임 모달**로 입장
3. 회의 중 화상/음성/화면공유/채팅. 카메라·마이크는 기본 OFF이며 버튼으로 켠다
4. host가 **회의 종료**(또는 전원 퇴장 후 idle 자동 종료) → STT·요약 파이프라인이 회의록 생성
5. `/reports` 목록 → `/reports/{id}` 상세에서 회의록(요약·결정사항·액션아이템·핵심토픽·채팅·transcript) 확인

## 아키텍처 (요약)

- **Backend** — Layered MVC + DDD 4-layer. 의존 방향 `Interface → Application → Domain ← Infrastructure`.
  Domain은 프레임워크 import 0, Application은 Port로만 Infrastructure와 통신. BC 간 결합은 도메인
  이벤트(`@nestjs/event-emitter`) 또는 Port로만.
- **Frontend** — MVVM. View(`components/`)는 props만 받는 dumb 컴포넌트. 상태·부수효과는
  `useXxxViewModel` hook(ViewModel)에, 데이터는 zustand store + api/socket service(Model)에.
- **회의록 파이프라인** — `meeting.ended` → STT(faster-whisper) → LLM 요약(Gemini) → MongoDB finalize.

상세: Notion 아키텍처 문서(설계·시퀀스·상태도), [`CODEBASE_GUIDE.md`](./CODEBASE_GUIDE.md)(코드 흐름).

## 협업 가이드

- **커밋 컨벤션**: `type(scope): 한국어 설명`. type = `feat`/`fix`/`test`/`refactor`/`docs`/`chore`,
  scope = BC·앱 이름(`meeting`, `reports`, `mediasoup`, `frontend` 등).
- **TDD**: spec(red) → impl(green) 순서로 진행하고, 가능하면 커밋도 분리한다(`test(...)` → `feat(...)`).
- **테스트 위치**: unit spec은 `src/` 인라인(`*.spec.ts(x)`), e2e는 `apps/*/test/`.
- **코드 주석·JSDoc·테스트 라벨은 한국어**로 쓴다(식별자·파일명은 영어 유지).
- **DTO 규칙**: class-validator 데코레이터 DTO는 backend에만. `shared-interfaces`는 순수 타입·상수만.
- **View 규칙**: View에서 `fetch`/`useEffect`/`useState`/socket/zustand setter 직접 호출 금지 — ViewModel hook으로.

기여 절차(새 기능·새 BC·테스트 패턴)는 [`CODEBASE_GUIDE.md`](./CODEBASE_GUIDE.md) 섹션#3 참조.

## 트러블슈팅

- **`EADDRINUSE` 또는 옛 코드 응답** — dev 재기동 시 좀비 node 프로세스. 포트(5000/3000/8000) LISTEN
  을 확인하고 남은 프로세스를 종료한다.
- **오디오/STT가 동작하지 않음** — 호스트에 `ffmpeg` 설치 여부, ai-worker(8000) 실행 여부 확인.
- **회의록 요약이 비어 있음** — `GEMINI_API_KEY` 미설정 시 `NoopSummarizer`로 동작(요약 없이 회의록만 생성). 정상.
- **회의 화면이 검게 보임** — 입장 시 카메라/마이크는 기본 OFF(lazy). 컨트롤 바에서 켠다.
- **원격 미디어가 안 보임(로컬 외 네트워크)** — `ANNOUNCED_IP`를 클라이언트가 접근 가능한 IP(운영=공인 IP)로 설정.
- **타입 변경이 반영되지 않음** — `shared-interfaces` 수정 후 `pnpm build:shared` 실행.
