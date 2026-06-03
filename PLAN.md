# Convene 마이그레이션 계획 (v1.0.0)

## 1. 목표

- **참조 레포**: `../web12-plum` (수정 금지, 참조만)
- **새 레포 루트**: `./` (= `D:/programming/boostcamp-2025-membership/convene`)
- **방향**: PLUM에서 강의 부가 기능을 걷어낸 "회의 링크 + 화상회의 + 채팅 + **구조화된 회의록**" 코어. C안(Mediasoup 유지, 기능 축소, AWS 이전) 채택.
- **v2.0.0(별도 작업)**: 노션 연동 — 이슈 ↔ 회의 링크, iframe 임베딩, 회의록을 노션 페이지에 자동 업로드. v1에서 회의록은 별도 페이지/DB로 완성하고, v2는 그 도큐먼트를 노션으로 푸시하는 어댑터만 얹는다.

## 2. v1 기능 (포함 / 제외)

| 포함                                                 | 제외                         |
|----------------------------------------------------|----------------------------|
| 화상회의 (Mediasoup SFU)                               | 강의자료 등록, PDF               |
| 실시간 채팅                                             | 제스처 인식, MediaPipe          |
| 닉네임 참가 (회원 없음)                                     | 투표(Poll), Q&A              |
| 회의 링크 단순 생성, hard limit 없음 + idle 1분 만료            | 호스트 권한                     |
| **STT(faster-whisper) + LLM 요약 + 채팅 로그 → 정제된 회의록** | 참여도 점수, 랭킹                 |
| 회의록 조회 페이지 (회의 목록 / 상세)                            | Prometheus/Grafana/Loki 스택 |
| Socket.IO 단일 인스턴스 (in-process)                     |                            |

