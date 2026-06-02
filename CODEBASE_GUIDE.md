# Codebase Guide

신규 협업자가 **코드를 따라 읽고 기여**하기 위한 실무 가이드. "왜 이렇게 설계했나"는
[`ARCHITECTURE.md`](./ARCHITECTURE.md), 범위·계획은 [`PLAN.md`](./PLAN.md)를 본다.

## 0. 어디서부터 읽나

1. [`README.md`](./README.md) — 실행/스크립트
2. [`ARCHITECTURE.md`](./ARCHITECTURE.md) 섹션#2~4 — BC·레이어·MVVM
3. 이 문서 섹션#2 핵심 흐름 — 실제 코드를 흐름 따라
4. 기여할 BC 의 `domain/` → `application/` → `interface/`/`infrastructure/` 순으로 그 모듈만

읽기 팁: **wire 계약은 항상 `packages/shared-interfaces/src/`** 에 있다(이벤트 이름·HTTP/WS
타입). 백엔드 ↔ 프런트가 이 타입으로만 약속하므로, 한 기능을 추적할 때 여기서 타입을 먼저 본다.

## 1. 디렉토리 맵

```
apps/backend/src/<context>/        meeting · mediasoup · recording · reports
  ├── interface/    controllers · gateways · dto(class-validator)
  ├── application/  *.service.ts · *.listener.ts
  ├── domain/       {aggregate}.ts · value-objects/ · ports/  (프레임워크 import 0)
  └── infrastructure/  repository·adapter 구현
  + shared-kernel/(공유 VO·이벤트 payload·Clock·EventPublisher), config/ redis/ mongo/

apps/frontend/src/
  ├── app/          라우트(정적 export): page.tsx, meetings/[code], reports, reports/[id]
  ├── feature/<name>/{components(View), hooks(ViewModel)}    meeting · reports
  └── shared/{api(fetch), socket(io+device), stores(zustand)}

apps/ai-worker/    FastAPI main.py — POST /transcribe (faster-whisper)
packages/shared-interfaces/src/   meeting.ts · mediasoup.ts · reports.ts · events.ts
```

## 2. 핵심 흐름 (파일:함수 경로)

화살표는 호출/이벤트 방향. `→` 직접 호출, `⇢` 도메인 이벤트(event bus).

### 2.1 회의 생성 (HTTP)

```
CreateMeetingForm.tsx (View)
→ useCreateMeetingViewModel.ts  handleSubmit: createMeeting({source,title}) + setNickname + saveHostToken + router.push
→ shared/api/meeting.api.ts  createMeeting  →  POST /meetings
→ meeting/interface/controllers/meeting.controller.ts  createMeeting
→ meeting/application/meeting.service.ts  createMeeting  →  Meeting.create + repository.save + publish meeting.created
→ meeting/infrastructure/redis-meeting.repository.ts  save
응답: { code, source, startedAt, hostToken }   (hostToken 은 생성자만 보관 = host 권한)
```

### 2.2 회의 입장 (닉네임 게이트 포함)

```
홈에서: JoinMeetingForm.tsx → useJoinMeetingViewModel.ts  setNickname + router.push('/meetings/{code}')
링크 직접: MeetingPageClient.tsx 가 nickname 없으면 NicknameGate.tsx + useNicknameGateViewModel.ts (setNickname)
→ MeetingPageClient.tsx  nickname 생기면 useMeetingViewModel 이 socket 생성
→ useMeetingViewModel.ts  connectMeetingSocket() + emit meeting:join
→ meeting/interface/gateways/meeting.gateway.ts  handleJoin
→ meeting.service.ts  joinMeeting  →  Meeting.addParticipant + publish meeting.participant.joined
broadcast: meeting:participantJoined(전체) + meeting:participants(본인, 기존 목록)
```

### 2.3 미디어 (Mediasoup SFU)

```
useMediasoupViewModel.ts  — getRtpCapabilities → createTransport(send/recv) → produce/consume RPC
  · 미디어 lazy: 입장 시 getUserMedia 안 함. toggleAudio/Video 가 켤 때 취득+produce, 끄면 close+CLOSE_PRODUCER
→ mediasoup/interface/gateways/mediasoup.gateway.ts  mediasoup:* RPC 핸들러
→ mediasoup/application/mediasoup-signaling.service.ts  produce/consume/…
→ domain/participant-media.ts (상태) + infrastructure/ worker pool·router·transport 어댑터
admit: meeting.participant.joined ⇢ mediasoup lifecycle listener 가 room/participant 준비
produce 시: publish mediasoup.producer.created ⇢ gateway 가 mediasoup:newProducer 로 broadcast
오디오: produce(audio) → FfmpegAudioCaptureAdapter 가 ffmpeg 로 PCM 추출 → Redis 버퍼(STT용)
```

