# Codebase Guide

신규 협업자가 **코드를 따라 읽고 기여**하기 위한 실무 가이드. "왜 이렇게 설계했나"(아키텍처)는
Notion 문서(구 `ARCHITECTURE.md`)를 본다.

## 0. 어디서부터 읽나

1. [`README.md`](./README.md) — 실행/스크립트
2. Notion 아키텍처 문서 — BC·레이어·MVVM
3. 이 문서 섹션#2 핵심 흐름 — 실제 코드를 흐름 따라
4. 기여할 BC의 `domain/` → `application/` → `interface/`/`infrastructure/` 순으로 그 모듈만

읽기 팁: **wire 계약은 항상 `packages/shared-interfaces/src/`** 에 있다(이벤트 이름·HTTP/WS 타입).
백엔드 ↔ 프런트가 이 타입으로만 약속하므로, 한 기능을 추적할 때 여기서 타입을 먼저 본다.

## 1. 디렉토리 맵

```
apps/backend/src/<context>/        meeting · mediasoup · recording · reports
  ├── interface/    controllers · gateways · dto(class-validator)
  ├── application/  *.service.ts · *.listener.ts
  ├── domain/       {aggregate}.ts · value-objects/ · ports/  (프레임워크 import 0)
  └── infrastructure/  repository·adapter 구현
  + shared-kernel/(공유 VO·이벤트 payload·Clock·EventPublisher·DomainError·DomainExceptionFilter), config/ redis/ mongo/

apps/frontend/src/
  ├── app/          라우트(정적 export): page.tsx, meetings/[code], reports, reports/[id]
  ├── feature/<name>/{components(View), hooks(ViewModel)}    meeting · reports
  └── shared/{api(fetch + ApiError), socket(io+device), stores(zustand+sessionStorage), hooks(useRouteSegment)}

apps/ai-worker/    FastAPI main.py — POST /transcribe (faster-whisper)
packages/shared-interfaces/src/   meeting.ts · mediasoup.ts · reports.ts · events.ts
```

## 2. 핵심 흐름

레이어 라벨로 단계를 읽는다. 기호: `→` 직접 호출, `⇢` 도메인 이벤트(event bus), `«` 응답/broadcast.
레이어: **View** · **VM**(ViewModel) · **API**(fetch) · **Ctrl**(controller) · **GW**(gateway) · **Svc**(service) · **Repo**.

### 2.1 회의 생성 — `POST /meetings`

1. **View** `CreateMeetingForm`
2. **VM** `useCreateMeetingViewModel`
   — createMeeting({source,title}) · setNickname · saveHostToken · router.push
3. **API** `meeting.api.createMeeting` → `POST /meetings`
4. **Ctrl** `meeting.controller.createMeeting`
5. **Svc** `meeting.service.createMeeting`
   — Meeting.create · repo.save · ⇢ `meeting.created`
6. **Repo** `redis-meeting.repository.save`

« 응답 `{ code, source, startedAt, hostToken }` — hostToken 보유자 = host 권한

### 2.2 회의 입장 (닉네임 게이트)

1. **View** `JoinMeetingForm` → `useJoinMeetingViewModel` (setNickname · router.push `'/meetings/{code}'`)
   - 직접 링크 시 nickname 없으면 `MeetingPageClient`가 `NicknameGate` + `useNicknameGateViewModel`
2. **VM** `useMeetingViewModel` — connectMeetingSocket() · emit `meeting:join`
3. **GW** `meeting.gateway.handleJoin`
4. **Svc** `meeting.service.joinMeeting`
   — Meeting.addParticipant · ⇢ `meeting.participant.joined`

« `meeting:participantJoined`(전체) · `meeting:participants`(본인 = 기존 목록)

### 2.2.1 재시작 복구 (부팅 시 1회)

`meeting-recovery.service`(OnApplicationBootstrap) — 회의는 redis에 남지만 방·socket은 프로세스와 함께 사라진다.

1. `repo.listOpenCodes()` → 회의마다 ⇢ `meeting.opened` (mediasoup 방 재생성)
2. 남아 있는 참가자 = 유령(`participantId` = socket.id) → `meeting.service.leaveMeeting` ⇢ `meeting.participant.left`
3. 유령이 있었던 회의만 `markActive(now)` — 재접속에 `idleTimeout` 유예. 비어 있던 회의는 다음 idle sweep이 정리

### 2.3 미디어 (Mediasoup SFU)

1. **VM** `useMediasoupViewModel`
   — getRtpCapabilities → createTransport(send/recv) → produce/consume RPC
   - lazy: 입장 시 getUserMedia 안 함 — toggle이 켤 때 취득+produce, 끄면 close + `CLOSE_PRODUCER`
2. **GW** `mediasoup.gateway` (mediasoup:\* RPC)
3. **Svc** `mediasoup-signaling.service` produce/consume/…
   — **Domain** `participant-media`(상태) · **Infra** worker pool·router·transport 어댑터

보조 흐름:

- **admit**: `meeting.participant.joined` ⇢ mediasoup lifecycle listener가 room/participant 준비
- **produce**: ⇢ `mediasoup.producer.created` → gateway가 « `mediasoup:newProducer`
- **audio**: produce(audio) → `FfmpegAudioCaptureAdapter`(ffmpeg PCM) → Redis 버퍼(STT용)

### 2.4 채팅 (Meeting BC 내)

