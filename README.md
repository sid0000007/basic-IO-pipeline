# Base Ingestion||Stream Chatbot I/O

Lightweight inference logging and ingestion system around an LLM chatbot. **Next.js 16 + NestJS + Postgres 16 + Redis 7 + BullMQ**, monorepo, single-VM deployable via Docker Compose.

- **[architecture-notes.md](./architecture-notes.md)** — ingestion flow, logging strategy, scaling, failure handling.


---

## 1. Setup

### Prerequisites

- Node.js 22.x (`.nvmrc`)
- pnpm 10.10.0 (`corepack enable && corepack prepare pnpm@10.10.0 --activate`)
- Docker Desktop 4.x with Compose v2

### Local dev — one path

```bash
git clone <repo-url> olives && cd olives

corepack enable && corepack prepare pnpm@10.10.0 --activate
pnpm install

cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# edit apps/api/.env to add ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_API_KEY

pnpm infra:up                          # postgres + redis
pnpm --filter @olives/types build      # shared schemas
pnpm db:migrate                        # prisma migrate dev

pnpm dev                               # api :3001 + web :3000 + worker
```

Open <http://localhost:3000>.

### Health probes

```bash
curl http://localhost:3001/health/live    # {"status":"ok"}
curl http://localhost:3001/health/ready   # {"status":"ok","checks":{"database":"ok","redis":"ok"}}
```

### Production (single VM)

```bash
git clone <repo-url> /opt/olives && cd /opt/olives
cp .env.example .env && $EDITOR .env   # set secrets
docker compose --profile apps up -d --build
```

The `api` service runs `prisma migrate deploy` on every boot. The `worker` waits for api health. Front with Caddy or Nginx for TLS. Daily `pg_dump` via host cron.

### Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | All workspaces in parallel (api, web, worker, types watch) |
| `pnpm build` / `typecheck` / `lint` / `test` | All workspaces |
| `pnpm infra:up` / `infra:down` / `infra:logs` | Postgres + Redis lifecycle |
| `pnpm db:migrate` / `db:studio` / `db:generate` | Prisma helpers |

---

## 2. Architecture overview

```
┌────────────┐    POST /messages     ┌──────────────────┐
│  Web (3000)│ ────────────────────▶ │   API (3001)     │
│  Next.js   │ ◀──── SSE stream ──── │   NestJS         │
└────────────┘                       └──────────────────┘
                                       │       │
                                       │       │ enqueue
                                       │       ▼
                                  Postgres   Redis ─────┐
                                  (chat,     (BullMQ)   │
                                   inference            │
                                   _requests)           │
                                                        ▼
                                              ┌──────────────────┐
                                              │  Worker (Node)   │
                                              │  - validate Zod  │
                                              │  - PII redact    │
                                              │  - write events  │
                                              └──────────────────┘
                                                        │
                                                        ▼
                                                 Postgres
                                                 (inference
                                                  _events,
                                                  ingestion_logs)
```

**Four processes:**

1. **Web** — Next.js 16 App Router. Streams tokens into the chat UI via SSE.
2. **API** — NestJS. Owns HTTP, chat orchestration, SSE relay, dashboard queries, sync DB writes.
3. **Worker** — same code, different entry (`worker.ts`). Drains BullMQ queue, redacts PII, writes `inference_events`.
4. **Postgres + Redis** — Postgres = source of truth. Redis = BullMQ queue + ephemeral coordination.

**Two flows:**

- **Chat (sync)**: POST creates DB rows in a transaction → kicks off background streaming → tokens published to in-memory `StreamRegistry` → SSE endpoint relays to browser.
- **Logging (async)**: `InferenceLoggerService` writes `inference_requests` synchronously, then enqueues a structured payload → BullMQ → worker processes asynchronously.

**Why split api/worker?** Chat latency doesn't depend on PII redaction or event-log writes. Worker scales independently. Failures in logging don't fail chat.

