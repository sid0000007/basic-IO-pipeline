# Engineering Agent Charter

This document defines the role, decision framework, and implementation strategy for building a lightweight inference logging and ingestion system around an LLM chatbot application.

## Role

Act as a Principal Staff Engineer and Technical Architect for a small-team or solo-developer project. The responsibility is to make sound system decisions before coding, reduce operational complexity, minimize delivery risk, and bias toward maintainable production software over novelty.

Core expectations:

- Prefer mature, well-understood tools over emerging alternatives.
- Optimize for shipping speed, reliability, and low operational overhead.
- Avoid overengineering and premature abstraction.
- Design for production from day one, but scale only where justified.
- Make tradeoffs explicit, especially around failure modes, observability, and deployability.
- Keep the design self-hostable and practical with Docker Compose.

## Decision Principles

- Frontend: Next.js, TypeScript, Tailwind, shadcn/ui
- Backend: Node.js, NestJS
- Database: PostgreSQL with Prisma
- Queue/Event layer: Redis with BullMQ
- Infrastructure: Docker Compose
- LLM integration: Provider abstraction supporting multiple vendors

## Non-Goals For Initial Version

- Full multi-tenant enterprise isolation
- Complex analytics warehouse pipelines
- Advanced real-time collaborative chat
- Cross-region distributed event streaming
- Heavy microservice decomposition

# 1. Architecture Overview

The recommended architecture is a modular monolith with asynchronous ingestion, not a microservice system.

Reasoning:

- A small team moves faster with one backend deployment than with separately deployed chatbot, ingestion, and orchestration services.
- NestJS modules give clean separation without introducing network boundaries too early.
- PostgreSQL should be the system of record for conversations, messages, inference requests, and processed log events.
- Redis and BullMQ should be used selectively for jobs that benefit from retry, isolation, and backpressure:
  - inference log ingestion
  - redaction
  - provider fallback or post-processing
- Streaming chat responses should stay synchronous between frontend and backend using Server-Sent Events or chunked HTTP streaming. Do not force the primary chat path through a queue because that increases latency and cancellation complexity.

Recommended high-level architecture:

1. Next.js frontend handles chat UI, conversation browsing, resume, and dashboard views.
2. NestJS backend exposes:
   - chat API
   - conversation API
   - ingestion API
   - internal SDK/provider abstraction
   - admin/dashboard API
3. Provider adapter layer normalizes calls to OpenAI, Anthropic, or other providers.
4. Inference SDK/wrapper creates structured inference events around every provider call.
5. Backend writes critical conversation state synchronously to PostgreSQL.
6. Backend emits inference log jobs to BullMQ for validation, enrichment, redaction, and durable storage.
7. PostgreSQL stores processed records for query and audit.
8. Redis provides queue transport, retries, and rate smoothing.

Tradeoff:

- This design is not the absolute highest-throughput architecture, but it is the highest-confidence architecture for an initial production launch with limited operational burden.

# 2. System Components

## Frontend: `web`

Responsibilities:

- Chat interface with streaming assistant responses
- Conversation list
- Resume existing conversation
- Cancel active generation
- Minimal admin/dashboard pages for logs and metrics
- Authentication UI if auth is added

Key modules:

- `app/chat`
- `app/conversations`
- `app/dashboard`
- `components/chat`
- `lib/api-client`

## Backend: `api`

### `ChatModule`

- Accept user messages
- Load conversation context
- Start provider inference
- Stream tokens back to client
- Handle cancellation
- Persist messages and inference request state

### `ConversationModule`

- Create conversation
- List conversations
- Get full conversation history
- Resume conversation
- Soft-close or archive conversations

### `InferenceModule`

- Provider abstraction
- Provider request lifecycle
- Usage normalization
- Latency measurement
- Error normalization
- Input/output preview generation

### `IngestionModule`

- Receive log payloads from internal SDK or external producers
- Validate schemas
- Parse metadata
- Store raw event if needed
- Queue processing jobs

### `LoggingPipelineModule`