1. **View** `ChatPanel` → `useChatViewModel` (emit `meeting:chat` · 수신 `meeting:chatPosted`)
2. **GW** `meeting.gateway.handleChat`
3. **Svc** `meeting.service.postChat`
   — ChatEntry · markActive(idle 리셋) · ChatRepository.append(Redis)

« `meeting:chatPosted` — 회의록엔 종료 시 `meeting.ended` payload로 이관

### 2.5 회의록 (종료 → STT → 요약 → 조회)

1. **종료** `meeting.service.closeMeeting`(host, DELETE) | `detectIdleAndClose`(idle)
   — ⇢ `meeting.ended` (참가자·chat·title 스냅숏)
2. **draft** `report-meeting-lifecycle.listener` → `report-finalization.service.createDraft`
   — MeetingReport.fromEndedMeeting · Mongo save · ⇢ `report.transcription.requested`
3. **STT** `recording.service`(requested 구독) → TranscriberPort → ai-worker `POST /transcribe`
   — ⇢ `report.transcription.completed` (회의 중엔 `PartialTranscriptionScheduler`가 30s마다 부분 STT 누적)
4. **요약** `report-finalization.service.completeTranscription` → SummarizerPort.summarize(Gemini)
   — MeetingReport.applySummary · finalize · ⇢ `report.finalized`
5. **조회** `GET /reports` · `/reports/:id` → report-serialize(도메인→wire)
   — `useReportListViewModel` / `useReportDetailViewModel` → ReportList / ReportDetail

재요약(관리자):

1. `POST /reports/:id/resummarize` — AdminGuard(Bearer `ADMIN_API_TOKEN`, 상수 시간 비교)
2. `report-finalization.service.resummarize` — STT done & 요약 종료 시에만 저장 transcript+chat을 이용해 재요약
3. `MeetingReport.replaceSummary`(실패 시 상태 요약 문서 상태 미변경) · ⇢ `report.summary.completed` + `report.finalized`

> 회의록 제목 규칙: 사용자 지정 `title ?? summary.title ?? null` (report-serialize).

## 3. 기여 절차

### 3.1 새 HTTP/WS 기능 추가 (TDD: spec red → impl green, 커밋 분리)

1. `packages/shared-interfaces/src/*.ts`에 wire 타입/이벤트 상수 추가 → `pnpm build:shared`.
2. **domain**: aggregate 메서드/VO + spec.
3. **application**: service 메서드(+이벤트 발행) + spec(Port fake 사용).
4. **interface**: dto(class-validator) + controller/gateway + spec.
5. **infrastructure**: repository/adapter 구현 + spec.
6. **frontend**: `shared/api` 또는 `shared/socket` → `useXxxViewModel`(+spec) → View(props, +spec).
   > 도메인 입력은 명시 타입, 외부 경계(controller/service command)는 optional 허용 후 `?? null` 같은
   > 정규화를 두면 fixture 수정 범위가 준다(회의 제목 작업 참고).

### 3.2 새 Bounded Context 추가

- `apps/backend/src/<context>/{interface,application,domain,infrastructure}` + `<context>.module.ts` 생성 →
  `app.module.ts` imports 등록.
- 다른 BC와는 **도메인 이벤트(`shared-kernel` payload) 또는 Port** 로만 결합. 직접 import 금지.
- 비-Nest application service는 모듈의 `useFactory`로 Port 구현을 주입한다.

### 3.3 테스트

- **backend** = jest. unit `*.spec.ts`는 `src/` 인라인, e2e는 `apps/backend/test/`.
  순서: domain → application(Port fake) → infrastructure → interface(controller/gateway) → e2e.
- **frontend** = vitest. ViewModel은 `renderHook`/Harness 폼, View는 props 렌더. e2e는 Playwright(`apps/frontend/test/`).
  vitest는 타입체크를 안 하므로 타입 안전성은 `pnpm build`로 확인한다.
- 공유 타입 수정 후에는 반드시 `pnpm build:shared`(안 하면 backend/frontend가 옛 타입을 본다).

## 4. 자주 보는 파일 · 트러블슈팅

- **wire 계약**: `packages/shared-interfaces/src/{meeting,mediasoup,reports,events}.ts`
- **env 해석**: `apps/backend/src/config/*.ts`(키·기본값의 단일 진실원), 템플릿은 `apps/*/.env.template`
- **전역 파이프/CORS**: `apps/backend/src/main.ts`. 도메인 에러 → HTTP 매핑은 `shared-kernel/interface/domain-exception.filter.ts`(`DomainError.httpStatus` 사용)
- 재요약 401/403: `ADMIN_API_TOKEN` 미설정시 엔드포인트 비활성(403), 설정 시 `Authorization: Bearer <token>` 불일치는 401(`reports/interface/guards/admin.guard.ts`)
- `EADDRINUSE`/옛 코드 응답: dev 재기동 시 좀비 node 프로세스 — 포트(5000/3000/8000) LISTEN 확인 후 종료
- 오디오/STT 동작 안 함: 호스트에 `ffmpeg` 설치 확인, ai-worker(8000) 실행 확인
- 회의록 요약이 비어 있음: `GEMINI_API_KEY` 미설정 시 `NoopSummarizer`로 동작(정상)
- 미디어가 검은 화면: 입장 시 OFF가 기본(lazy). 카메라/마이크 켜기 버튼으로 취득