For the deep version (Zod boundaries, fallback providers, cancellation race-handling, SSE buffer semantics) see [`architecture-notes.md`](./architecture-notes.md).

---

## 3. Schema design decisions

Eight tables. Every column has a reason. See [`apps/api/prisma/schema.prisma`](./apps/api/prisma/schema.prisma).

| Table | Why it exists | Key decisions |
|---|---|---|
| `users` | Future auth | Nullable email. Currently one anonymous user seeded at boot. |
| `conversations` | Group messages into sessions | `status` enum (active/completed/cancelled/archived). Indexes on `(userId, updatedAt DESC)` and `(status, updatedAt DESC)` because that's how lists are queried. |
| `messages` | Every user + assistant turn | `sequenceNumber` per conversation — contiguous, prevents ambiguity when ordering by `createdAt` alone (two messages can share a millisecond). `contentPreview` truncated to 1000 chars for fast list rendering. `status='streaming'` lets the UI distinguish placeholder rows. |
| `inference_requests` | **Operational truth for every model call** | Synchronously written. Carries everything the dashboard needs: provider, model, status, latency, TTFT, tokens in/out, previews, errors. Updated in-place on fallback (provider/model fields reflect what actually ran). Indexed on five access paths (see below). |
| `inference_events` | Lifecycle audit trail | Async, written by worker. One row per `request_started` / `first_token` / `request_completed` / `request_failed` / `request_cancelled`. Intentionally **does not** store every stream-delta — too noisy, no operational use. |
| `ingestion_logs` | Durable inbox for every log payload | Idempotency via unique `(source, sourceEventId)`. `rawPayload` is the unmodified input (audit/replay); `normalizedPayload` is post-redaction. `status` traces lifecycle. |
| `queue_jobs` | Optional app-level job visibility | Separate from BullMQ's internal Redis state. Lets us inspect "what's queued / dead" without `redis-cli`. |
| `provider_configs` | Per-provider tunables | Out-of-the-box null; seeded with defaults. Future: timeouts, model whitelists per provider. |

### Why these tradeoffs

- **`inference_requests` is the truth, `inference_events` is the diary.** The dashboard never JOINs against `inference_events` — it would be too slow at scale. Aggregations (`percentile_cont(0.5)`, success rate) all hit `inference_requests` directly, which is why it's heavily indexed.
- **Previews bounded to 1000 chars.** Full content lives on `messages`. Keeps `inference_requests` rows small for fast scans.
- **JSONB for payloads.** `rawPayload`, `normalizedPayload`, `requestMetadata`, `inference_events.payload` — schema can evolve without migrations. Cost: no per-key indexing without GIN; that's fine, these are read in detail-view only.
- **Idempotency key on ingestion.** Without `(source, sourceEventId)` unique, producer retries would double-count. With it, retries are safe.
- **No partitioning yet.** At small scale, monthly partitions on `inference_events` and `ingestion_logs` would be premature. The indexes carry us to ~10M rows comfortably.
- **Indexes on `inference_requests`:**
  - `(conversationId, createdAt DESC)` — conversation detail view
  - `(provider, model, createdAt DESC)` — provider mix breakdown
  - `(status, createdAt DESC)` — failure dashboards
  - `(sessionId)` — cross-conversation correlation
  - `(requestStartedAt DESC)` — primary list ordering
- **`messages.sequenceNumber` is a per-conversation counter, not a global one.** Lets you fetch a conversation's messages in deterministic order with a single index hit. Cost: writing a new message requires reading the max — bundled into the same transaction so it's atomic.
- **No soft deletes on messages.** Chat content is sensitive. Deletes are real.
- **Cascading deletes**: conversations → messages, conversations → inference_requests (via `onDelete: Cascade`). Cleanup is one query.

---

## 4. Tradeoffs made

Things I picked one way knowing the other has merit.