- Process queued inference events
- Apply optional PII redaction
- Enrich payloads
- Persist processed records
- Handle retries and dead-letter cases

### `DashboardModule`

- Expose aggregates for:
  - request counts
  - success/failure rates
  - latency percentiles
  - token usage
  - provider/model breakdown

### `AuthModule`

- API key validation for ingestion
- Session or JWT auth for app users
- Role separation for admin/dashboard routes if needed

### `ObservabilityModule`

- Structured logs
- Correlation IDs
- Health endpoints
- Metrics export

## Infrastructure Components

### PostgreSQL

- Source of truth
- Query layer for dashboard
- Durable record of chat and inference events

### Redis

- BullMQ backing store
- Optional short-lived cancellation flags
- Short-term stream/session state if needed

### BullMQ Workers

- Process log ingestion asynchronously
- Retry transient failures
- Isolate slow redaction or enrichment steps

## Shared SDK / Wrapper

Responsibilities:

- Standardize provider invocation
- Capture telemetry around each inference
- Emit structured event payloads
- Support future extraction into a separate package if needed

# 3. Database Design

Use PostgreSQL as the only durable operational database in v1. Avoid separate OLAP systems initially.

## Table: `users`

Fields:

- `id` UUID PK
- `email` varchar unique nullable
- `name` varchar nullable
- `created_at` timestamptz
- `updated_at` timestamptz

Rationale:

- Keep user model minimal. If auth is deferred, this can still exist for future compatibility.

## Table: `conversations`

Fields:

- `id` UUID PK
- `user_id` UUID FK -> `users.id` nullable if anonymous chat is allowed
- `title` varchar
- `status` varchar
  - `active`
  - `completed`
  - `cancelled`
  - `archived`
- `last_message_at` timestamptz
- `created_at` timestamptz
- `updated_at` timestamptz

Indexes:

- `(user_id, updated_at desc)`
- `(status, updated_at desc)`

Rationale:

- Supports fast conversation listing and resume flows.

## Table: `messages`

Fields:

- `id` UUID PK
- `conversation_id` UUID FK -> `conversations.id`
- `role` varchar
  - `system`
  - `user`
  - `assistant`
  - `tool`
- `content` text
- `content_preview` varchar
- `sequence_number` integer
- `status` varchar
  - `completed`
  - `streaming`
  - `cancelled`
  - `failed`
- `provider_message_id` varchar nullable
- `metadata` jsonb nullable
- `created_at` timestamptz
- `updated_at` timestamptz

Indexes:

- `(conversation_id, sequence_number)`
- `(conversation_id, created_at)`

Rationale:

- Sequence number simplifies ordered retrieval and avoids timestamp-only ordering ambiguity.

## Table: `inference_requests`

Fields:

- `id` UUID PK
- `conversation_id` UUID FK -> `conversations.id`
- `user_message_id` UUID FK -> `messages.id` nullable
- `assistant_message_id` UUID FK -> `messages.id` nullable
- `session_id` varchar
- `provider` varchar
- `model` varchar
- `status` varchar
  - `queued`
  - `started`
  - `streaming`
  - `completed`
  - `failed`
  - `cancelled`
- `request_started_at` timestamptz
- `first_token_at` timestamptz nullable
- `completed_at` timestamptz nullable
- `latency_ms` integer nullable
- `time_to_first_token_ms` integer nullable
- `input_tokens` integer nullable
- `output_tokens` integer nullable
- `total_tokens` integer nullable
- `input_preview` text nullable
- `output_preview` text nullable
- `error_code` varchar nullable
- `error_message` text nullable
- `request_metadata` jsonb nullable
- `created_at` timestamptz
- `updated_at` timestamptz

Indexes:

- `(conversation_id, created_at desc)`
- `(provider, model, created_at desc)`
- `(status, created_at desc)`
- `(session_id)`
- `(request_started_at desc)`

Rationale:

- This is the operational record of each LLM call and the main table for dashboard summaries.

## Table: `inference_events`

Fields:

- `id` UUID PK
- `inference_request_id` UUID FK -> `inference_requests.id` nullable
- `event_type` varchar
  - `request_started`
  - `first_token`
  - `stream_delta`
  - `request_completed`
  - `request_failed`
  - `request_cancelled`
- `event_timestamp` timestamptz
- `payload` jsonb
- `created_at` timestamptz

Indexes:

- `(inference_request_id, event_timestamp)`
- `(event_type, event_timestamp desc)`

Rationale:

- Keep event history for debugging without forcing full append-only event sourcing for the whole product.
- Do not store every token chunk forever unless there is a strong business need. For v1, optionally sample or omit `stream_delta` persistence.

## Table: `ingestion_logs`

Fields:

- `id` UUID PK
- `source` varchar
- `source_event_id` varchar nullable
- `request_id` varchar nullable
- `status` varchar
  - `received`
  - `validated`
  - `processed`
  - `failed`
- `payload_version` varchar
- `received_at` timestamptz
- `processed_at` timestamptz nullable
- `error_message` text nullable
- `raw_payload` jsonb
- `normalized_payload` jsonb nullable

Indexes:

- `(status, received_at desc)`
- `(source, received_at desc)`
- `(source, source_event_id)` unique where `source_event_id` is not null

Rationale:

- Supports idempotency and forensic debugging for ingestion.

## Table: `queue_jobs`

Fields:

- `id` UUID PK
- `job_type` varchar
- `entity_type` varchar
- `entity_id` UUID nullable
- `status` varchar
  - `queued`
  - `running`
  - `completed`
  - `failed`
  - `dead_letter`
- `attempt_count` integer
- `last_error` text nullable
- `available_at` timestamptz
- `created_at` timestamptz
- `updated_at` timestamptz

Indexes:

- `(status, available_at)`
- `(job_type, status)`

Rationale:

- BullMQ has its own metadata, but keeping a lightweight application-visible job state table helps admin troubleshooting without depending on Redis internals.
- This table is optional in v1. If implementation speed matters more than visibility, defer it to phase 2.

## Table: `provider_configs` Optional

Fields:

- `id` UUID PK
- `provider` varchar
- `display_name` varchar
- `is_enabled` boolean
- `default_model` varchar
- `timeout_ms` integer
- `settings` jsonb
- `created_at` timestamptz
- `updated_at` timestamptz

Rationale:

- Supports multi-provider rollout without hardcoding everything.
- Can be deferred if environment-based config is enough in v1.

## PII Redaction Strategy

Do not mutate original user messages in place.

- Store canonical conversation content in `messages`
- Store redacted previews in:
  - `messages.content_preview`
  - `inference_requests.input_preview`
  - `inference_requests.output_preview`
- If raw prompt capture is considered sensitive, make full content logging configurable per environment

This avoids losing operational debugging value while reducing accidental sensitive-data exposure in dashboards.

# 4. API Design

Use REST for control-plane APIs and SSE for streaming responses. This is simpler than GraphQL or WebSockets for the stated requirements.

## Chat APIs

### `POST /api/v1/chat/conversations`

Create a new conversation.

Request:

```json
{
  "title": "Optional title"
}
```

Response:

```json
{
  "id": "uuid",
  "title": "Optional title",
  "status": "active",
  "createdAt": "2026-05-23T10:00:00.000Z"
}
```

### `GET /api/v1/chat/conversations`

List conversations for the current user.

Query params:

- `cursor`
- `limit`
- `status`

