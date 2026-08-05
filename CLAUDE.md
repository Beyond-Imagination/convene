# CLAUDE.md

This file is for Claude Code. Read it before editing anything in this repo.

## Project

`convene` (v1.0.0) — a standalone product: WebRTC meetings + real-time chat + structured **meeting reports** (STT + LLM summary). v2 (a separate effort) adds Notion integration.

## Source-of-truth docs

- **Notion (external)** — architecture patterns, domain model, layer mapping, sequence + state diagrams (formerly `ARCHITECTURE.md`). Korean, written for the human user. **Ask the user for the link** when you need it; it is not in the repo.
- `CODEBASE_GUIDE.md` (in-repo) — maps the running code to those patterns.

This file (CLAUDE.md) is the English index for fast context recovery.

## Stack (locked)

- **Backend**: NestJS 11 (**CommonJS**, standard NestJS convention; no `"type": "module"`, no `.js` extension on relative imports) + Mediasoup 3 + Socket.IO 4 (`@nestjs/websockets` + `@nestjs/platform-socket.io`). Validation: `class-validator` + `class-transformer`. State: Redis (container-local, **ioredis**). Persistence: MongoDB Atlas. **Tests: jest + ts-jest, `setupFiles: ["reflect-metadata"]`.**
- **Frontend**: Next.js 14+ (App Router) + TypeScript + Zustand + mediasoup-client. **Static export only** (`output: 'export'`) → S3 + CloudFront. **No SSR/RSC data fetching, no `route.ts`, no middleware.** Dynamic routes use `'use client'` + `useParams()` and rely on CloudFront `/404 → /index.html` SPA fallback. **Tests: vitest + Playwright.**
- **AI worker**: FastAPI + faster-whisper (STT). LLM summary lives in backend behind `SummarizerPort` (default: Gemini).
- **Monorepo**: pnpm 9 + Turborepo. Workspaces: `apps/*`, `packages/*`. **Test runners are per-package: backend = jest, frontend & shared-interfaces = vitest. Do not unify** without explicit user approval — see `~/.claude/.../memory/feedback_stack_decisions.md`.

## Patterns

- **Backend**: Layered MVC + DDD 4-layer. Dependency direction: Interface → Application → Domain ← Infrastructure. Domain layer has **zero framework imports**. Application talks to Infrastructure only through Ports, and is wired by Nest DI (`@Injectable` + `@Inject(TOKEN)`) — see `CODEBASE_GUIDE.md` §3.4.
- **Frontend**: MVVM. View = `'use client'` component, props only. ViewModel = `useXxxViewModel` hook. Model = zustand store + api service + socket client. **View components do not call `fetch`, `useEffect`, `useState`, socket APIs, or zustand setters directly.**
- **File member order** (deps-first, bottom-up): imports → module constants → supporting types/interfaces/helpers → the file's main class/aggregate/function **last**. Class-internal order (`field → constructor → method`) is enforced by `@typescript-eslint/member-ordering`. Multi-export files with no single namesake (e.g. sibling `*.errors.ts`, wire-type modules) are exempt.

## Naming (locked)

- Aggregate root for meeting record: **`MeetingReport`** (not Minutes/Notes/Record).
- Module / folder / REST path: `reports/`, `/reports`.
- Domain event prefix: `report.*` (singular). Meeting events: `meeting.*`. Examples: `report.transcription.completed`, `report.summary.completed`, `report.finalized`, `meeting.created`, `meeting.participant.joined`, `meeting.chat.posted`, `meeting.idle.detected`, `meeting.ended`.
- VOs: `ReportSummary`, `IdleTimeout`, `ExternalReference`, `NotionPushResult`, `MeetingCode`, `Source`.
- Ports (**outbound and genuinely swappable only** — DB, external API, third-party lib): `TranscriberPort`, `SummarizerPort`, `MeetingRepository`, `ReportRepository`; `notion/` owns `NotionIssuePort`, `NotionReportPort`. Everything else injects the concrete class: inbound calls (Controller → UseCase, BC → BC), framework-bound infra (`PinoLoggerAdapter`, `NestEventBusDomainEventPublisher`, `SystemClock`), and pure functions (`randomUUID()` called inline).
- Frontend hooks: `useMeetingViewModel`, `useChatViewModel`, `useMeetingReportViewModel`.