**회의록 산출물**은 "발화 타임라인 누적"이 아니라 회사 회의록처럼 **요약 + 결정 사항 + 액션 아이템 + 핵심 토픽 + 참석자**로 구조화된 도큐먼트(아래 섹션#5 스키마).

## 3. 기술 스택 결정

- **백엔드**: NestJS 10 + Mediasoup 3 + Socket.IO 4. **`class-validator` + `class-transformer`로 DTO·payload 검증 일원화**.
- **프론트엔드**: **Next.js 14+ (App Router) + TypeScript + Zustand + mediasoup-client**, **`output: 'export'`로 정적 빌드 후 S3 + CloudFront 배포**. **SSR/RSC 데이터 fetch·미들웨어·Route Handler 사용 금지**, 모든 데이터는 클라이언트에서 `fetch(NEXT_PUBLIC_API_URL)`로 가져온다. 동적 라우트(`/meetings/[code]`, `/reports/[id]`)는 client component + `useParams()` + CloudFront SPA fallback(`/404 → /index.html`)으로 처리. 마이그레이션 단계엔 디자인 미적용, 기능 동작 위주의 최소 UI.
- **데이터**:
  - **Redis**: 실시간 회의 세션 상태(참가자, 시그널링 메타, idle 타이머). 백엔드 인스턴스 내 컨테이너.
  - **MongoDB Atlas (무료 티어)**: 회의록 도큐먼트. Mongoose 또는 공식 드라이버.
  - **오디오**: 백엔드 임시 디스크 버퍼 → STT 후 즉시 삭제. **장기 보존 X, S3 미사용**.
- **AI**: `ai-worker`(FastAPI + faster-whisper) 재도입. **LLM 요약은 Gemini로 시작하되 `SummarizerPort` 어댑터를 거치게 한다** (env로 다른 공급자 교체 가능).
- **인프라(비용 최소화)**:
  - **AWS 단일 인스턴스(EC2 t3.small 등) 1대**에 backend + ai-worker + redis를 docker-compose로 함께 띄움.
  - **프론트는 정적 빌드 산출물을 S3에 업로드 + CloudFront 배포**(서버리스, 단가만 부과).
  - **MongoDB Atlas 무료 티어**(외부).
  - 모니터링: NewRelic 무료 백엔드 1 에이전트.
- **모노레포**: pnpm + Turborepo 유지. `packages/shared-interfaces`는 **순수 interface + 이벤트 이름 상수만** export.

## 4. DTO / 검증 전략

프론트에 class-validator를 강제하지 않기 위해 **3-layer 분리**:

```
packages/shared-interfaces/   # 양쪽 import (wire format 계약)
  └── 순수 TS interface + 이벤트 이름 const

apps/backend/src/**/dto/      # 백엔드 전용
  └── class-validator/transformer DTO 클래스
      class FooDto implements SharedFooPayload { ... }
      → 글로벌 ValidationPipe(whitelist + forbidNonWhitelisted) 통과

apps/frontend/src/**/         # 프론트 전용
  └── 폼은 react-hook-form (+ 선택적 zod resolver). class-validator 미사용.
```

원칙: **모든 inbound HTTP/WS payload는 DTO로 받고, shared 타입은 검증 진입점이 아니다.**

## 5. 회의록 도큐먼트 스키마 (MongoDB)

PLAN에서는 **최상위 구조의 윤곽**만 둔다. 세부 내부 객체(참가자 항목·채팅 항목·transcript 세그먼트·summary 산출물·pipeline 상태 등)는 **구현 단계에서 각각 별도 인터페이스/스키마 파일로 분리**한다 (`reports/schemas/` 또는 `reports/types/` 하위).

```ts
interface MeetingReport {
  _id: ObjectId;
  meetingId: string;
  code: string;
  source: 'web' | 'notion-issue';   // v2 확장 지점
  externalRef?: ExternalReference;        // v2 노션 연동에서 채움
  startedAt: Date;
  endedAt: Date;

  participants: ParticipantEntry[]; // ↓ 별도 인터페이스로 분리
  chat: ChatEntry[];
  transcript: TranscriptSegment[];
  summary: ReportSummary;          // overview / decisions / actionItems / keyTopics
  pipeline: PipelineState;          // stage 상태 + 실패 로그

  pushedToNotion?: NotionPushResult; // v2에서 채움
}
```

세부 타입의 필드 후보는 구현 단계 PR에서 spec과 함께 확정. 이 도큐먼트가 v1·v2의 **단일 진실원**이며 v2 노션 어댑터(`NotionPort`)의 입력이다.

## 6. 디렉터리 구조

```
convene/
├── PLAN.md
├── ARCHITECTURE.md                  ← 협업용, 다음 단계에서 작성
├── apps/
│   ├── backend/
│   │   └── src/
│   │       ├── meeting/             (구) room/ 단순화 + 만료 + 회의록 생성 트리거
│   │       ├── chat/
│   │       ├── mediasoup/
│   │       ├── reports/             ★ 회의록 도메인 (Mongo 저장, 조회, LLM 호출)
│   │       │   ├── reports.controller.ts  (GET /reports, GET /reports/:id)
│   │       │   ├── reports.service.ts
│   │       │   ├── reports.repository.ts  (Mongo)
│   │       │   ├── schemas/               ★ MeetingReport + 하위 인터페이스 분리
│   │       │   ├── summarizer.port.ts     ★ LLM 어댑터 인터페이스
│   │       │   ├── adapters/gemini.summarizer.ts  ★ v1 기본 구현 (env 스위치)
│   │       │   └── notion.port.ts         ★ v1엔 NoopNotionPort, v2에서 구현 주입
│   │       ├── recording/           ★ 오디오 버퍼링 → ai-worker 호출 → 파일 삭제
│   │       │   └── transcriber.port.ts    ★ STT 어댑터 (faster-whisper / 추후 교체)
│   │       ├── redis/               실시간 상태만 (meeting/participant/chat)
│   │       └── common/
│   ├── frontend/                    Next.js (App Router, output: 'export' 정적 빌드)
│   │   ├── next.config.mjs          output: 'export', images.unoptimized
│   │   └── src/
│   │       └── app/
│   │           ├── page.tsx                 (회의 생성/입장)
│   │           ├── meetings/[code]/page.tsx (회의 화면, 'use client')
│   │           └── reports/
│   │               ├── page.tsx             (회의록 목록, client fetch)
│   │               └── [id]/page.tsx        (회의록 상세, 'use client' + useParams)
│   └── ai-worker/                   faster-whisper STT (현 PLUM에서 이식)
├── packages/
│   └── shared-interfaces/           interface + 이벤트 상수
└── docker-compose.local.yml         redis + mongo + ai-worker
```

## 7. 기존 PLUM 회의록 흐름 대비 개선점

1. **단일 도큐먼트 = 단일 진실원**: 현재 PLUM은 record/summarize가 분리돼 결합도가 낮은데, 회의록 도큐먼트 하나로 모든 산출물 통합 → v2 노션 어댑터의 입력이 명확.
2. **stage state machine**: `pipeline.sttStatus`/`summaryStatus`로 단계별 실패 추적·재시도. 현재 PLUM은 실패 가시성 부족.
3. **포트/어댑터 분리**: `TranscriberPort`(STT) / `SummarizerPort`(LLM) / `NotionPort`(업로드). 구현 교체·테스트 mocking이 자연스럽다.
4. **오디오 즉시 폐기**: 디스크 사용량 0, 개인정보 보존 부담 감소.
5. **회의록 산출물의 형태**가 "전체 요약 문단" → "구조화된 회의록(결정/액션/토픽)"으로 변경.
6. **회의 종료 이벤트 단일화**: `meeting.ended` 한 곳에서 (a) Mongo 도큐먼트 finalize → (b) STT → (c) 요약 → (d) v2의 노션 push까지 비동기 파이프라인.

## 8. v2 대비 추상화 포인트 (v1에 미리 둠)

- `MeetingReport.source` + `externalRef`
- `NotionPort` 인터페이스 + Noop 구현
- iframe 허용 헤더: `Content-Security-Policy: frame-ancestors`를 환경 변수 화이트리스트 (v1 디폴트 `'self'`)
- 회의 생성 API는 `source` 파라미터를 받아 v2의 `notion-issue` 분기를 받을 자리만 남김

## 9. 작업 단계 (TDD)

1. **PLAN.md 합의** ← 현재.
2. **ARCHITECTURE.md 작성** — 협업용. 모듈/이벤트 다이어그램, 회의록 파이프라인 상태도, 포트·어댑터 매핑, v2 확장 지점.
3. **레포 스캐폴딩** — pnpm + turbo + ESLint/Prettier + 각 앱 빈 스켈레톤. 빌드만 통과 후 stop.
4. **테스트 코드 먼저(spec only)**
   - shared-interfaces: 이벤트 상수/타입 컴파일 테스트
   - backend: `meeting.service.spec` (생성·idle 만료), DTO ValidationPipe spec, `chat.gateway.spec`, `reports.service.spec` (finalize·MongoDB mock), `reports.repository.spec`, `summarizer.port` fake 구현 spec, `transcriber.port` fake 구현 spec, e2e `meeting.e2e-spec` (생성→입장→만료→회의록 finalize), `reports.e2e-spec` (조회)
   - frontend: 회의 생성 폼·입장·채팅 유닛, 회의록 상세 렌더 SSR 테스트, playwright (생성→입장→채팅→종료→회의록 페이지에서 확인)
5. **백엔드 구현 순서**: meeting → chat → mediasoup signaling → recording 파이프라인(STT) → reports(요약·MongoDB).
6. **프론트 구현**: 회의 생성·입장·미디어·채팅 → 회의록 목록/상세 페이지.
7. **docker-compose.local + AWS 배포 스크립트 초안**.

각 단계 끝마다 사용자 확인.

## 10. 결정 사항 / 남은 TODO

- [x] LLM 공급자: **Gemini** (디폴트). `SummarizerPort` 어댑터를 통과시켜 추후 교체 가능.
- [x] MongoDB: **Atlas 무료 티어**.
- [x] 인프라 비용 최소화: **AWS 인스턴스 1대** + 프론트는 **S3 + CloudFront 정적 배포**.
- [x] 회의록 스키마는 PLAN에 윤곽만, 세부 인터페이스는 구현 단계에서 분리.
- [ ] PLAN.md 최종 합의
- [ ] ARCHITECTURE.md 상세도(다이어그램 포함 여부)
- [ ] CloudFront SPA fallback(`/404 → /index.html`) 설정 방식 — Function vs Distribution error response (배포 단계에서 확정)
