# Olives — Architecture Notes

Single-VM, monorepo (pnpm workspaces): Next.js 16 web + NestJS api + NestJS worker (same code, separate entry) + Postgres 16 + Redis 7. Shared Zod schemas in `@olives/types`.

---

## Ingestion flow

```
chat                  api process                       redis             worker process              postgres
────────────────────────────────────────────────────────────────────────────────────────────────────────────────
InferenceLogger ───▶ IngestionService.receive() ──▶ ingestion-processing ──▶ LoggingPipelineProcessor ──▶ DB
   .complete()         • Zod parse                    queue (BullMQ)              • re-parse Zod
   .fail()             • idempotency check                                        • PII redact
   .cancel()           • insert ingestion_logs                                    • insert inference_events
                       • enqueue job                                              • update ingestion_logs
```

- **Producer**: `InferenceLoggerService` emits at 3 lifecycle points (completed / failed / cancelled). Fire-and-forget — failure to enqueue does NOT fail the chat.
- **Validation**: Zod parsed twice — once at api entry (`inferenceLogPayloadV1Schema`), once again in the worker before write. Version field (`payloadVersion`) lets us evolve.
- **Idempotency**: unique `(source, sourceEventId)` index on `ingestion_logs`. Duplicate submissions short-circuit on the second insert.
- **Durability boundary**: once `ingestion_logs` row is written, the log is safe. BullMQ job is just a pointer (`{ingestionLogId}`) — even if Redis drops the job, the row stays and can be re-driven.
- **Processing**: worker reads the row, runs PII redaction (regex: email / SSN / phone / Luhn-checked card), writes `inference_events` row, flips `ingestion_logs.status` to `processed`.
- **External producers**: same endpoint (`POST /ingestion/logs`) is bearer-token-guarded (`IngestionApiKeyGuard`). Internal emitter bypasses HTTP via direct service call for in-process efficiency.

---

## Logging strategy

- **Two tiers**:
  1. **Operational truth** — `inference_requests` row, written **synchronously** in the chat transaction. Status, provider, model, latency, tokens, previews. Dashboard reads this. Never lossy.
  2. **Event audit** — `inference_events` rows, written **async** via worker. One row per lifecycle event. Used for debugging / replay, not for live dashboards.
- **What we capture per inference** (`inference_requests`):
  - identity: `id`, `conversationId`, `userMessageId`, `assistantMessageId`, `sessionId`
  - routing: `provider`, `model` (updated if fallback fires)
  - lifecycle: `status`, `requestStartedAt`, `firstTokenAt`, `completedAt`
  - perf: `latencyMs`, `timeToFirstTokenMs`, `inputTokens`, `outputTokens`, `totalTokens`
  - content: `inputPreview`, `outputPreview` (truncated to 1000 chars; redacted by worker)
  - errors: `errorCode`, `errorMessage`
- **Previews are bounded** (1000 chars). Full content lives on `messages`. Keeps `inference_requests` small for aggregation queries.
- **No stream-delta persistence** in Phase 1. Each token is published to the in-memory `StreamRegistry`, not the DB — `inference_events.stream_delta` is intentionally optional.
- **PII**: redaction is deferred to the worker so chat latency isn't affected. Configurable via `PII_REDACTION_ENABLED` env flag. Applied only to previews; live conversation content shown to the user is untouched.

---

## Scaling considerations

Current shape is single-VM. Scaling axes and what changes:

- **API replicas**: `StreamRegistry` is in-memory → SSE subscribers must hit the same replica as the producer. Fix: sticky sessions by `inferenceRequestId`, OR move the registry to Redis pub/sub. Pub/sub trades 2-3ms latency for horizontal scale.
- **Worker replicas**: BullMQ supports multiple workers on the same queue out of the box. Already concurrency-tunable via `INGESTION_QUEUE_CONCURRENCY`. No code change needed to scale horizontally; Redis is the coordination point.
- **Postgres**: writes are linear (one transaction per chat turn + one worker upsert per log). At ~100 inferences/sec we'd hit ~200 writes/sec — well within a single Postgres. Beyond that: read replicas for the dashboard, partition `inference_events` by month.
- **Dashboard queries**: use `percentile_cont` server-side, indexed on `(provider, model, createdAt DESC)`, `(status, createdAt DESC)`, `(requestStartedAt DESC)`. Cursor pagination (`base64(startedAt | id)`) — no offset/limit, stable under inserts.
- **Hot paths indexed**: `(conversationId, sequenceNumber)` for message retrieval, `(conversationId, createdAt DESC)` for inference list, `(source, sourceEventId)` unique for idempotency, `(status, availableAt)` for queue admin.
- **Provider throttling**: each `LlmProvider` is a singleton; in-flight requests gate naturally on the underlying SDK. Per-provider concurrency limit would go here if needed.
- **Streaming back-pressure**: if a client SSE is slow, the EventEmitter buffer in `StreamRegistry` grows in memory. Bounded to runtime memory of a single inference. Not currently rate-limited; would need a bounded queue per stream entry for safety.
- **Retention**: cron daily 3 AM. Deletes `inference_events`, empties JSONB payloads in `ingestion_logs` older than `RETENTION_DAYS`. Keeps row metadata for audit; bulky payloads gone.

---

## Failure handling assumptions

What we assume and how we react:

- **Provider failure (Anthropic / OpenAI / Gemini)**:
  - Network or 5xx: provider returns `{type: 'error', code, message, retryable}`. If retryable AND no tokens have streamed yet AND a fallback provider was specified, we retry on the fallback once. `inference_requests` row is updated in place — provider/model fields reflect what actually ran.
  - 4xx (rate limit, bad input): not retried. Marked `status='failed'`, error preserved.
- **Mid-stream provider error** (some tokens delivered, then error): assistant message marked `status='failed'`, partial content kept. Better than losing the output the user already saw.
- **User cancellation**: `AbortController` per inference. Upstream HTTP request is severed (provider SDKs accept `AbortSignal`). Background loop returns `cancelled` between chunks. Race-safe: cancels arriving before background loop registers are held in `CancellationRegistry.preRegisteredIntent`.
- **Postgres unavailable during chat write**: transaction fails, request returns 5xx. User retries. No partial state — the transaction is atomic (user msg + assistant placeholder + inference request all together).
- **Redis unavailable during ingestion enqueue**: `IngestionEnqueuer` throws, caught in `InferenceLoggerService.emit()`. Logged at error level. **Chat succeeds anyway.** The `inference_requests` row is the source of truth; the worker-side `inference_events` row will be missing for that inference. Not great, but not catastrophic.
- **Worker crash mid-job**: BullMQ marks the job stalled and re-delivers. The `process()` handler is idempotent — re-loading the same `ingestion_logs` row produces the same result. Worst case: duplicate `inference_events` row, which is benign.
- **Schema drift**: worker re-validates payload against current Zod schema. If validation fails, the job throws → BullMQ retries 5x with exponential backoff → row ends up `status='failed'` with the error. Manual inspection only.
- **Dead-letter**: `removeOnFail: false` on the queue. Failed jobs stay in Redis for admin inspection. No automatic dead-letter queue yet — would add `dead-letter` queue + retry-from-DLQ admin endpoint in Phase 3.
- **SSE client disconnect mid-stream**: server keeps streaming into the in-memory buffer. 60-second grace window post-completion — late reconnects get the buffered history. After 60s the entry is GC'd.
- **Token quota exhaustion** (provider rate-limited): treated as retryable error. If fallback configured, falls over. If not, surfaced to the user as `status='failed'`.
- **Stale provider config**: providers are singletons, instantiated at boot from env vars (`ANTHROPIC_API_KEY`, etc.). Rotating a key requires a restart. Acceptable for Phase 1.

---

## Operational invariants

Things that should always hold:

- For every `conversations` row, every `messages.sequenceNumber` is contiguous starting from 0.
- For every `messages` row with `role='assistant'`, there is exactly one `inference_requests` row pointing at it via `assistantMessageId`.
- For every `inference_requests` row with `status in ('completed', 'failed', 'cancelled')`, `completedAt is not null`.
- For every `ingestion_logs.sourceEventId` (when non-null), there is at most one row per `source`. (DB-enforced.)
- For every `ingestion_logs` row with `status='processed'`, there is one `inference_events` row with the matching `inferenceRequestId` and `eventType`. (Inserted in the same transaction.)