## Bounded contexts

`meeting/`, `chat/`, `mediasoup/`, `recording/`, `reports/`. v2 will add `notion/`.

## Hard rules

1. **Never edit `../web12-plum`.** Reference only.
2. **DTO classes with `class-validator` live in backend only.** `packages/shared-interfaces` exports plain TS interfaces + event-name constants. No decorators in shared.
3. **View components are dumb.** All fetch/socket/state composition goes into a `useXxxViewModel` hook. The View receives data and callbacks via props or hook return values.
4. **Static export constraints.** No `app/**/route.ts`, no server actions, no middleware, no `getServerSideProps`-equivalents. All data comes from `fetch(NEXT_PUBLIC_API_URL/...)` in client components.
5. **Audio is ephemeral.** Buffered on backend disk → sent to ai-worker → **deleted immediately**. No S3. No long-term audio storage.
6. **Domain is framework-free.** No `@nestjs/...`, `mongoose`, `ioredis` imports inside `domain/`. Ports are TS interfaces, each paired with a plain `Symbol` DI token in the same file (a Symbol is not a framework import).
7. **Cross-context coupling via Domain Events (`@nestjs/event-emitter`), or by injecting the other context's Application Service.** Prefer events for notifications (fire-and-forget); inject the service when you need a return value (e.g. `notion/` → `MeetingService.create`). The owning module `exports` that service; **Aggregates and Repositories still never cross a context boundary.** Read-only Value Objects shared by multiple contexts live in `apps/backend/src/shared-kernel/domain/` — this is the DDD **Shared Kernel** pattern. Changes to the shared kernel require alignment from every consumer.
8. **Validation pipe is global** with `whitelist: true, forbidNonWhitelisted: true, transform: true`. Every inbound HTTP/WS payload must be a DTO class.

## TDD cycle (per non-trivial unit)

1. Write the spec.
2. Add a buildable stub so the spec compiles but fails (`throw new Error('not implemented')`).
3. Run jest/vitest — confirm **red**.
4. Commit: `test(scope): ... spec (red)`.
5. Replace the stub with the real implementation until the spec passes.
6. Run jest/vitest — confirm **green**.
7. Commit: `feat(scope): ... impl (green)`.

Domain VO/Entity/Aggregate may collapse into a single `test(...)` commit when the size is trivial, but the working order (spec → impl → run) still holds. See `~/.claude/.../memory/feedback_tdd_order.md`.

## Workflow

1. Scope + architecture agreed (architecture now in Notion, formerly `ARCHITECTURE.md`). ✅
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
convene/
├── CLAUDE.md, README.md, CODEBASE_GUIDE.md   (scope·architecture → Notion)
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

1. Read `CLAUDE.md` (this file) → `CODEBASE_GUIDE.md`. Scope/architecture detail lives in Notion (ask the user for the link).
2. Check `git log -10 --oneline` for recent progress.
3. Locate the current task: failing specs, TODO comments, or ask the user.
4. **Speak Korean to the user.** Code identifiers (class/function/variable/event names, file paths) stay English. **All code comments, JSDoc bodies, and test (`it`/`describe`) labels are written in Korean** so non-Claude collaborators can read them. The Notion docs stay Korean. This file (CLAUDE.md) stays English because it is for future Claude sessions.
5. Memory in `~/.claude/projects/D--programming-boostcamp-2025-membership-migration/memory/` carries user preferences and project state across sessions; check `MEMORY.md` there. (Folder rename to `convene` is pending — flip this to `...-convene` when the rename happens.)
