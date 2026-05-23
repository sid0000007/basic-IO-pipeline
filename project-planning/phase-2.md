# Phase 2 — Async Ingestion Pipeline, Dashboard, PII Redaction

## Objective

Take the synchronous chat path that Phase 1 built and **layer an async fan-out on top of it**. Every inference that completes (or fails or cancels) emits a BullMQ job. A worker process consumes those jobs, optionally redacts PII from the previews, and writes detailed rows into `inference_events` and `ingestion_logs`. Build a dashboard on top of those tables so operators can see latency p95, success rate, token usage, and drill into any specific inference.

A second HTTP endpoint — `POST /api/v1/ingestion/inference-logs` — accepts the same shape from **external producers** (a future SDK in another service) authenticated with a static API key. Both internal chat traffic and external producers flow through the same ingestion service and the same queue, so there is one code path to debug.

End state of Phase 2:

- `apps/api` exposes `POST /api/v1/ingestion/inference-logs` (API-key gated) and `GET /api/v1/ingestion/logs/:id` (status read)
- `apps/api` exposes `GET /api/v1/dashboard/summary`, `GET /api/v1/dashboard/inference-requests`, `GET /api/v1/dashboard/inference-requests/:id`
- A second long-running process — the **worker** — starts via `pnpm --filter @olives/api dev:worker`. It connects to Redis, consumes the `ingestion-processing` queue, and writes processed rows
- Every chat turn now produces, in addition to the `inference_requests` row Phase 1 already wrote: one `ingestion_logs` row (status=`processed` after the worker runs), and 1–N `inference_events` rows (`request_started`, optional `first_token`, terminal `request_completed`/`request_failed`/`request_cancelled`)
- PII previews are redacted before persistence based on a configurable enable flag
- `/health/ready` checks both Postgres and Redis
- Failed jobs retry 5× with exponential backoff + jitter; after exhaustion they land in BullMQ's failed set and surface via `GET /api/v1/admin/queues/:queueName/failed`
- Dashboard UI under `/dashboard` and `/dashboard/requests` and `/dashboard/requests/[id]` shows real metrics from real data
- `pnpm lint`, `pnpm typecheck`, `pnpm test` all green

## Dependencies

Phase 1 must be Completed. Phase 2 assumes:

- Chat is functional end-to-end. The `InferenceLoggerService` is the chokepoint where async fan-out gets bolted in — it's the only place that writes to `inference_requests`, so it's the only place that needs an `IngestionEnqueuer` collaborator.
- `LlmProvider` abstraction is stable. Phase 2 does not touch providers.
- `StreamRegistry`, `CancellationRegistry`, `ChatService` remain unchanged.
- Vitest is configured.

External requirements added in Phase 2:

- None. Redis was already in `docker-compose.yml` from Phase 0; no app code talked to it until now.

## Locked Decisions Inherited Into Phase 2

- Auth: ingestion endpoint protected by a single static API key (`INGESTION_API_KEY` in `.env`). Dashboard endpoints are unauthenticated in v1 — they live behind whatever reverse-proxy gating the operator applies (Phase 3 deployment doc covers this).
- SDK: still in-process. Chat traffic does not loop through HTTP. Phase 2 adds a new in-process collaborator (`IngestionEnqueuer`) that internal chat calls; the HTTP ingestion endpoint exists for external producers only.
- Single queue for now (`ingestion-processing`). Splitting into separate redaction/enrichment queues only if profiling justifies it.

## Locked Decisions Made For Phase 2

- **One queue (`ingestion-processing`), not many.** AGENT.md §1 lists "redaction" and "enrichment" as candidate queue isolations. We collapse them into one worker pipeline because the volume is one job per chat turn — trivial. Splitting before measuring throughput would be premature optimization.
- **Worker is the same NestJS codebase started with a separate entrypoint.** A second deployable artifact, not a second repo. Bootstraps `WorkerModule` via `NestFactory.createApplicationContext` (no HTTP listener).
- **BullMQ failed-set is the source of truth for dead letters in Phase 2.** The `queue_jobs` table from `AGENT.md §3` stays empty in Phase 2. If we later want admin visibility outside the queue (e.g., dashboards across both BullMQ and a future SQS), Phase 4 can populate `queue_jobs` from worker hooks. Avoids double-bookkeeping in v1.
- **PII redaction is regex-based + opt-in via `PII_REDACTION_ENABLED`.** Default OFF in dev (so developers can read previews unmodified during debugging), ON for production. Patterns cover email, North-America phone, credit card (with Luhn check), and SSN. Configurable list lives in code, not env, because regex strings in env vars are a footgun.
- **Idempotency on ingestion HTTP endpoint via `Idempotency-Key` header.** Maps to `(source, source_event_id)` unique constraint already in the schema. Repeat POSTs with the same key return the existing `ingestion_logs` row, no duplicate job enqueued.
- **Dashboard reads directly from `inference_requests`, not from a denormalized summary table.** At the volumes a single-tenant v1 sees (low thousands per day), the indexed queries are fast enough. Materialized views / summary tables are Phase 4.

## Deliverables

`packages/types` additions:

- `packages/types/src/ingestion/payloads.ts` — `InferenceLogPayloadV1` Zod schema
- `packages/types/src/ingestion/responses.ts`
- `packages/types/src/dashboard/summary.ts`
- `packages/types/src/dashboard/inference-request.ts`
- `packages/types/src/ingestion/index.ts`, `packages/types/src/dashboard/index.ts`
- updated `packages/types/src/index.ts` barrel

`apps/api` additions:

- `apps/api/package.json` — add `bullmq`, `ioredis`
- `apps/api/.env.example` — add `INGESTION_API_KEY`, `PII_REDACTION_ENABLED`, `INGESTION_QUEUE_CONCURRENCY`, `INGESTION_MAX_ATTEMPTS`
- `apps/api/src/queues/redis.module.ts` — provides shared ioredis client
- `apps/api/src/queues/bullmq.module.ts` — registers queues and Worker harness
- `apps/api/src/queues/queue-names.ts`
- `apps/api/src/queues/jobs/ingestion-job.ts` — payload shape (Zod)
- `apps/api/src/worker.ts` — separate Nest application context entrypoint
- `apps/api/src/worker.module.ts` — loads only what the worker needs
- `apps/api/src/modules/ingestion/ingestion.controller.ts`
- `apps/api/src/modules/ingestion/ingestion.service.ts`
- `apps/api/src/modules/ingestion/ingestion.module.ts`
- `apps/api/src/modules/ingestion/ingestion-enqueuer.service.ts` — in-process internal API
- `apps/api/src/modules/ingestion/api-key.guard.ts`
- `apps/api/src/modules/logging-pipeline/logging-pipeline.processor.ts` — BullMQ Worker
- `apps/api/src/modules/logging-pipeline/normalize.ts`
- `apps/api/src/modules/logging-pipeline/persist.ts`
- `apps/api/src/modules/logging-pipeline/logging-pipeline.module.ts`
- `apps/api/src/common/redaction/pii-redactor.ts`
- `apps/api/src/common/redaction/pii-redactor.spec.ts`
- `apps/api/src/modules/health/redis.indicator.ts` — wired into `/health/ready`
- `apps/api/src/modules/dashboard/dashboard.controller.ts`
- `apps/api/src/modules/dashboard/dashboard.service.ts`
- `apps/api/src/modules/dashboard/dashboard.module.ts`
- `apps/api/src/modules/admin/admin.controller.ts` — dead-letter list endpoint
- `apps/api/src/modules/admin/admin.module.ts`
- update `apps/api/src/sdk/inference-logger/inference-logger.service.ts` — call `IngestionEnqueuer` after each terminal write
- update `apps/api/src/app.module.ts` — wire the new modules
- update `apps/api/src/main.ts` — no change (still HTTP only)
- update root `package.json` — add `dev:worker` script
- update `apps/api/package.json` — add `dev:worker`, `start:worker`, `build:worker`
- tests:
  - `apps/api/test/common/redaction/pii-redactor.spec.ts`
  - `apps/api/test/modules/ingestion/ingestion.service.spec.ts`
  - `apps/api/test/modules/logging-pipeline/logging-pipeline.processor.spec.ts`
  - `apps/api/test/modules/dashboard/dashboard.service.spec.ts`

`apps/web` additions:

- `apps/web/src/app/(dashboard)/layout.tsx`
- `apps/web/src/app/(dashboard)/dashboard/page.tsx` — summary
- `apps/web/src/app/(dashboard)/dashboard/requests/page.tsx` — list
- `apps/web/src/app/(dashboard)/dashboard/requests/[id]/page.tsx` — detail
- `apps/web/src/components/dashboard/summary-cards.tsx`
- `apps/web/src/components/dashboard/inference-request-table.tsx`
- `apps/web/src/components/dashboard/inference-request-detail.tsx`
- shadcn primitives added via CLI: `table`, `badge`, `tabs`, `tooltip`, `dialog`
- update `apps/web/src/lib/api-client.ts` — add dashboard + ingestion calls

`docker-compose.yml` change:

- Add a `worker` service entry **commented out** in Phase 2. It's deliberately left as a doc-only entry until Phase 3 builds the Dockerfile that backs it. In Phase 2 the worker runs on the host via `pnpm dev:worker`. This avoids needing app images before Phase 3.

## Step-by-step Tasks

---

### Step 1 — Author ingestion + dashboard Zod schemas

**Description:** All wire contracts for the Phase 2 endpoints live in `@olives/types`. Same rule as Phase 1 — schemas in one place, both sides parse from them.

**Files created:**

- `packages/types/src/ingestion/payloads.ts`
- `packages/types/src/ingestion/responses.ts`
- `packages/types/src/dashboard/summary.ts`
- `packages/types/src/dashboard/inference-request.ts`
- `packages/types/src/ingestion/index.ts`
- `packages/types/src/dashboard/index.ts`

**Key content:**

`ingestion/payloads.ts` — the `v1` payload shape that the HTTP endpoint accepts (and that the worker re-parses to be safe):

```typescript
import { z } from 'zod';
import { uuidSchema } from '../common/id';
import { inferenceStatusSchema } from '../chat/inference';

export const inferenceLogEventTypeSchema = z.enum([
  'request_started',
  'first_token',
  'request_completed',
  'request_failed',
  'request_cancelled',
]);
export type InferenceLogEventType = z.infer<typeof inferenceLogEventTypeSchema>;

export const inferenceLogPayloadV1Schema = z.object({
  source: z.string().min(1).max(100),
  sourceEventId: z.string().min(1).max(200).optional(),
  payloadVersion: z.literal('1.0'),
  eventType: inferenceLogEventTypeSchema,
  timestamp: z.string().datetime(),
  data: z.object({
    inferenceRequestId: uuidSchema.optional(),
    conversationId: uuidSchema.optional(),
    sessionId: z.string(),
    provider: z.string(),
    model: z.string(),
    status: inferenceStatusSchema,
    latencyMs: z.number().int().nonnegative().nullable().optional(),
    timeToFirstTokenMs: z.number().int().nonnegative().nullable().optional(),
    inputTokens: z.number().int().nonnegative().nullable().optional(),
    outputTokens: z.number().int().nonnegative().nullable().optional(),
    inputPreview: z.string().max(1000).nullable().optional(),
    outputPreview: z.string().max(1000).nullable().optional(),
    errorCode: z.string().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type InferenceLogPayloadV1 = z.infer<typeof inferenceLogPayloadV1Schema>;
```

`ingestion/responses.ts`:

```typescript
import { z } from 'zod';
import { uuidSchema } from '../common/id';

export const ingestionAcceptResponseSchema = z.object({
  accepted: z.literal(true),
  ingestionLogId: uuidSchema,
  status: z.enum(['received', 'duplicate']),
});

export const ingestionLogStatusResponseSchema = z.object({
  id: uuidSchema,
  status: z.enum(['received', 'validated', 'processed', 'failed']),
  receivedAt: z.string().datetime(),
  processedAt: z.string().datetime().nullable(),
  errorMessage: z.string().nullable(),
});
```

`dashboard/summary.ts`:

```typescript
import { z } from 'zod';

export const dashboardTimeRangeSchema = z.enum(['1h', '24h', '7d', '30d']);
export type DashboardTimeRange = z.infer<typeof dashboardTimeRangeSchema>;

export const dashboardSummaryQuerySchema = z.object({
  range: dashboardTimeRangeSchema.default('24h'),
});

export const dashboardSummaryResponseSchema = z.object({
  range: dashboardTimeRangeSchema,
  requestCount: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  failureCount: z.number().int().nonnegative(),
  cancelledCount: z.number().int().nonnegative(),
  p50LatencyMs: z.number().int().nullable(),
  p95LatencyMs: z.number().int().nullable(),
  tokenUsage: z.object({
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
  }),
  providerBreakdown: z.array(
    z.object({
      provider: z.string(),
      model: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
});
```

`dashboard/inference-request.ts` — list + detail shapes. Detail includes the `inference_events` history.

**Verification:** `pnpm --filter @olives/types typecheck` passes.

**Status:** Pending

---

### Step 2 — Install BullMQ + ioredis; wire `RedisModule` and `BullMqModule`

**Description:** Add the queue infrastructure. One ioredis client per process (api and worker get their own). One Queue registry (`BullMqModule`) that lets feature modules inject a typed queue handle for enqueueing.

**Dependencies added to `apps/api`:**

- `bullmq@^5`
- `ioredis@^5`

**Files created:**

- `apps/api/src/queues/redis.module.ts`
- `apps/api/src/queues/bullmq.module.ts`
- `apps/api/src/queues/queue-names.ts`
- `apps/api/src/queues/jobs/ingestion-job.ts`

**Files changed:**

- `packages/types/src/env/api-env.ts` — `REDIS_URL` (already exists from P0), add `INGESTION_QUEUE_CONCURRENCY`, `INGESTION_MAX_ATTEMPTS`
- `apps/api/.env.example`

**Key content:**

`queue-names.ts` — single source of truth:

```typescript
export const QUEUE_INGESTION_PROCESSING = 'ingestion-processing';
```

`redis.module.ts` — provides a singleton ioredis client. BullMQ requires `maxRetriesPerRequest: null` for blocking commands:

```typescript
import { Global, Module, Provider } from '@nestjs/common';
import { Redis } from 'ioredis';
import { EnvService } from '../config/config.module';

export const REDIS_CLIENT = 'REDIS_CLIENT';

const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [EnvService],
  useFactory: (env: EnvService) => {
    return new Redis(env.get('REDIS_URL'), {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
  },
};

@Global()
@Module({ providers: [redisProvider], exports: [redisProvider] })
export class RedisModule {}
```

`bullmq.module.ts`:

```typescript
import { Global, Inject, Module, Provider, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { REDIS_CLIENT, RedisModule } from './redis.module';
import { QUEUE_INGESTION_PROCESSING } from './queue-names';

export const INGESTION_QUEUE = 'INGESTION_QUEUE';

const ingestionQueueProvider: Provider = {
  provide: INGESTION_QUEUE,
  inject: [REDIS_CLIENT],
  useFactory: (redis: Redis) => new Queue(QUEUE_INGESTION_PROCESSING, { connection: redis }),
};

@Global()
@Module({
  imports: [RedisModule],
  providers: [ingestionQueueProvider],
  exports: [ingestionQueueProvider],
})
export class BullMqModule implements OnModuleDestroy {
  constructor(@Inject(INGESTION_QUEUE) private readonly queue: Queue) {}
  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
```

`jobs/ingestion-job.ts` — the BullMQ job payload shape:

```typescript
import { z } from 'zod';

export const ingestionJobPayloadSchema = z.object({
  ingestionLogId: z.string().uuid(),
});
export type IngestionJobPayload = z.infer<typeof ingestionJobPayloadSchema>;
```

**Note:** the BullMQ job only carries the `ingestionLogId`. The worker fetches the row from Postgres to get the full payload. This keeps job payloads small in Redis and avoids stale data if the row is updated between enqueue and process.

**Verification:**

```bash
pnpm --filter @olives/api dev
# In logs: "ioredis connected"
docker exec olives-redis redis-cli CLIENT LIST | grep "name=" | wc -l   # ≥ 1
```

**Status:** Pending

---

### Step 3 — Worker entrypoint

**Description:** A second NestJS bootstrap file. Loads `WorkerModule` (which loads `ConfigModule`, `PrismaModule`, `RedisModule`, `BullMqModule`, `LoggingPipelineModule`) and **nothing else** — no HTTP listener, no chat controllers, no ingestion controller. Uses `NestFactory.createApplicationContext` so no Express is initialized.

The api and worker share Postgres + Redis but are independent processes. In dev they're two `pnpm` commands; in Phase 3 they become two Docker services.

**Files created:**

- `apps/api/src/worker.module.ts`
- `apps/api/src/worker.ts`

**Files changed:**

- `apps/api/package.json` — add scripts:
  ```json
  "dev:worker": "nest start --watch --entryFile worker",
  "start:worker": "node dist/worker.js",
  "build": "nest build && nest build --webpack false --path tsconfig.build.json --entryFile worker"
  ```
  (NestJS multi-entry build varies; alternative is two `nest-cli.json` builders. We use `nest build` twice with `--entryFile`.)
- root `package.json` — add `"dev:worker": "pnpm --filter @olives/api dev:worker"`

**Key content:**

`worker.ts`:

```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.get(Logger).log('Worker started', 'Worker');
}
void bootstrap();
```

`worker.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './queues/redis.module';
import { BullMqModule } from './queues/bullmq.module';
import { LoggingPipelineModule } from './modules/logging-pipeline/logging-pipeline.module';

@Module({
  imports: [
    LoggerModule.forRoot({ /* same pino config as api */ }),
    ConfigModule,
    PrismaModule,
    RedisModule,
    BullMqModule,
    LoggingPipelineModule,
  ],
})
export class WorkerModule {}
```

**Verification:**

```bash
pnpm --filter @olives/api dev:worker
# Expected: pino log "Worker started"
# In Redis CLI:
docker exec olives-redis redis-cli CLIENT LIST | grep "bullmq"   # at least one connection (the Worker)
```

**Status:** Pending

---

### Step 4 — `IngestionModule` + API key guard

**Description:** The HTTP entrypoint. Validates `Authorization: Bearer <key>` against `INGESTION_API_KEY`. Parses body with `inferenceLogPayloadV1Schema`. Calls `IngestionService.receive(...)` which:

1. Determines source-event idempotency: if `(source, sourceEventId)` already exists in `ingestion_logs`, returns the existing row with `status='duplicate'`.
2. Otherwise INSERTs an `ingestion_logs` row with `status='received'`, `raw_payload=body`.
3. Enqueues a BullMQ job carrying just `{ ingestionLogId }`.
4. Returns `{ accepted: true, ingestionLogId, status: 'received' }`.

The same `IngestionService.receive()` method is callable in-process from `IngestionEnqueuer` (Step 7). One method, one code path for both HTTP and internal callers.

**Files created:**

- `apps/api/src/modules/ingestion/api-key.guard.ts`
- `apps/api/src/modules/ingestion/ingestion.controller.ts`
- `apps/api/src/modules/ingestion/ingestion.service.ts`
- `apps/api/src/modules/ingestion/ingestion.module.ts`

**Key content:**

`api-key.guard.ts`:

```typescript
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { EnvService } from '../../config/config.module';

@Injectable()
export class IngestionApiKeyGuard implements CanActivate {
  constructor(private readonly env: EnvService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const header = req.headers['authorization'];
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice('Bearer '.length).trim();
    const expected = this.env.get('INGESTION_API_KEY');
    if (token.length !== expected.length) throw new UnauthorizedException('Invalid token');
    // Constant-time compare via Buffer.compare to avoid timing attacks
    let mismatch = 0;
    for (let i = 0; i < token.length; i++) {
      mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    if (mismatch !== 0) throw new UnauthorizedException('Invalid token');
    return true;
  }
}
```

No casts. Constant-time compare in plain TS.

`ingestion.controller.ts`:

```typescript
@Controller('ingestion')
@UseGuards(IngestionApiKeyGuard)
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  @Post('inference-logs')
  async receive(
    @ZodBody(inferenceLogPayloadV1Schema) body: InferenceLogPayloadV1,
  ): Promise<IngestionAcceptResponse> {
    return this.ingestion.receive(body);
  }

  @Get('logs/:id')
  async status(@Param('id', new ParseUUIDPipe()) id: string): Promise<IngestionLogStatusResponse> {
    return this.ingestion.status(id);
  }
}
```

`ingestion.service.ts` — the heart:

```typescript
@Injectable()
export class IngestionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(INGESTION_QUEUE) private readonly queue: Queue,
    private readonly env: EnvService,
  ) {}

  async receive(payload: InferenceLogPayloadV1): Promise<IngestionAcceptResponse> {
    // Idempotency: if sourceEventId provided and already exists, return existing row
    if (payload.sourceEventId !== undefined) {
      const existing = await this.prisma.ingestionLog.findUnique({
        where: { unique_source_event: { source: payload.source, sourceEventId: payload.sourceEventId } },
      });
      if (existing) {
        return { accepted: true, ingestionLogId: existing.id, status: 'duplicate' };
      }
    }

    const row = await this.prisma.ingestionLog.create({
      data: {
        source: payload.source,
        sourceEventId: payload.sourceEventId ?? null,
        requestId: payload.data.inferenceRequestId ?? null,
        payloadVersion: payload.payloadVersion,
        receivedAt: new Date(),
        rawPayload: payload,
        status: 'received',
      },
    });

    await this.queue.add(
      'process',
      { ingestionLogId: row.id },
      {
        attempts: this.env.get('INGESTION_MAX_ATTEMPTS'),
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 24 * 3600, count: 1000 },
        removeOnFail: false,
      },
    );

    return { accepted: true, ingestionLogId: row.id, status: 'received' };
  }

  async status(id: string): Promise<IngestionLogStatusResponse> {
    const row = await this.prisma.ingestionLog.findUniqueOrThrow({ where: { id } });
    return {
      id: row.id,
      status: row.status,
      receivedAt: row.receivedAt.toISOString(),
      processedAt: row.processedAt?.toISOString() ?? null,
      errorMessage: row.errorMessage,
    };
  }
}
```

**Note** on BullMQ options: `removeOnFail: false` retains failed jobs in the failed set so the admin endpoint (Step 11) can list them. `removeOnComplete` GCs completed jobs after 24h with a 1000-cap to bound Redis memory.

**Verification:**

```bash
KEY=$(grep INGESTION_API_KEY apps/api/.env | cut -d= -f2)
curl -s -X POST http://localhost:3001/api/v1/ingestion/inference-logs \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "manual-test",
    "sourceEventId": "evt-1",
    "payloadVersion": "1.0",
    "eventType": "request_completed",
    "timestamp": "2026-05-23T10:00:00.000Z",
    "data": {
      "sessionId": "sess-1",
      "provider": "anthropic",
      "model": "claude-sonnet-4-6",
      "status": "completed",
      "latencyMs": 1200,
      "inputTokens": 100,
      "outputTokens": 80,
      "inputPreview": "hello",
      "outputPreview": "hi"
    }
  }' | jq
# → {"accepted":true,"ingestionLogId":"<uuid>","status":"received"}

# Repeat the same POST — idempotent
# → {"accepted":true,"ingestionLogId":"<same uuid>","status":"duplicate"}

# Missing key
curl -i -X POST http://localhost:3001/api/v1/ingestion/inference-logs -d '{}'
# → 401
```

**Status:** Pending

---

### Step 5 — PII redaction utility

**Description:** A pure function that takes a string and returns a redacted version. Patterns are hard-coded (not env-configurable to avoid regex-string footguns in `.env`). Enable/disable comes from `PII_REDACTION_ENABLED`.

**Files created:**

- `apps/api/src/common/redaction/pii-redactor.ts`
- `apps/api/test/common/redaction/pii-redactor.spec.ts`

**Patterns:**

- Email: `/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g` → `[email]`
- Phone (NA): `/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g` → `[phone]`
- Credit card (Luhn-validated): match `/\b(?:\d[ -]?){13,19}\b/g`, strip separators, Luhn check, redact `[card]`
- SSN: `/\b\d{3}-\d{2}-\d{4}\b/g` → `[ssn]`

**Key content (sketch):**