### 2.4 채팅 (Meeting BC 내)

```
ChatPanel.tsx (View)
→ useChatViewModel.ts  emit meeting:chat / 수신 meeting:chatPosted
→ meeting.gateway.ts  handleChat
→ meeting.service.ts  postChat  →  ChatEntry 생성 + markActive(idle 리셋) + ChatRepository.append(Redis)
→ broadcast meeting:chatPosted (회의록에는 종료 시 meeting.ended payload 로 이관)
```

### 2.5 회의록 (종료 → STT → 요약 → 조회)

```
종료: meeting.service.ts  closeMeeting(host, DELETE /meetings/:code) 또는 detectIdleAndClose(idle 스케줄러)
      →  publish meeting.ended (payload: 참가자·chat·title 스냅숏)
draft: reports/application/report-meeting-lifecycle.listener.ts  onMeetingEnded
      →  report-finalization.service.ts  createDraft  →  MeetingReport.fromEndedMeeting + MongoReportRepository.save
      →  publish report.transcription.requested
STT:  recording/application/recording.service.ts (requested 구독)  →  TranscriberPort.transcribe
      →  recording/infrastructure/http.transcriber.ts  →  ai-worker POST /transcribe (faster-whisper)
      →  publish report.transcription.completed   (회의 중엔 PartialTranscriptionScheduler 가 30s 마다 부분 STT 누적)
요약: report-finalization.service.ts  completeTranscription  →  SummarizerPort.summarize (GeminiSummarizer)
      →  MeetingReport.applySummary → finalize → publish report.finalized
조회: reports/interface/controllers  GET /reports, /reports/:id  →  report-serialize.ts (도메인→wire)
      →  frontend useReportListViewModel / useReportDetailViewModel → ReportList / ReportDetail
회의록 제목: 사용자 지정 title ?? summary.title ?? null (report-serialize.ts)
```

## 3. 기여 절차

### 3.1 새 HTTP/WS 기능 추가 (TDD: spec red → impl green, 커밋 분리)

1. `packages/shared-interfaces/src/*.ts` 에 wire 타입/이벤트 상수 추가 → `pnpm build:shared`.
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
- 다른 BC 와는 **도메인 이벤트(`shared-kernel` payload) 또는 Port** 로만 결합. 직접 import 금지.
- 비-Nest application service 는 모듈의 `useFactory` 로 Port 구현을 주입한다.

### 3.3 테스트

- **backend** = jest. unit `*.spec.ts` 는 `src/` 인라인, e2e 는 `apps/backend/test/`.
  순서: domain → application(Port fake) → infrastructure → interface(controller/gateway) → e2e.
- **frontend** = vitest. ViewModel 은 `renderHook`/Harness 폼, View 는 props 렌더. e2e 는 Playwright(`apps/frontend/test/`).
  vitest 는 타입체크를 안 하므로 타입 안전성은 `pnpm build` 로 확인한다.
- 공유 타입 수정 후에는 반드시 `pnpm build:shared`(안 하면 backend/frontend 가 옛 타입을 본다).

## 4. 자주 보는 파일 · 트러블슈팅

- **wire 계약**: `packages/shared-interfaces/src/{meeting,mediasoup,reports,events}.ts`
- **env 해석**: `apps/backend/src/config/*.ts`(키·기본값의 단일 진실원), 템플릿은 `apps/*/.env.template`
- **전역 파이프/CORS**: `apps/backend/src/main.ts`
- `EADDRINUSE`/옛 코드 응답: dev 재기동 시 좀비 node 프로세스 — 포트(5000/3000/8000) LISTEN 확인 후 종료
- 오디오/STT 동작 안 함: 호스트에 `ffmpeg` 설치 확인, ai-worker(8000) 실행 확인
- 회의록 요약이 비어 있음: `GEMINI_API_KEY` 미설정 시 `NoopSummarizer` 로 동작(정상)
- 미디어가 검은 화면: 입장 시 OFF 가 기본(lazy). 카메라/마이크 켜기 버튼으로 취득