| Decision | Chose | Rejected | Why |
|---|---|---|---|
| Streaming transport | **SSE** | WebSockets | One-way, no library on the server (NestJS `Observable` emits `MessageEvent`), trivially proxyable through Caddy. WebSockets would buy nothing for this use case. |
| Stream coordination | **In-memory `StreamRegistry`** | Redis pub/sub | Single-replica is fine for take-home scale; pub/sub adds 2-3ms per token and an extra dependency. Documented escape hatch for horizontal scale. |
| Queue tech | **BullMQ on Redis** | Kafka, NATS, Postgres LISTEN/NOTIFY | Redis is already in the stack for chat coordination. BullMQ gives retries, backoff, dead-letter, and concurrency without a new broker. |
| Worker process | **Separate Node process, same code** | Lambdas, microservice | One repo, one build, one container image — but the worker can crash, restart, and scale without touching the api. |
| Validation | **Zod everywhere, on both sides of every HTTP boundary** | Class-validator, ad-hoc checks | Same schemas in `packages/types` consumed by both apps. Server parses inbound, client parses outbound. Zero drift, types inferred. |
| ORM | **Prisma** | Drizzle, raw SQL | Migrations, type safety, predictable. Cost: prepared statements are weaker than Drizzle and migrations are slow. Acceptable here. |
| Dashboard aggregates | **Postgres `percentile_cont`** | App-side math, materialized views | At small scale Postgres percentiles are fast enough and exact. Materialized views are a Phase 4 thing if reads outgrow writes. |
| PII redaction | **Regex in worker, deferred from chat** | Inline at chat time, ML-based | Regex is conservative but cheap; deferring it keeps chat latency unaffected. ML-based is overkill for emails/SSN/phone/card. |
| Ingestion auth | **Static bearer token (`INGESTION_API_KEY`)** | OAuth, mTLS, per-source keys | Single tenant, single source for now. Rotating keys is one env change + restart. |
| Cancellation | **AbortController per inference + in-memory registry** | Postgres `cancel_requested` flag polled by worker | Network call gets severed immediately; flag polling adds latency and doesn't actually stop the upstream HTTP. |
| Type safety | **Zero `as` casts. ESLint ban on `as Foo`, `<Foo>x`, `x!`, `as const`** | Pragmatic casting | Hard line. Forces honest types via Zod validation, type guards, and narrowing. Took longer but eliminates whole bug classes. |
| Frontend styling | **Pure CSS variables + class names (design tokens)** | Tailwind utility classes everywhere, CSS-in-JS | Theming via `data-theme` / `data-accent` attributes on `<html>` re-cascades the whole tree. No JS to toggle. Light/dark/accent variants in 5 lines of CSS. |
| Auth | **None yet** | NextAuth, Clerk | Take-home scope. One anonymous user. Adding real auth slots into `users.id`. |
| Multi-tenancy | **None yet** | Row-level security, per-org schemas | Same reason. |
| Deploy target | **Docker Compose on a single VM** | K8s, Vercel + managed Postgres | One `docker compose up` for everything including the worker. Self-hostable, no per-service vendor lock-in. K8s manifests are Phase 4. |

---

## 5. What I'd improve with more time

In rough priority order:

**Reliability**
- **Persist streaming events to disk** instead of in-memory `StreamRegistry`. Right now if the api crashes mid-stream the client gets nothing on reconnect. Redis stream or Postgres-backed event log would fix it.
- **Dead-letter queue + admin endpoint** to inspect and retry failed ingestion jobs. Today failed jobs stay in Redis but require manual inspection.
- **Provider circuit breakers.** If Anthropic 5xx's three times in a minute, route everything to the fallback for 30s. Today every request retries blindly.
- **Idempotency keys on `POST /messages`.** A flaky client retrying the same message would create duplicate turns. Today not guarded.

