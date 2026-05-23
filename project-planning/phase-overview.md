# Project Summary

Lightweight inference logging and ingestion system around an LLM chatbot. A Next.js web app talks to a NestJS API that streams Claude (Phase 1) and GPT (Phase 3) responses, persists every conversation to Postgres, and emits structured inference logs through an in-process SDK. Logs flow into an async pipeline backed by Redis + BullMQ and surface in a dashboard for latency, token-usage, and failure visibility. Phase 3 wraps the whole thing in Docker images deployable behind a reverse proxy on a single VM.

Full architectural design lives in `AGENT.md`. This `project-planning/` directory turns that design into reviewable, phase-by-phase implementation steps. Each phase doc is the source of truth for what gets built in that phase, in what order, and how to verify it.

# Current Project Status

Current Phase: Phase 0
Current Step: Step 1 (not started)
Current Progress: 0%

All four planning documents are written and pending review. No code has been written yet. Implementation begins after the user approves the plan.

# Phase Summary

Phase 0 — **Foundation**
Purpose: Empty repo → runnable monorepo with Postgres, Redis, full Prisma schema, NestJS api skeleton, Next.js web skeleton, shared `packages/types`. Zero feature code.
Key deliverables: pnpm workspace, Docker Compose for postgres+redis, all-8-tables Prisma migration, `/health/live` + `/health/ready`, placeholder web page with shadcn `Button`, README.
Detail: 11 steps in `phase-0.md`.
Status: Plan written — Not started

Phase 1 — **Chat Application (Anthropic, Streaming, Synchronous Persistence)**
Purpose: End-to-end chat with Anthropic Claude over SSE. Multi-turn context, cancellation, resume, persistent conversation history.
Key deliverables: `LlmProvider` abstraction + Anthropic adapter, in-process `InferenceLoggerService`, `ConversationsModule`, `ChatModule` with SSE streaming + in-memory pub/sub registry, cancellation flow, web chat UI, first Vitest tests.
Detail: 13 steps in `phase-1.md`.
Status: Plan written — Not started

Phase 2 — **Async Ingestion Pipeline, Dashboard, PII Redaction**
Purpose: Layer BullMQ-backed async fan-out on top of the synchronous chat path. External-producer HTTP endpoint. Dashboard. PII redaction in the worker.
Key deliverables: separate worker process (same codebase, different entrypoint), `IngestionService` + API-key guard, BullMQ `Worker` consuming `ingestion-processing` queue, PII redaction utility, dashboard (summary + list + detail) UI, Redis health probe, admin endpoint listing dead-letter jobs.
Detail: 12 steps in `phase-2.md`.
Status: Plan written — Not started

Phase 3 — **Hardening: Multi-Provider, Rate Limiting, Docker, CI, Retention**
Purpose: Ops/quality work to make the project deployable. Adds the second LLM provider so the abstraction is no longer single-vendor in practice.
Key deliverables: OpenAI provider adapter + contract conformance test, opt-in per-request fallback, `@nestjs/throttler` rate limits, Dockerfiles for api/web (worker shares api image), production `docker-compose.yml`, GitHub Actions CI workflow, retention cron, dead-letter replay endpoints, lint rule banning Zod imports outside `packages/types`, `provider_configs` seed, README production-deployment section.
Detail: 14 steps in `phase-3.md`.
Status: Plan written — Not started

# Locked Architectural Decisions

These were confirmed with the user before any phase doc was written. They bind every phase and should not be re-litigated mid-implementation.

- **Auth scope:** single-user / no auth in v1. Ingestion endpoint protected by static API key (`INGESTION_API_KEY`). `/dashboard/*` and `/admin/*` rely on reverse-proxy gating in v1. `users` table exists with one seeded "anonymous" row so future auth is a code change, not a schema migration.
- **LLM providers in v1:** Anthropic only in Phase 1. OpenAI adapter lands in Phase 3. The `LlmProvider` interface is set in Phase 1 and unchanged in Phase 3.
- **SDK location:** in-process module inside `apps/api/src/sdk/inference-logger/`. No separate `packages/sdk-*`. Internal chat traffic calls the logger directly; the ingestion HTTP endpoint exists for external producers only.
- **Phase 0 scope:** infra + schema + skeletons, no features. All 8 tables migrated in one `init` migration even though several aren't written to until Phase 2 (`ingestion_logs`, `inference_events`, `queue_jobs`) or Phase 3 (`provider_configs`). One migration is easier to review than scattered ones.

# Binding Global Rules

From `~/.claude/CLAUDE.md`, enforced project-wide across every phase:

- **No type casts anywhere.** `as Foo`, `<Foo>x`, `x!`, and `as const` are all lint-banned via `@typescript-eslint/consistent-type-assertions: { assertionStyle: "never" }` from Phase 0 onwards. Tight typing replaces casts.
- **Every Zod schema lives in `packages/types`.** `apps/api` and `apps/web` import from `@olives/types`. Phase 3 adds the ESLint `no-restricted-imports` rule that mechanically enforces this — until then it is enforced socially in code review.

# Cross-Phase Dependencies

```
Phase 0 (foundation)
   └─→ Phase 1 (chat synchronous path)
            └─→ Phase 2 (async pipeline + dashboard)
                     └─→ Phase 3 (hardening + deployment)
```

A phase cannot start until the previous one is `Completed`. Each phase's `Handoff Context` section documents exactly what state the next phase inherits.

# Blockers

None.

Format for future entries:

```
Date: YYYY-MM-DD
Phase: <n>
Issue: <description>
Status: open / resolved
Resolution: <fix or "open">
```

# Notes

**Process rule.** This directory is the source of truth for implementation order. Code does not get written until the relevant phase's plan is reviewed and approved. Phase docs get updated as steps complete — status, progress %, blockers, handoff notes. The expectation is that a second engineer joining mid-project should be able to read `phase-overview.md`, the current `phase-N.md`, and pick up the work without needing prior context from chat history.

**What this plan deliberately omits.** Everything in `AGENT.md §10` ("Future Improvements") is out of scope for v1: OpenTelemetry, materialized views, S3 archival, multi-tenancy, RBAC, prompt caching, semantic search, auto-deploy from CI, HA topology. These are the natural Phase 4+ candidates if/when v1 ships and the team continues investing. The four-phase plan in this directory takes the project from empty repo to v1-shippable; further work is left as a deliberate choice for after launch.

**Document depth.** Each phase doc lists explicit files to create, key code/config snippets, exact verification commands, and an acceptance pass. The intent is that the doc is precise enough to review *before* writing code and complete enough to execute *after* approval. If something is ambiguous at review time, that ambiguity is a bug in the plan — flag it and the doc gets revised, not the implementation.