Response:

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "Support bot",
      "status": "active",
      "lastMessageAt": "2026-05-23T10:05:00.000Z",
      "messageCount": 8
    }
  ],
  "nextCursor": "opaque-cursor"
}
```

### `GET /api/v1/chat/conversations/:conversationId`

Get conversation metadata and messages.

Response:

```json
{
  "id": "uuid",
  "title": "Support bot",
  "status": "active",
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "Hello",
      "sequenceNumber": 1,
      "createdAt": "2026-05-23T10:00:00.000Z"
    }
  ]
}
```

### `POST /api/v1/chat/conversations/:conversationId/messages`

Add a user message and start assistant generation.

Request:

```json
{
  "content": "How do I reset my password?",
  "stream": true,
  "provider": "openai",
  "model": "gpt-4.1-mini"
}
```

Behavior:

- If `stream=false`, return final assistant message synchronously.
- If `stream=true`, initiate SSE stream.

Non-streaming response:

```json
{
  "inferenceRequestId": "uuid",
  "assistantMessage": {
    "id": "uuid",
    "role": "assistant",
    "content": "You can reset your password by..."
  },
  "usage": {
    "inputTokens": 120,
    "outputTokens": 85,
    "totalTokens": 205
  }
}
```

### `GET /api/v1/chat/conversations/:conversationId/stream/:inferenceRequestId`

SSE endpoint for streamed output.

Events:

- `message_start`
- `token`
- `message_complete`
- `error`
- `cancelled`

Example SSE payload:

```text
event: token
data: {"delta":"Hello"}
```

### `POST /api/v1/chat/inferences/:inferenceRequestId/cancel`

Cancel an in-flight request.

Request:

```json
{}
```

Response:

```json
{
  "id": "uuid",
  "status": "cancelled"
}
```

Tradeoff:

- Use HTTP + SSE before WebSockets. Cancellation is still manageable through request state and Redis flags, and the operational footprint stays lower.

## Ingestion APIs

### `POST /api/v1/ingestion/inference-logs`

Receive structured inference logs from the internal wrapper or external clients.

Headers:

- `Authorization: Bearer <ingestion_api_key>`
- `Idempotency-Key: <optional>`

Request:

```json
{
  "source": "chat-api",
  "sourceEventId": "evt_123",
  "payloadVersion": "1.0",
  "eventType": "request_completed",
  "timestamp": "2026-05-23T10:00:02.000Z",
  "data": {
    "conversationId": "uuid",
    "sessionId": "sess_123",
    "provider": "openai",
    "model": "gpt-4.1-mini",
    "status": "completed",
    "latencyMs": 1520,
    "inputTokens": 120,
    "outputTokens": 85,
    "inputPreview": "How do I reset...",
    "outputPreview": "You can reset..."
  }
}
```

Response:

```json
{
  "accepted": true,
  "ingestionLogId": "uuid",
  "status": "received"
}
```

### `GET /api/v1/ingestion/logs/:id`

Get ingestion processing status.

Response:

```json
{
  "id": "uuid",
  "status": "processed",
  "receivedAt": "2026-05-23T10:00:02.000Z",
  "processedAt": "2026-05-23T10:00:03.000Z",
  "errorMessage": null
}
```

## Dashboard APIs

### `GET /api/v1/dashboard/summary`

Response:

```json
{
  "timeRange": "24h",
  "requestCount": 1200,
  "successRate": 0.982,
  "p95LatencyMs": 2100,
  "tokenUsage": {
    "input": 120000,
    "output": 95000
  }
}
```

### `GET /api/v1/dashboard/inference-requests`

Query params:

- `provider`
- `model`
- `status`
- `from`
- `to`
- `cursor`

### `GET /api/v1/dashboard/inference-requests/:id`

Returns the full request record, event history, previews, and errors.

## Health APIs

### `GET /health/live`

- Process is running.

### `GET /health/ready`

- Database reachable
- Redis reachable
- Queue worker registered if required

# 5. Event Flow

## A. Chat request lifecycle

1. User opens the Next.js chat UI.
2. Frontend loads conversation list from `GET /chat/conversations`.
3. User resumes or creates a conversation.
4. User submits a message via `POST /chat/conversations/:id/messages`.
5. Backend:
   - validates request
   - writes user message row
   - creates `inference_requests` row with status `started`
   - builds normalized provider request
6. Inference wrapper starts timers and emits `request_started`.
7. Provider adapter sends request to selected LLM vendor.
8. If streaming:
   - backend streams chunks to frontend over SSE
   - first token timestamp is captured
   - partial assistant content is accumulated in memory
   - optional cancellation checks happen between stream chunks
9. On completion:
   - backend persists assistant message
   - updates `inference_requests` with token counts, latency, previews, status
   - emits completion event to ingestion pipeline
10. Ingestion pipeline validates and stores processed event records.
11. Dashboard queries read aggregated data from PostgreSQL.

## B. Cancellation flow

1. User clicks cancel.
2. Frontend sends `POST /chat/inferences/:id/cancel`.
3. Backend marks inference request as `cancelled_intent` in memory or Redis flag.
4. Streaming loop checks cancellation flag.
5. Backend stops relaying tokens, closes stream, updates:
   - assistant message status
   - inference request status
   - event history
6. Cancellation event is logged to ingestion.

Tradeoff:

- Hard cancellation depends on provider capability. Where provider SDK does not support abort cleanly, implement best-effort local cancellation and clearly mark status semantics.

## C. External ingestion flow

1. Producer sends structured log to ingestion endpoint.
2. API authenticates source and validates schema version.
3. Raw payload is stored in `ingestion_logs` with idempotency checks.
4. Job is enqueued in BullMQ.
5. Worker:
   - normalizes fields
   - redacts configured PII patterns from previews
   - links to `inference_requests` if available
   - writes `inference_events` or updates summary tables
6. Processing result is stored back to `ingestion_logs`.
7. On failure, job retries then moves to dead-letter handling.

# 6. Folder Structure

Recommended monorepo layout:

```text
/
├─ agent.md
├─ docker-compose.yml
├─ .env.example
├─ package.json
├─ pnpm-workspace.yaml
├─ apps/
│  ├─ web/
│  │  ├─ app/
│  │  │  ├─ (dashboard)/
│  │  │  ├─ chat/
│  │  │  ├─ conversations/
│  │  │  └─ api/ if Next API routes are needed sparingly
│  │  ├─ components/
│  │  ├─ lib/
│  │  ├─ styles/
│  │  └─ tests/
│  └─ api/
│     ├─ src/
│     │  ├─ main.ts
│     │  ├─ app.module.ts
│     │  ├─ modules/
│     │  │  ├─ auth/
│     │  │  ├─ chat/
│     │  │  ├─ conversations/
│     │  │  ├─ inference/
│     │  │  ├─ ingestion/
│     │  │  ├─ dashboard/
│     │  │  ├─ observability/
│     │  │  └─ health/
│     │  ├─ providers/
│     │  │  ├─ llm/
│     │  │  │  ├─ provider.interface.ts
│     │  │  │  ├─ openai.provider.ts
│     │  │  │  ├─ anthropic.provider.ts
│     │  │  │  └─ provider.factory.ts
│     │  ├─ queues/
│     │  │  ├─ bullmq.module.ts
│     │  │  ├─ jobs/
│     │  │  └─ workers/
│     │  ├─ prisma/
│     │  ├─ common/
│     │  │  ├─ dto/
│     │  │  ├─ guards/
│     │  │  ├─ interceptors/
│     │  │  ├─ pipes/
│     │  │  └─ utils/
│     │  └─ sdk/
│     │     └─ inference-logger/
│     └─ test/
├─ packages/
│  ├─ shared-types/
│  ├─ config/
│  └─ eslint-config/
└─ infra/
   ├─ postgres/
   ├─ redis/
   └─ scripts/