```typescript
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
const PHONE = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const CARD_CANDIDATE = /\b(?:\d[ -]?){13,19}\b/g;

export function redactPii(input: string): string {
  let out = input.replace(EMAIL, '[email]');
  out = out.replace(SSN, '[ssn]');
  out = out.replace(PHONE, '[phone]');
  out = out.replace(CARD_CANDIDATE, (m) => (isLuhnValid(m.replace(/[ -]/g, '')) ? '[card]' : m));
  return out;
}

function isLuhnValid(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    const code = digits.charCodeAt(i) - 48;
    if (code < 0 || code > 9) return false;
    let val = code;
    if (alt) { val *= 2; if (val > 9) val -= 9; }
    sum += val;
    alt = !alt;
  }
  return sum % 10 === 0;
}
```

**Order matters** — email first so the `@` in `foo@bar.com` isn't matched by the phone regex (it isn't, but ordering is defensive). SSN before phone because `123-45-6789` could otherwise match the phone pattern's `\d{3}.\d{3}.\d{4}` superset.

**Test cases:**

- `"Contact me at jane@example.com"` → `"Contact me at [email]"`
- `"Call (555) 123-4567"` → `"Call [phone]"`
- `"Card 4242 4242 4242 4242"` → `"Card [card]"` (Luhn-valid)
- `"Card 1234 5678 9012 3456"` → unchanged (Luhn-invalid)
- `"SSN 123-45-6789"` → `"SSN [ssn]"`
- Mixed input with all four

**Status:** Pending

---

### Step 6 — `LoggingPipelineModule`: BullMQ worker processor

**Description:** The worker process imports this module. It registers a BullMQ `Worker` listening on `ingestion-processing`. For each job, it loads the `ingestion_logs` row, parses the raw payload with `inferenceLogPayloadV1Schema` (defense in depth), redacts previews if enabled, links to an `inference_requests` row if `inferenceRequestId` was provided, inserts an `inference_events` row, and updates `ingestion_logs.status='processed'`.

**Files created:**

- `apps/api/src/modules/logging-pipeline/logging-pipeline.processor.ts`
- `apps/api/src/modules/logging-pipeline/normalize.ts`
- `apps/api/src/modules/logging-pipeline/persist.ts`
- `apps/api/src/modules/logging-pipeline/logging-pipeline.module.ts`

**Key content:**

`logging-pipeline.processor.ts`:

```typescript
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../queues/redis.module';
import { QUEUE_INGESTION_PROCESSING } from '../../queues/queue-names';
import { EnvService } from '../../config/config.module';
import { PrismaService } from '../../prisma/prisma.service';
import { redactPii } from '../../common/redaction/pii-redactor';
import { inferenceLogPayloadV1Schema, type InferenceLogPayloadV1 } from '@olives/types';
import { ingestionJobPayloadSchema, type IngestionJobPayload } from '../../queues/jobs/ingestion-job';

@Injectable()
export class LoggingPipelineProcessor implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly env: EnvService,
    private readonly logger: Logger,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker(
      QUEUE_INGESTION_PROCESSING,
      async (job: Job) => this.process(job),
      {
        connection: this.redis,
        concurrency: this.env.get('INGESTION_QUEUE_CONCURRENCY'),
      },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error({ jobId: job?.id, err }, 'Ingestion job failed');
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async process(job: Job): Promise<void> {
    const payload: IngestionJobPayload = ingestionJobPayloadSchema.parse(job.data);
    const row = await this.prisma.ingestionLog.findUniqueOrThrow({ where: { id: payload.ingestionLogId } });

    // Re-parse raw payload to be safe — schema may have evolved
    const validated: InferenceLogPayloadV1 = inferenceLogPayloadV1Schema.parse(row.rawPayload);

    // Redact previews if enabled
    const redact = this.env.get('PII_REDACTION_ENABLED');
    const inputPreview = validated.data.inputPreview ?? null;
    const outputPreview = validated.data.outputPreview ?? null;
    const normalizedInput = redact && inputPreview ? redactPii(inputPreview) : inputPreview;
    const normalizedOutput = redact && outputPreview ? redactPii(outputPreview) : outputPreview;

    await this.prisma.$transaction(async (tx) => {
      // Link to inference_requests if id provided
      if (validated.data.inferenceRequestId !== undefined) {
        await tx.inferenceEvent.create({
          data: {
            inferenceRequestId: validated.data.inferenceRequestId,
            eventType: this.mapEventType(validated.eventType),
            eventTimestamp: new Date(validated.timestamp),
            payload: {
              ...validated.data,
              inputPreview: normalizedInput,
              outputPreview: normalizedOutput,
            },
          },
        });
      }

      await tx.ingestionLog.update({
        where: { id: row.id },
        data: {
          status: 'processed',
          processedAt: new Date(),
          normalizedPayload: {
            ...validated,
            data: {
              ...validated.data,
              inputPreview: normalizedInput,
              outputPreview: normalizedOutput,
            },
          },
        },
      });
    });
  }

  private mapEventType(t: InferenceLogPayloadV1['eventType']) {
    // Maps payload event type → Prisma enum InferenceEventType
    // Both names match 1:1 for the events Phase 1 emits; explicit map for safety.
    if (t === 'request_started') return 'request_started';
    if (t === 'first_token') return 'first_token';
    if (t === 'request_completed') return 'request_completed';
    if (t === 'request_failed') return 'request_failed';
    if (t === 'request_cancelled') return 'request_cancelled';
    throw new Error(`Unknown event type: ${t}`);
  }
}
```

