# CLAUDE.md

This file is for Claude Code. Read it before editing anything in this repo.

## Project

`web12-plum-migration` (v1.0.0) — a slimmed successor of `../web12-plum`. WebRTC meetings + real-time chat + structured **meeting reports** (STT + LLM summary). v2 (a separate effort) adds Notion integration.

## Source-of-truth docs

- `PLAN.md` — scope, stack, directory layout, task order. **Korean, written for the human user.**
- `ARCHITECTURE.md` — patterns (Backend = Layered MVC + DDD 4-layer, Frontend = MVVM), domain model, layer mapping, sequence + state diagrams. **Korean.**

Re-read both at the start of every session. This file is just an English index for fast context recovery.

## Stack (locked)

- **Backend**: NestJS 10 (ESM, `"type": "module"`, relative imports use `.js` extension) + Mediasoup 3 + Socket.IO 4. Validation: `class-validator` + `class-transformer`. State: Redis (container-local). Persistence: MongoDB Atlas.
- **Frontend**: Next.js 14+ (App Router) + TypeScript + Zustand + mediasoup-client. **Static export only** (`output: 'export'`) → S3 + CloudFront. **No SSR/RSC data fetching, no `route.ts`, no middleware.** Dynamic routes use `'use client'` + `useParams()` and rely on CloudFront `/404 → /index.html` SPA fallback.
- **AI worker**: FastAPI + faster-whisper (STT). LLM summary lives in backend behind `SummarizerPort` (default: Gemini).
- **Monorepo**: pnpm 9 + Turborepo. Workspaces: `apps/*`, `packages/*`.

## Patterns

- **Backend**: Layered MVC + DDD 4-layer. Dependency direction: Interface → Application → Domain ← Infrastructure. Domain layer has **zero framework imports**. Application talks to Infrastructure only through Ports.
- **Frontend**: MVVM. View = `'use client'` component, props only. ViewModel = `useXxxViewModel` hook. Model = zustand store + api service + socket client. **View components do not call `fetch`, `useEffect`, `useState`, socket APIs, or zustand setters directly.**

## Naming (locked)

- Aggregate root for meeting record: **`MeetingReport`** (not Minutes/Notes/Record).
- Module / folder / REST path: `reports/`, `/reports`.
- Domain event prefix: `report.*` (singular). Meeting events: `meeting.*`. Examples: `report.transcription.completed`, `report.summary.completed`, `report.finalized`, `meeting.created`, `meeting.participant.joined`, `meeting.chat.posted`, `meeting.idle.detected`, `meeting.ended`.
- VOs: `ReportSummary`, `IdleTimeout`, `ExternalReference`, `NotionPushResult`, `MeetingCode`, `Source`.
- Ports: `TranscriberPort`, `SummarizerPort`, `NotionPort`, `MeetingRepository`, `ReportRepository`.
- Frontend hooks: `useMeetingViewModel`, `useChatViewModel`, `useMeetingReportViewModel`.

## Bounded contexts

`meeting/`, `chat/`, `mediasoup/`, `recording/`, `reports/`. v2 will add `notion/`.

## Hard rules

1. **Never edit `../web12-plum`.** Reference only.
2. **DTO classes with `class-validator` live in backend only.** `packages/shared-interfaces` exports plain TS interfaces + event-name constants. No decorators in shared.
3. **View components are dumb.** All fetch/socket/state composition goes into a `useXxxViewModel` hook. The View receives data and callbacks via props or hook return values.
4. **Static export constraints.** No `app/**/route.ts`, no server actions, no middleware, no `getServerSideProps`-equivalents. All data comes from `fetch(NEXT_PUBLIC_API_URL/...)` in client components.
5. **Audio is ephemeral.** Buffered on backend disk → sent to ai-worker → **deleted immediately**. No S3. No long-term audio storage.
6. **Domain is framework-free.** No `@nestjs/...`, `mongoose`, `ioredis` imports inside `domain/`. Ports are TS interfaces.
7. **Cross-context coupling only via Domain Events (`@nestjs/event-emitter`) or Ports.** No direct imports across context boundaries.
8. **Validation pipe is global** with `whitelist: true, forbidNonWhitelisted: true, transform: true`. Every inbound HTTP/WS payload must be a DTO class.

## Workflow

1. `PLAN.md` + `ARCHITECTURE.md` agreed. ✅
2. **Scaffolding** — pnpm + turbo + ESLint/Prettier + empty skeletons; build passes. ← current step
3. **Tests first (spec only)**, in this order:
   1. `shared-interfaces`: event name constants + type compile checks.
   2. Backend domain: `Meeting.spec.ts`, `MeetingReport.spec.ts` (aggregate invariants, VO).
   3. Backend application: use-case service specs against Port fakes.
   4. Backend infrastructure: repository specs (Redis/Mongo with testcontainers or in-memory), adapter Port fakes.
   5. Backend interface: controller / gateway DTO validation specs; e2e (`meeting.e2e-spec`, `reports.e2e-spec`).
   6. Frontend: ViewModel hook specs (`renderHook`), View render specs (props-driven), Playwright e2e.
4. **Implementation** in the same order.
5. `docker-compose.local.yml` + AWS deployment draft.

After each step, summarize in Korean to the user and wait for confirmation.

## Repository layout (target)

```
migration/
├── PLAN.md, ARCHITECTURE.md, CLAUDE.md
├── package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json
├── eslint.config.mjs, .prettierrc, .editorconfig, .gitignore
├── apps/
│   ├── backend/    NestJS, ESM, layered MVC + DDD
│   ├── frontend/   Next.js App Router, output:'export'
│   └── ai-worker/  FastAPI + faster-whisper
├── packages/
│   └── shared-interfaces/  tsup; interfaces + event constants only
└── docker-compose.local.yml
```

## Backend module skeleton

Each bounded-context module follows:

```
<context>/
├── interface/        controllers, gateways, dto (class-validator)
├── application/      use-case services, event handlers
├── domain/           aggregate, value objects, domain events, port interfaces
└── infrastructure/   repository impls, mediasoup wiring, third-party adapters
```

## Frontend feature skeleton

```
feature/<name>/
├── components/   View — props only
├── hooks/        ViewModel — useXxxViewModel
├── stores/       Model — zustand
└── services/     Model — api fetch / socket handlers
```

## When you (Claude) come back to this repo cold

1. Read `CLAUDE.md` (this file) → `PLAN.md` → `ARCHITECTURE.md`.
2. Check `git log -10 --oneline` for recent progress.
3. Locate the current task: failing specs, TODO comments, or ask the user.
4. **Speak Korean to the user.** Code identifiers stay English. PLAN/ARCHITECTURE stay Korean.
5. Memory in `~/.claude/projects/D--programming-boostcamp-2025-membership-web12-plum/memory/` carries user preferences and project state across sessions; check `MEMORY.md` there.