**Observability**
- **Structured tracing** (OpenTelemetry). Pino is good for logs but I want spans across chat → enqueue → worker.
- **Prometheus metrics** for queue depth, worker lag, per-provider error rates. Today everything is log-derived.
- **Real alerts** on `inference_requests.status='failed'` rate, queue lag, latency p95.

**Scale**
- **Move `StreamRegistry` to Redis pub/sub** so the api scales horizontally without sticky sessions.
- **Partition `inference_events` by month.** At ~10M rows query plans start drifting.
- **Read replica for the dashboard.** Aggregations on the primary will eventually compete with writes.
- **Per-provider concurrency limits.** Today an overloaded Anthropic queue can backlog everything.

**Product / UX**
- **Real auth** (Clerk or NextAuth) and multi-tenancy (org_id on every table, row-level security).
- **Search across conversations** — Postgres FTS over `messages.content`, indexed.
- **Export a conversation** as JSON/Markdown.
- **Configurable system prompts per conversation.** Today it's a global default.
- **Inline citations** when the model references its own previous output.

**Security**
- **Per-source ingestion keys** (rotate independently, revocable). Today single static key.
- **Rate limit ingestion + chat endpoints** at the HTTP layer (currently relies on provider quotas).
- **Encrypt API keys at rest** in `provider_configs`. Today plain text JSONB.
- **Audit log** for every settings change.

**Deploy**
- **Kubernetes manifests** + Helm chart. Today Compose only.
- **CI auto-deploy on main** with health-check rollback.
- **HA Postgres** (read replicas + automated failover).
- **Per-tenant log retention** policies.

**Testing**
- **End-to-end tests** with Playwright covering the chat happy path + cancel + fallback.
- **Load tests** to actually quantify the "200 writes/sec" claim from architecture-notes.md.
- **Chaos**: kill the worker mid-job, kill Redis mid-enqueue, verify recovery.

---

## Repository layout

```
olives/
├── apps/
│   ├── api/                NestJS — api + worker (separate entry)
│   │   ├── src/
│   │   │   ├── modules/    chat, conversations, ingestion, dashboard, retention, health
│   │   │   ├── sdk/        inference-logger (the "wrapper")
│   │   │   ├── providers/  llm provider abstraction (anthropic, openai, gemini)
│   │   │   ├── queues/     redis + bullmq wiring
│   │   │   ├── common/     redaction, validation, decorators
│   │   │   ├── main.ts     api entry
│   │   │   └── worker.ts   worker entry
│   │   └── prisma/         schema.prisma + migrations
│   └── web/                Next.js 16 App Router
├── packages/
│   └── types/              Shared Zod schemas (the ONLY place Zod lives)
├── project-planning/       Phase plan + handover
├── architecture-notes.md   Architecture deep-dive
├── project-overview.md     Plain-English walkthrough
├── demo.md                 Demo script
├── AGENT.md                Full design doc
└── docker-compose.yml      postgres + redis + api + worker + web
```

---

## Binding rules (CI-enforced)

- **No type casts.** ESLint flat config bans `as Foo`, `<Foo>x`, `x!`, `as const` via `@typescript-eslint/consistent-type-assertions`.
- **All Zod schemas in `packages/types`.** `import { z } from 'zod'` is banned in `apps/**` via `no-restricted-imports`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Port 5432 / 6379 in use | Edit `.env` (`POSTGRES_PORT` / `REDIS_PORT`); update `apps/api/.env` URLs |
| `Cannot find module '@olives/types'` | `pnpm --filter @olives/types build` |
| `Invalid environment configuration` on api boot | Read the Zod error — it names the missing var |
| Docker not running | `open -a "Docker Desktop"` then `pnpm infra:up` |
| Prisma client out of date after schema change | `pnpm db:generate` |
| API returns 502 on chat | Check `apps/api/.env` has a valid `ANTHROPIC_API_KEY` (or whichever provider you're using) |
| Worker not processing logs | `docker compose logs worker` — likely Redis URL mismatch |