`logging-pipeline.module.ts` — provides the processor. **Only loaded in `WorkerModule`** — `AppModule` does **not** import it (the api process doesn't run the worker).

**Failure handling baked in:**

- BullMQ auto-retries failed jobs per `INGESTION_MAX_ATTEMPTS` (default 5) with `exponential` backoff starting 1s.
- On final failure, BullMQ moves the job to the failed set. `LoggingPipelineProcessor` also writes `ingestion_logs.status='failed'` + `error_message` via a separate listener (`worker.on('failed', ...)` updates the row).

Actually let's add that. Updating the snippet:

```typescript
this.worker.on('failed', async (job, err) => {
  this.logger.error({ jobId: job?.id, err }, 'Ingestion job failed');
  const payload = job?.data;
  const parsed = ingestionJobPayloadSchema.safeParse(payload);
  if (parsed.success && job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await this.prisma.ingestionLog.update({
      where: { id: parsed.data.ingestionLogId },
      data: { status: 'failed', errorMessage: err.message },
    }).catch(() => undefined);
  }
});
```

**Verification:**

```bash
# Start api + worker
pnpm dev &
pnpm dev:worker &
sleep 3

# Post via HTTP
curl -s -X POST .../ingestion/inference-logs -H "Authorization: Bearer $KEY" -d '{...}' | jq
sleep 2

# Inspect: ingestion_logs row status=processed; inference_events row exists if inferenceRequestId was set.
pnpm db:studio
```

**Status:** Pending

---

### Step 7 — Wire `InferenceLoggerService` → `IngestionEnqueuer`

**Description:** Internal chat traffic should also flow through ingestion. The cleanest hook is in `InferenceLoggerService.complete/fail/cancel` — right after the synchronous write to `inference_requests`, build an `InferenceLogPayloadV1` and call `IngestionEnqueuer.enqueue(...)`. `ChatService` does not change.

**Files created:**

- `apps/api/src/modules/ingestion/ingestion-enqueuer.service.ts`

**Files changed:**

- `apps/api/src/sdk/inference-logger/inference-logger.service.ts` — inject `IngestionEnqueuer`; call after each terminal write
- `apps/api/src/sdk/inference-logger/inference-logger.module.ts` — import `IngestionModule`

**`IngestionEnqueuer`:**

```typescript
@Injectable()
export class IngestionEnqueuer {
  constructor(private readonly ingestion: IngestionService) {}

  async enqueue(payload: InferenceLogPayloadV1): Promise<void> {
    // Reuse the exact same path as the HTTP endpoint to ensure one code path.
    await this.ingestion.receive(payload);
  }
}
```

This is a thin facade. The reason it exists: it lets us swap in a different transport later (e.g., direct queue.add for performance, batching, etc.) without changing the call sites.

**Update `InferenceLoggerService.complete`** (illustration):

```typescript
async complete(ctx: InferenceContext, result: CompletedInferenceInput): Promise<void> {
  await this.prisma.inferenceRequest.update({
    where: { id: ctx.inferenceRequestId },
    data: { /* ...as Phase 1... */ },
  });

  // Phase 2 addition: emit to ingestion pipeline
  await this.ingestion.enqueue({
    source: 'chat-api',
    sourceEventId: `${ctx.inferenceRequestId}:completed`,
    payloadVersion: '1.0',
    eventType: 'request_completed',
    timestamp: new Date().toISOString(),
    data: {
      inferenceRequestId: ctx.inferenceRequestId,
      sessionId: ctx.sessionId,
      provider: ctx.provider,
      model: ctx.model,
      status: 'completed',
      latencyMs: this.computeLatency(ctx),
      timeToFirstTokenMs: this.computeTtft(ctx, result.firstTokenAt),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      inputPreview: result.inputPreview,
      outputPreview: result.outputPreview,
    },
  });
}
```

**`sourceEventId` makes internal traffic idempotent** — if the same `complete` call accidentally runs twice (e.g., retry inside a transaction wrapper), the second one hits the `(source, source_event_id)` uniqueness and gets returned as `duplicate` with no extra work.

**Verification:** end-to-end chat turn produces:
- 1 `inference_requests` row (`status='completed'`)
- 1 `ingestion_logs` row (`status='processed'`)
- 1 `inference_events` row (`event_type='request_completed'`)

Walk through manually after Step 6 is in place. Then check DB:

```sql
SELECT status, count(*) FROM ingestion_logs GROUP BY status;
SELECT event_type, count(*) FROM inference_events GROUP BY event_type;
```

**Status:** Pending

---

### Step 8 — Redis health indicator

**Description:** Extend `/health/ready` to ping Redis in addition to Postgres.

**Files created:**

- `apps/api/src/modules/health/redis.indicator.ts`

**Files changed:**

- `apps/api/src/modules/health/health.controller.ts`
- `apps/api/src/modules/health/health.module.ts` — import `RedisModule`

**Key content:**

```typescript
// redis.indicator.ts
@Injectable()
export class RedisIndicator {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}
  async check(): Promise<'ok' | 'fail'> {
    try {
      const res = await this.redis.ping();
      return res === 'PONG' ? 'ok' : 'fail';
    } catch {
      return 'fail';
    }
  }
}
```

`health.controller.ts` ready endpoint becomes:

```typescript
@Get('ready')
async ready(): Promise<{ status: 'ok' | 'degraded'; checks: { database: 'ok' | 'fail'; redis: 'ok' | 'fail' } }> {
  let database: 'ok' | 'fail' = 'fail';
  try { await this.prisma.$queryRaw`SELECT 1`; database = 'ok'; } catch { database = 'fail'; }
  const redis = await this.redisIndicator.check();
  const status = database === 'ok' && redis === 'ok' ? 'ok' : 'degraded';
  return { status, checks: { database, redis } };
}
```

**Verification:**

```bash
curl -s http://localhost:3001/health/ready | jq
# → {"status":"ok","checks":{"database":"ok","redis":"ok"}}
docker compose stop redis
curl -s http://localhost:3001/health/ready | jq
# → {"status":"degraded","checks":{"database":"ok","redis":"fail"}}
docker compose start redis
```

**Status:** Pending

---

### Step 9 — `DashboardModule`: summary + list + detail

**Description:** Three read-only endpoints over `inference_requests` and `inference_events`. No writes, no auth (intentional per locked decision).

**Files created:**

- `apps/api/src/modules/dashboard/dashboard.controller.ts`
- `apps/api/src/modules/dashboard/dashboard.service.ts`
- `apps/api/src/modules/dashboard/dashboard.module.ts`

**Endpoints:**

- `GET /api/v1/dashboard/summary?range=24h|7d|30d|1h`
- `GET /api/v1/dashboard/inference-requests?provider=&model=&status=&from=&to=&cursor=&limit=`
- `GET /api/v1/dashboard/inference-requests/:id`

**Summary query** — we use raw SQL via `prisma.$queryRaw` for the percentile because Prisma's query builder doesn't expose `percentile_cont`. One small query rather than fetching rows into Node and computing percentiles there:

```sql
SELECT
  count(*)::int AS request_count,
  count(*) FILTER (WHERE status = 'completed')::int AS completed_count,
  count(*) FILTER (WHERE status = 'failed')::int AS failed_count,
  count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::int AS p50,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::int AS p95,
  coalesce(sum(input_tokens), 0)::bigint AS input_tokens,
  coalesce(sum(output_tokens), 0)::bigint AS output_tokens
FROM inference_requests
WHERE request_started_at >= $1
```

**Provider breakdown** — second small query grouped by `(provider, model)`.

**List query** — cursor pagination on `(request_started_at DESC, id DESC)` with filters via Prisma `where`.

**Detail** — `findUniqueOrThrow` on `inference_requests` with `include: { events: { orderBy: { eventTimestamp: 'asc' } } }`.

**Verification:**

```bash
# After running a few chat turns
curl -s http://localhost:3001/api/v1/dashboard/summary?range=24h | jq
# → realistic numbers
curl -s http://localhost:3001/api/v1/dashboard/inference-requests?limit=10 | jq
curl -s http://localhost:3001/api/v1/dashboard/inference-requests/<id> | jq .events
```

**Status:** Pending

---

### Step 10 — Dashboard UI in `apps/web`

**Description:** Three Next pages under `apps/web/src/app/(dashboard)/`. Server components fetch from the dashboard endpoints and render server-side (no SWR/React Query needed for v1 — pages refresh on navigation, which is fine for a debugging dashboard).

**Files created:**

- `apps/web/src/app/(dashboard)/layout.tsx`
- `apps/web/src/app/(dashboard)/dashboard/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/requests/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/requests/[id]/page.tsx`
- `apps/web/src/components/dashboard/summary-cards.tsx`
- `apps/web/src/components/dashboard/inference-request-table.tsx`
- `apps/web/src/components/dashboard/inference-request-detail.tsx`
- `apps/web/src/components/dashboard/event-timeline.tsx`

**shadcn primitives to add:**

```bash
pnpm --filter @olives/web dlx shadcn@latest add table badge tabs tooltip dialog
```

**UI plan:**

`/dashboard` summary page:

- Range picker (1h / 24h / 7d / 30d)
- Four cards: request count, success rate, p95 latency, total tokens
- Provider/model breakdown table

`/dashboard/requests` list page:

- Filters: provider, model, status, date range
- Paginated table with columns: started, provider/model, status badge, latency, tokens, preview
- Click row → detail page

`/dashboard/requests/[id]` detail page:

- Top: status badge, provider/model, timestamps, latencies, tokens
- Tabs: Previews / Events / Raw metadata
- Events tab: vertical timeline of `inference_events` rows

**No charts in Phase 2.** Numeric cards + tables are sufficient for the debugging use case. Charts (latency over time, token usage trend) are a Phase 4 "future improvement". Adding a chart library now is scope creep.

**Verification:** browser walk-through:

1. After several chat turns of varied lengths, open `/dashboard`. Counts match Postgres.
2. Open `/dashboard/requests`. Latest turn appears at top.
3. Click into a request. Detail shows all events from `inference_events`, ordered.
4. Filter by `status=failed` after deliberately producing a failure (kill api mid-stream).

**Status:** Pending

---

### Step 11 — Admin endpoint: list dead-letter / failed jobs

**Description:** A single endpoint that exposes BullMQ's failed-set so an operator can see jobs stuck after exhausting retries. No replay tooling in Phase 2 — that lands in Phase 3.

**Files created:**

- `apps/api/src/modules/admin/admin.controller.ts`
- `apps/api/src/modules/admin/admin.module.ts`

**Endpoint:**

- `GET /api/v1/admin/queues/:queueName/failed?limit=50` — returns `[{ id, name, failedReason, attemptsMade, timestamp, data }]`

**Implementation:**

```typescript
@Controller('admin/queues')
export class AdminController {
  constructor(@Inject(INGESTION_QUEUE) private readonly ingestionQueue: Queue) {}

  @Get(':queueName/failed')
  async failed(
    @Param('queueName') name: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    if (name !== QUEUE_INGESTION_PROCESSING) {
      throw new NotFoundException(`Unknown queue: ${name}`);
    }
    const jobs = await this.ingestionQueue.getFailed(0, limit - 1);
    return jobs.map((j) => ({
      id: j.id,
      name: j.name,
      failedReason: j.failedReason ?? null,
      attemptsMade: j.attemptsMade,
      timestamp: j.timestamp,
      data: j.data,
    }));
  }
}
```

**Decision:** No auth on `/admin/*` in v1, same as `/dashboard/*`. Operator runs the api behind a reverse proxy that restricts access. Phase 3 may add a static admin key if requested.

**Verification:** force a failure (deliberately corrupt a row's `raw_payload` to fail schema re-parse in the worker, or set `INGESTION_MAX_ATTEMPTS=1` and stop Postgres briefly during processing), then:

```bash
curl -s http://localhost:3001/api/v1/admin/queues/ingestion-processing/failed | jq
```

**Status:** Pending

---

### Step 12 — Phase 2 acceptance pass

**Description:** Wipe state, run the full Phase 1 chat acceptance pass, then verify Phase 2 additions.

```bash
docker compose down -v && docker compose up -d
pnpm db:migrate

# Two terminals (or background)
pnpm --filter @olives/api dev &
pnpm --filter @olives/api dev:worker &
pnpm --filter @olives/web dev &

sleep 5

# Health
curl -s http://localhost:3001/health/ready | jq
# → status=ok, both checks ok

# 5 chat turns of varying length
# (manual UI walk)

# DB inspection
psql <<SQL
SELECT count(*) AS conversations FROM conversations;
SELECT status, count(*) FROM inference_requests GROUP BY status;
SELECT status, count(*) FROM ingestion_logs GROUP BY status;
SELECT event_type, count(*) FROM inference_events GROUP BY event_type;
SQL
# Expected: ingestion_logs all `processed`; inference_events has 1 row per chat completion (request_completed)
#           plus optional first_token rows; no rows in failed/received status if worker is up.

# Dashboard
curl -s http://localhost:3001/api/v1/dashboard/summary?range=24h | jq

# Dashboard UI in browser
# /dashboard shows non-zero requestCount, latency, tokens
# /dashboard/requests lists all turns
# /dashboard/requests/<id> shows event timeline

# Failure path: stop worker mid-flow, do 2 chat turns, restart worker, watch ingestion_logs flip from received → processed
docker compose restart redis    # purges in-flight, BullMQ recovers
pnpm typecheck && pnpm lint && pnpm test
```

**Status:** Pending

## Implementation Notes

**Why single queue.** Volume justifies it. One Worker class, one Processor, one place to debug. Splitting into redaction / enrichment / persistence queues is the kind of design that looks good in a doc and slows everyone down in practice — there's no isolation benefit when all three steps are CPU-trivial Postgres writes.

**Why BullMQ failed-set as source of truth.** `queue_jobs` would require a transactional double-write on every job state change. Failure mode of that double-write is itself a new failure mode. Until we need cross-queue admin views, BullMQ's own state is fine.

**Why the worker process and not in-process job consumption.** Two reasons. First: scaling. The worker can be scaled independently of api replicas in Phase 3+. Second: blast radius. A worker crash from a poison job does not take down the chat API. Both processes share the same codebase so there's no DX cost.

**Why `removeOnComplete` but `removeOnFail: false`.** Completed jobs are noise; the row in `ingestion_logs` is the durable record. Failed jobs need to stay in Redis until an operator looks at them, otherwise the admin endpoint has nothing to show.

**Why constant-time API-key compare.** Standard guidance against timing attacks. Cost: nine extra lines. Worth it.

**Why we re-parse the payload inside the worker.** The HTTP endpoint already parsed it before storage. We re-parse on dequeue as defense in depth: if the Zod schema changes between deploys (e.g., a field is removed), an in-flight job whose `raw_payload` no longer matches will fail loudly on the worker side rather than silently writing a malformed `inference_events` row.

**Why dashboard pages are server components.** Read-only, no real-time updates needed (operators refresh manually when debugging). Server components mean the dashboard data fetches happen in the Node runtime with direct access to internal env, which sidesteps CORS entirely.

**Why we don't redact PII at write time in `InferenceLoggerService`.** That would double the redaction surface: chat path redacts on write to `inference_requests`, worker redacts on write to `inference_events`/`ingestion_logs`. Two implementations means two chances to drift. Worker-only redaction means the synchronous write to `inference_requests` has the raw preview (helps debugging in dev where redaction is off), and durable downstream rows are redacted consistently.

**Why no end-to-end test of the worker via Vitest.** The integration paths are easier to verify manually in the acceptance pass; spinning up a real Redis + Postgres in Vitest for the few code paths that touch BullMQ would 10x test runtime for limited insight. Phase 3 can add `testcontainers`-based integration tests if the team grows.

**What Phase 2 explicitly does NOT do** — pushed to Phase 3:

- No OpenAI provider adapter.
- No provider fallback policy.
- No Dockerfiles. No production `docker-compose.yml`. The worker still runs on the host via `pnpm dev:worker`.
- No GitHub Actions CI.
- No dead-letter **replay** tooling — listing only.
- No retention policy / scheduled cleanup of old `inference_events`.
- No rate limiting.
- No charts on the dashboard.
- No auth on `/dashboard/*` or `/admin/*`.

## Progress Tracking

Progress: 0%

- Step 1 — Ingestion + dashboard Zod schemas: **Pending**
- Step 2 — Redis + BullMQ wiring: **Pending**
- Step 3 — Worker entrypoint: **Pending**
- Step 4 — IngestionModule + API key guard: **Pending**
- Step 5 — PII redaction utility: **Pending**
- Step 6 — LoggingPipelineModule worker processor: **Pending**
- Step 7 — Wire InferenceLoggerService → IngestionEnqueuer: **Pending**
- Step 8 — Redis health indicator: **Pending**
- Step 9 — DashboardModule endpoints: **Pending**
- Step 10 — Dashboard UI pages: **Pending**
- Step 11 — Admin failed-jobs endpoint: **Pending**
- Step 12 — Phase 2 acceptance pass: **Pending**

## Blockers

None.

## Handoff Context

What Phase 3 inherits from Phase 2:

**The full async pipeline works.** Internal chat traffic and external producers share one ingestion path. Both populate `ingestion_logs` and `inference_events`. The dashboard reads from `inference_requests` and `inference_events`.

**Worker is a separate process but a shared codebase.** Phase 3's Dockerfile work needs to produce **two images** that share a build cache (or one image started with two commands). The `nest build --entryFile worker` approach produces `dist/main.js` and `dist/worker.js` in the same `dist/`; the Dockerfile can ship a single image and the compose file picks the entry per service.

**`IngestionService.receive()` is the one ingestion code path.** Phase 3 should keep this invariant. If we add external SDK retry/buffering, it goes in front of `IngestionService.receive` — the method itself stays as the single boundary.

**`provider` is still effectively `'anthropic'`.** Phase 3's first job is the OpenAI adapter and widening `postMessageRequestSchema`'s `provider` enum.

**Dashboard expects `latency_ms` to be populated.** It is, because `InferenceLoggerService.complete` writes it. Failed and cancelled rows have `latency_ms = null` and the dashboard's percentile query ignores nulls automatically (Postgres `percentile_cont` skips NULL). No special handling needed.

**Dead-letter view exists; replay tooling does not.** Phase 3 should add either a `POST /admin/queues/:queueName/failed/:id/retry` endpoint or a small `pnpm script:replay-failed-jobs` CLI. The retry mechanism uses BullMQ's `Job.retry()` which is already a method on the Job class — minimal new code.

**Redaction is on/off via env, no per-pattern toggle.** If Phase 3 (or product feedback) demands "redact emails but not phone numbers" we'd need to expose a more granular config. Not in scope until requested.

**What Phase 2 deliberately leaves for Phase 3 to fix:**

- `provider_configs` table still has zero writers. Phase 3 can seed it as part of multi-provider support.
- `queue_jobs` table still has zero writers. Phase 3 may populate it for dead-letter persistence outside Redis, or leave it as future work.
- No retention / cleanup. `inference_events` and `ingestion_logs` grow without bound. Phase 3 adds a daily cron via `@nestjs/schedule`.
- Worker is single-replica. Phase 3 may launch multiple worker instances; BullMQ handles concurrency naturally, no code changes needed.
- No backpressure if Anthropic latency spikes and chat traffic queues up. Phase 3 can add a rate limiter on `POST /chat/.../messages` if needed.

Phase 3 should open by re-reading this section and `AGENT.md §9` (deployment) and §7 (Phase 3 tasks in the original phase plan), then writing its own `phase-3.md` step plan.