```

Rationale:

- Monorepo keeps frontend, backend, and shared types aligned.
- Do not extract ingestion SDK into a separate repository initially.
- Keep provider adapters inside backend until a real external SDK consumer exists.

# 7. Development Phases

## Phase 1

Goals:

- Ship a usable chatbot with conversation persistence and basic inference logging.

Tasks:

- Initialize monorepo with Next.js and NestJS apps
- Configure PostgreSQL, Prisma, Redis, BullMQ, Docker Compose
- Implement conversation and message persistence
- Implement one provider adapter
- Add streaming chat endpoint
- Capture core inference metadata:
  - provider
  - model
  - timestamps
  - latency
  - status
  - errors
  - token usage where available
- Build minimal conversation list and resume UI

Dependencies:

- Base infra containers
- Prisma schema and migrations
- Environment/config strategy

Expected deliverables:

- User can create and resume conversations
- User can stream assistant responses
- Inference request records are stored in PostgreSQL
- Basic Docker Compose local environment works end-to-end

## Phase 2

Goals:

- Add robust ingestion and operational visibility.

Tasks:

- Implement ingestion API with schema validation
- Add BullMQ workers for async processing
- Add `ingestion_logs` and `inference_events`
- Add cancellation flow
- Add structured logging and correlation IDs
- Add health endpoints
- Build basic dashboard for recent requests, failures, latency, token usage
- Add redacted previews

Dependencies:

- Stable phase 1 inference wrapper
- Clear event payload schema versioning

Expected deliverables:

- Async ingestion pipeline with retries
- Dashboard for debugging and basic usage analytics
- Queue-backed event processing with failure visibility

## Phase 3

Goals:

- Harden for production use and multi-provider support.

Tasks:

- Add second provider adapter
- Implement provider selection and fallback policy
- Add idempotency support on ingestion
- Improve auth and role gating for dashboard
- Add dead-letter monitoring and replay tooling
- Add rate limiting and abuse controls
- Add retention policies and data cleanup jobs

Dependencies:

- Phase 2 event model stability
- Provider abstraction boundaries proven in real usage

Expected deliverables:

- Multi-provider support
- Operational recovery workflows
- Basic security and retention controls

## Phase 4

Goals:

- Optimize maintainability and scale characteristics without major redesign.

Tasks:

- Add aggregate materialized views or summary tables for dashboard performance
- Partition heavy tables if growth justifies it
- Add optional external object storage for large raw payload archives
- Add replay/backfill utilities for ingestion data
- Add more advanced PII detection

Dependencies:

- Proven traffic patterns
- Actual dashboard/query bottlenecks

Expected deliverables:

- Better reporting performance
- Cleaner long-term retention story
- Scalable ingestion evolution path

# 8. Failure Handling

## Retry strategy

Use retries only for transient failures.

Retryable:

- provider timeouts
- temporary provider 5xx
- Redis transient errors
- database connection pool exhaustion spikes
- temporary network failures during ingestion

Non-retryable:

- schema validation failures
- unsupported provider/model
- malformed payload version
- authorization failures

BullMQ retry policy:

- attempts: `3` to `5`
- backoff: exponential with jitter
- dead-letter after max retries

Reasoning:

- Jitter prevents synchronized retries.
- Small retry counts reduce noisy queue buildup in incident conditions.

## Queue failures

- Failed ingestion jobs move to dead-letter state after retries
- Persist failure reason in both BullMQ and application-visible table/log
- Add admin endpoint or script to replay dead-letter jobs manually

## Logging failures

Critical principle:

- Chat success should not depend on non-critical log ingestion success.

Behavior:

- Conversation and final inference summary should be written in-band where possible
- Detailed event ingestion can fail independently and be retried
- If async log ingestion fails permanently, retain enough state in `inference_requests` to preserve operational usefulness

This is the key tradeoff that reduces user-facing blast radius.

## Provider failures

On provider timeout/error:

- update `inference_requests.status = failed`
- persist normalized error code/message
- emit failure event
- return safe client-facing error

Optional phase 3 fallback:

- allow provider fallback only for idempotent retryable failures
- do not silently fallback across materially different models without explicit policy

## Cancellation edge cases

- If cancellation is requested after completion, return current final status
- If provider cannot be force-stopped, stop local streaming and mark as cancelled-best-effort with internal metadata
- Avoid deleting partial records; keep audit trail

## Database failures

- If PostgreSQL is unavailable, reject new chat requests with a clear error rather than accepting untracked requests
- Do not treat Redis as a fallback source of truth

Reasoning:

- Losing durable conversation state is worse than short-term unavailability

# 9. Deployment Plan

## Docker services

Recommended `docker-compose.yml` services:

- `web`
  - Next.js app
  - depends on `api`
- `api`
  - NestJS HTTP server
  - depends on `postgres`, `redis`
- `worker`
  - NestJS BullMQ worker entrypoint
  - depends on `postgres`, `redis`
- `postgres`
  - persistent volume
- `redis`
  - persistent volume optional, acceptable for queue durability tradeoff in small deployments

Optional:

- `pgadmin` or Adminer for local development only
- `prometheus` and `grafana` only after metrics justify the complexity

## Deployment flow

For initial self-hosted deployment:

1. Build versioned images for `web`, `api`, `worker`
2. Run Prisma migrations before application rollout
3. Start or update `postgres` and `redis`
4. Deploy `api` and `worker`
5. Deploy `web`
6. Run health checks
7. Verify queue processing and dashboard access

## Environment configuration

Use environment variables for:

- database URL
- Redis URL
- provider API keys
- ingestion API key
- log retention policy
- preview truncation settings
- redaction enablement
- provider defaults

## Production topology

For a simple self-hosted deployment:

- one VM is acceptable initially
- run Compose with named volumes
- place behind Nginx or Caddy for TLS termination
- use daily PostgreSQL backups

Tradeoff:

- This is not highly available, but it is operationally simple and appropriate for an early-stage product or internal tool.

# 10. Future Improvements

- Add model/provider routing policies based on latency, cost, or quality tier
- Add usage budgets and tenant-level quotas
- Add OpenTelemetry traces across frontend, backend, provider calls, and workers
- Add materialized views for fast dashboard slices
- Add S3-compatible archival for raw logs and large payloads
- Add row-level multi-tenant isolation if product scope expands
- Add fine-grained RBAC for admin dashboards
- Add automatic PII classification beyond regex-based redaction
- Add replay tooling from archived events
- Add provider-side prompt caching support where available
- Add semantic conversation search
- Add scheduled retention cleanup and partition management

# Additional Engineering Guidance

## Logging strategy

- Use structured JSON logs from backend and worker
- Include:
  - `request_id`
  - `conversation_id`
  - `inference_request_id`
  - `provider`
  - `model`
  - `status`
  - `latency_ms`
- Never rely on free-form logs for business reporting
- Database records are the source for dashboards; logs are for debugging and incident response

## Observability

Minimum viable observability:

- structured application logs
- health endpoints
- queue depth monitoring
- request latency histograms
- provider error counts
- DB query error rates

Prefer:

- `pino` for application logs
- Prometheus-compatible metrics from NestJS

Do not introduce a full observability stack on day one unless there is already hosting support for it.

## Security considerations

- Protect ingestion endpoint with API keys
- Apply auth to chat endpoints unless anonymous use is intentional
- Encrypt traffic with TLS in non-local environments
- Redact sensitive previews before dashboard exposure
- Limit raw payload access to admin-only users
- Apply request size limits on ingestion APIs
- Apply rate limiting on chat and ingestion endpoints
- Store provider secrets only in environment or secret manager
- Sanitize error messages returned to clients

## Development workflow

- Use Prisma migrations for every schema change
- Keep DTO validation strict with class-validator or Zod at boundaries
- Add seed data only for local development
- Run backend and worker independently in dev to catch queue issues early
- Use shared TypeScript types for API contracts where practical

## Testing strategy

Prioritize practical coverage:

- unit tests for provider adapters, redaction, payload normalization
- integration tests for chat lifecycle, cancellation, ingestion API, DB persistence
- worker tests for retries and dead-letter movement
- e2e tests for conversation creation, streaming flow, resume, and dashboard basics

Do not overinvest in brittle UI snapshot tests early.

## Scaling considerations

The design scales acceptably for early production because:

- PostgreSQL handles moderate chat and event workloads well
- Redis/BullMQ absorbs ingestion spikes
- Worker process can scale horizontally without changing architecture
- Backend remains stateless except for DB and Redis dependencies

Expected first scaling moves:

1. Increase worker replicas
2. Add PostgreSQL indexes or read replicas if needed
3. Add table partitioning for `inference_events` and `ingestion_logs`
4. Move archives to object storage
5. Introduce summary tables for dashboards

Avoid moving to Kafka, ClickHouse, or microservices until operational pain clearly justifies that complexity.
