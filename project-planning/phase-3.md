# Phase 3 — Hardening: Multi-Provider, Rate Limiting, Docker, CI, Retention

## Objective

Take the working app from Phase 2 and make it shippable. Add the second LLM provider so the abstraction is no longer single-vendor in name only. Put rate limiting in front of chat and ingestion. Build Dockerfiles for `api`, `web`, and `worker`, write the production compose file, and document the deployment story. Add a CI workflow that runs on every push. Add the retention job that keeps the event tables from growing unbounded. Add the dead-letter replay tool. Add the lint rule that enforces the user's global "all Zod in `packages/types`" rule mechanically.

Phase 3 introduces **no new user-facing features**. Everything here is ops/quality/hardening work. After Phase 3 a small team can deploy the system to a single VM, run it for months without intervention, and grow it without rewriting foundations.

End state of Phase 3:

- `POST /api/v1/chat/conversations/:id/messages` accepts `provider: 'anthropic' | 'openai'` and `model` for either
- `OpenAiProvider` implements the same `LlmProvider` interface as Anthropic; both pass the same contract test suite
- Per-request fallback opt-in: if `body.fallbackProvider` is set and the primary fails with a retryable error, the chat service retries on the fallback
- `@nestjs/throttler` applied: 30 req/min/IP on `/chat/*`, 600 req/min/IP on `/ingestion/*`, no limit on `/dashboard/*` or `/health/*`
- Three Dockerfiles: `apps/api/Dockerfile` (used for both api and worker), `apps/web/Dockerfile`
- `docker-compose.yml` extended with `api`, `web`, `worker` services. `docker compose up --build` starts the full stack
- GitHub Actions workflow runs install / typecheck / lint / test / prisma migrate dry-run / docker build on every push to any branch
- ESLint enforces `import { z } from 'zod'` is only legal in `packages/types/**`
- `@nestjs/schedule` cron deletes `inference_events` older than `RETENTION_DAYS` (default 90) and archives `ingestion_logs` older than the same window
- `POST /api/v1/admin/queues/:queueName/failed/:jobId/retry` replays a single failed job; `POST /api/v1/admin/queues/:queueName/failed/retry-all` replays all
- `provider_configs` is seeded with two rows at boot (Anthropic + OpenAI), enabling/disabling via DB
- Production deployment doc in `README.md` covers single-VM compose deployment behind Caddy

## Dependencies

Phase 2 must be Completed. Phase 3 assumes:

- Chat + async ingestion + dashboard all work end-to-end.
- `LlmProvider` interface is stable. `LlmProviderFactory` selects by name.
- `IngestionService.receive()` is the single ingestion path.
- BullMQ failed-set visible via `/admin/queues/:queueName/failed`.
- Tests configured via Vitest.

External requirements added in Phase 3:

- An OpenAI API key (`OPENAI_API_KEY`) added to `apps/api/.env`. CI uses a dummy value because the adapter is unit-tested with a mocked SDK.

## Locked Decisions Inherited Into Phase 3

- Auth scope unchanged: no auth on chat or dashboard. Ingestion still gated by static API key. `/admin/*` still relies on reverse-proxy gating in v1.
- SDK still in-process.

## Locked Decisions Made For Phase 3

- **Fallback is opt-in per request, not automatic.** Default behavior: no fallback. The client sets `fallbackProvider: 'openai'` (or vice versa) in the message body if it wants resilience. AGENT.md §8 warns against silent fallbacks between materially different models. Opt-in keeps the semantics honest.
- **One Dockerfile for api + worker.** Same build, two entrypoints (`node dist/main.js` vs `node dist/worker.js`). Saves ~5 minutes per release on image builds and keeps the dependency tree identical between the two processes.
- **Next.js `output: 'standalone'` for the web Dockerfile.** Produces a self-contained `node_modules` subset (~80 MB final image) instead of shipping the full `node_modules` tree (300+ MB). Standard Next 13+ production pattern.
- **GitHub Actions runs on every push, not only PR.** Catches the "I forgot to push" case where someone runs tests locally and never on CI. No deploy step in v1 — CI verifies; deploys happen manually for now.
- **Retention deletes (not soft-deletes) `inference_events`.** They're a debug/audit log. After 90 days the only consumers (dashboard event-timeline) would never look at them. Soft-delete adds query overhead with no benefit.
- **`ingestion_logs` archival = move `rawPayload` to NULL, keep the row.** The row's status/timestamps stay queryable for retention statistics; only the bulky JSON payload gets nulled out. Phase 4 may add S3 archival if real archival becomes a requirement.
- **Rate limit storage: Redis.** `@nestjs/throttler`'s `ThrottlerStorageRedisService` plugs in trivially. Keeps state coherent across api replicas (matters once we scale horizontally in Phase 4).
- **Lint rule for Zod location is an ESLint `no-restricted-imports`** scoped to `apps/**` and `packages/!(types)/**`. `packages/types/**` is exempt. Error message tells the engineer what to do.

## Deliverables

`packages/types` changes:

- update `packages/types/src/chat/message.ts` — widen `provider` to `z.enum(['anthropic', 'openai'])`, add optional `fallbackProvider`, optional `fallbackModel`

`apps/api` additions:

- `apps/api/.env.example` — `OPENAI_API_KEY`, `THROTTLER_TTL_SECONDS`, `THROTTLER_CHAT_LIMIT`, `THROTTLER_INGESTION_LIMIT`, `RETENTION_DAYS`
- `packages/types/src/env/api-env.ts` — same additions
- `apps/api/src/providers/llm/openai.provider.ts`
- update `apps/api/src/providers/llm/provider.factory.ts` — handle `'openai'`
- `apps/api/src/providers/llm/llm-provider.contract.spec.ts` — shared contract test run against both adapters
- `apps/api/src/common/throttler/throttler.module.ts`
- update `apps/api/src/app.module.ts` — register ThrottlerModule, apply `@Throttle()` decorators on chat + ingestion controllers
- `apps/api/src/modules/admin/admin.controller.ts` — add retry endpoints
- `apps/api/src/modules/retention/retention.service.ts` — `@Cron`-scheduled cleanup
- `apps/api/src/modules/retention/retention.module.ts`
- update `apps/api/src/worker.module.ts` — include `RetentionModule` (cron runs on the worker process, not api)
- `apps/api/src/common/seeding/provider-configs.ts` — seed Anthropic + OpenAI rows at boot
- update `apps/api/src/main.ts` — call provider-configs seed
- `apps/api/Dockerfile`
- `apps/api/.dockerignore`
- update `apps/api/package.json` — add `@nestjs/throttler`, `@nestjs/throttler-storage-redis`, `@nestjs/schedule`, `openai`
- tests:
  - `apps/api/test/providers/openai.provider.spec.ts`
  - `apps/api/test/modules/retention/retention.service.spec.ts`
  - `apps/api/test/common/throttler/throttler.spec.ts` (sanity test against rate limits)

`apps/web` additions:

- `apps/web/Dockerfile`
- `apps/web/.dockerignore`
- update `apps/web/next.config.ts` — `output: 'standalone'`
- update `apps/web/src/components/chat/composer.tsx` — provider/model picker
- update `apps/web/src/lib/api-client.ts` — pass provider/model in `postMessage`

Root-level changes:

- update `docker-compose.yml` — add `api`, `web`, `worker` services
- `docker-compose.override.yml.example` — sample local-only overrides (hot reload mounts)
- `.env.production.example`
- update `eslint.config.mjs` — add `no-restricted-imports` rule banning `zod` outside `packages/types/**`
- `.github/workflows/ci.yml`
- update `README.md` — production deployment section (Caddy, backups, env, scaling notes)

## Step-by-step Tasks

---

### Step 1 — OpenAI provider adapter

**Description:** Implement `OpenAiProvider` against the existing `LlmProvider` interface. Use the official `openai` Node SDK. Mirror the structure of `AnthropicProvider` so the two are visually comparable in code review.

**Dependencies added (`apps/api`):**

- `openai@^4`

**Files created:**

- `apps/api/src/providers/llm/openai.provider.ts`

**Files changed:**

- `apps/api/src/providers/llm/provider.factory.ts` — add `'openai'` case
- `apps/api/src/providers/llm/provider.module.ts` — provide `OpenAiProvider`
- `packages/types/src/env/api-env.ts` — `OPENAI_API_KEY: z.string().min(1)`
- `apps/api/.env.example`

**Key content:**

```typescript
import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { EnvService } from '../../config/config.module';
import type { LlmProvider, LlmRequest, LlmStreamChunk } from './provider.interface';

@Injectable()
export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;

  constructor(env: EnvService) {
    this.client = new OpenAI({ apiKey: env.get('OPENAI_API_KEY') });
  }

  async *stream(request: LlmRequest): AsyncIterable<LlmStreamChunk> {
    const stream = await this.client.chat.completions.create(
      {
        model: request.model,
        max_tokens: request.maxOutputTokens ?? 4096,
        temperature: request.temperature,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          ...(request.systemPrompt ? [{ role: 'system' as const, content: request.systemPrompt }] : []),
          ...request.messages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({ role: m.role, content: m.content })),
        ],
      },
      { signal: request.abortSignal },
    );

    let inputTokens = 0;
    let outputTokens = 0;
    try {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (typeof delta === 'string' && delta.length > 0) {
          yield { type: 'token', delta };
        }
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
        }
      }
      yield { type: 'completed', usage: { inputTokens, outputTokens } };
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      if (isAbort) return;
      yield this.toErrorChunk(err);
    }
  }

  private toErrorChunk(err: unknown): LlmStreamChunk {
    if (err instanceof OpenAI.APIError) {
      return {
        type: 'error',
        code: `openai_${err.status ?? 'unknown'}`,
        message: err.message,
        retryable: err.status !== undefined && err.status >= 500,
      };
    }
    const message = err instanceof Error ? err.message : 'Unknown provider error';
    return { type: 'error', code: 'openai_unknown', message, retryable: false };
  }
}
```

**Note:** the cast-like literal `'system' as const` inside the array-spread is a `const` assertion, which the no-cast lint rule bans. Rewrite:

```typescript
const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
if (request.systemPrompt) {
  messages.push({ role: 'system', content: request.systemPrompt });
}
for (const m of request.messages) {
  if (m.role === 'user' || m.role === 'assistant') {
    messages.push({ role: m.role, content: m.content });
  }
}
```

Same behavior, no `as const`.

**Update `provider.factory.ts`:**

```typescript
@Injectable()
export class LlmProviderFactory {
  constructor(
    private readonly anthropic: AnthropicProvider,
    private readonly openai: OpenAiProvider,
  ) {}

  get(name: string): LlmProvider {
    if (name === 'anthropic') return this.anthropic;
    if (name === 'openai') return this.openai;
    throw new Error(`Unsupported LLM provider: ${name}`);
  }
}
```

**Widen the chat schema** in `packages/types/src/chat/message.ts`:

```typescript
export const llmProviderNameSchema = z.enum(['anthropic', 'openai']);
export const postMessageRequestSchema = z.object({
  content: z.string().min(1).max(50000),
  stream: z.boolean().default(true),
  provider: llmProviderNameSchema.default('anthropic'),
  model: z.string().min(1).default('claude-sonnet-4-6'),
  fallbackProvider: llmProviderNameSchema.optional(),
  fallbackModel: z.string().optional(),
});
```

**Verification:** unit test in Step 2 covers contract conformance. Manual UI test: switch provider/model in the composer, send a message, dashboard shows `provider='openai'`.

**Status:** Pending

---

### Step 2 — Shared contract test for both adapters

**Description:** A single `.spec.ts` file that runs the same assertions against both `AnthropicProvider` and `OpenAiProvider` with their respective SDKs mocked. Prevents one adapter from drifting from the other's behavior.

**Files created:**

- `apps/api/test/providers/llm-provider.contract.spec.ts`

**What the contract test asserts** for any `LlmProvider`:

1. `stream()` yields at least one `{ type: 'token' }` chunk for a non-empty mocked response.
2. `stream()` yields exactly one terminal `{ type: 'completed' }` chunk with non-negative token counts.
3. On a simulated abort, `stream()` returns cleanly with no `completed` or `error` chunk.
4. On a 5xx SDK error, `stream()` yields a single `{ type: 'error', retryable: true }`.
5. On a 4xx SDK error, `stream()` yields `{ type: 'error', retryable: false }`.
6. `name` is the expected string.

Both adapter test files import this contract suite and run it with a small adapter-specific mock setup.

**Verification:**

```bash
pnpm --filter @olives/api test test/providers
# 2 adapter contract suites, all asserts pass.
```

**Status:** Pending

---

### Step 3 — Provider fallback logic in `ChatService`

**Description:** When `body.fallbackProvider` is set and the primary stream yields `{ type: 'error', retryable: true }` **before any tokens have been emitted**, retry with the fallback provider. Crucially: do **not** fallback after tokens have been emitted — the user has already seen partial output from one model.

**Files changed:**

- `apps/api/src/modules/chat/chat.service.ts` — modify `runInferenceInBackground` to detect retryable failure before first token

**Logic:**

```typescript
private async runInferenceInBackground(ctx: InferenceContext, body: PostMessageRequest, conversationId: string): Promise<void> {
  const primary = this.providerFactory.get(body.provider);
  const fallback = body.fallbackProvider
    ? this.providerFactory.get(body.fallbackProvider)
    : null;

  let success = await this.runOnce(ctx, primary, body, conversationId, /* allowFallback */ fallback !== null);
  if (!success && fallback !== null) {
    await this.runOnce(ctx, fallback, { ...body, provider: body.fallbackProvider!, model: body.fallbackModel ?? body.model }, conversationId, false);
  }
}

private async runOnce(
  ctx: InferenceContext,
  provider: LlmProvider,
  body: PostMessageRequest,
  conversationId: string,
  allowFallback: boolean,
): Promise<boolean> {
  // ... stream loop ...
  // On first error chunk before any token has been emitted, if allowFallback and chunk.retryable:
  //   - emit nothing on SSE
  //   - log the failed attempt as a separate inference_events row (so we can audit the fallback)
  //   - return false (signals caller to invoke fallback)
  // Otherwise: handle normally, emit SSE error event, return true.
}
```

The `runOnce` distinguishes "I failed and want a fallback" from "I failed terminally". Without this split the user could see two streams interleaved.

**Audit trail:** when a fallback fires, we write a second `inference_requests` row (different `id`, same `conversation_id`, same `user_message_id`, distinct `provider`). Both rows have `status='failed'` and `status='completed'` respectively. Dashboard shows both turns; the operator can see the fallback happened. Cleaner than overwriting the original.

**Note** on the `body.fallbackProvider!` non-null assertion — that's a non-null assertion `!`, which IS a TypeScript assertion form and IS banned by the no-cast rule. Rewrite:

```typescript
if (!success && fallback !== null && body.fallbackProvider !== undefined) {
  const fbBody = {
    ...body,
    provider: body.fallbackProvider,
    model: body.fallbackModel ?? body.model,
  };
  await this.runOnce(ctx, fallback, fbBody, conversationId, false);
}
```

Narrows cleanly. No assertion.

**Verification:** end-to-end test by deliberately providing an invalid Anthropic key (forces 401 → not retryable, no fallback fires) versus invalid model name (forces 4xx — also not retryable). To trigger 5xx + fallback we need to mock; this is covered in a Vitest test that mocks the primary to throw a 503 and asserts fallback runs.

**Status:** Pending

---

### Step 4 — Rate limiting via `@nestjs/throttler`

**Description:** Apply per-IP rate limits to chat and ingestion endpoints. Dashboard and health endpoints are unlimited. State lives in Redis so it stays consistent across replicas.

**Dependencies added:**

- `@nestjs/throttler@^6`
- `@nest-lab/throttler-storage-redis` (or `@nestjs/throttler-storage-redis` — verify available package at install time)

**Files created:**

- `apps/api/src/common/throttler/throttler.module.ts`

**Files changed:**

- `apps/api/src/app.module.ts` — register `ThrottlerModule.forRootAsync(...)` and `APP_GUARD: ThrottlerGuard`
- `apps/api/src/modules/chat/chat.controller.ts` — `@Throttle({ default: { limit: CHAT_LIMIT, ttl: TTL } })`
- `apps/api/src/modules/ingestion/ingestion.controller.ts` — `@Throttle({ default: { limit: INGESTION_LIMIT, ttl: TTL } })`
- `apps/api/src/modules/dashboard/dashboard.controller.ts` — `@SkipThrottle()`
- `apps/api/src/modules/admin/admin.controller.ts` — `@SkipThrottle()`
- `apps/api/src/modules/health/health.controller.ts` — `@SkipThrottle()`

**Schema additions** in `packages/types/src/env/api-env.ts`:

```typescript
THROTTLER_TTL_SECONDS: z.coerce.number().int().positive().default(60),
THROTTLER_CHAT_LIMIT: z.coerce.number().int().positive().default(30),
THROTTLER_INGESTION_LIMIT: z.coerce.number().int().positive().default(600),
```

**Verification:**

```bash
# Hammer chat with 35 requests in <60s — last few should 429
for i in $(seq 1 35); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/v1/chat/conversations/$CONV/messages \
    -H "Content-Type: application/json" -d '{"content":"ping"}'
done
# Expected: first 30 = 201, remainder = 429
```

**Note:** `429` responses include `Retry-After` header.

**Status:** Pending

---

### Step 5 — Lint rule: ban `zod` imports outside `packages/types`

**Description:** Mechanically enforce the user's global "all Zod in packages/types" rule via ESLint. Currently this is enforced socially.

**Files changed:**

- `eslint.config.mjs`

**Rule:**

```js
{
  files: ['apps/**/*.ts', 'apps/**/*.tsx', 'packages/!(types)/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [{
        name: 'zod',
        message: 'Import Zod schemas from @olives/types. New Zod schemas must be authored in packages/types and re-exported.',
      }],
    }],
  },
},
```

**Side note:** the lint rule allows `import type` from `zod`, since `import type` doesn't pull runtime code. We want to allow that for type aliases that need `z.infer` shape. ESLint's `no-restricted-imports` does have an `allowTypeImports` option in newer versions.

Actually safer: ban all `'zod'` imports outside `packages/types`. Engineers who need `z.infer<...>` should import the `type` from `@olives/types` instead — which is exactly how every existing schema is consumed.

**Verification:**

```bash
# Temporarily add `import { z } from 'zod';` in apps/api/src/main.ts
pnpm --filter @olives/api lint
# Expected: error message mentioning @olives/types
# Remove the import; lint passes again.
```

**Status:** Pending

---

### Step 6 — Retention: scheduled cleanup of old data

**Description:** Daily cron job that deletes `inference_events` rows older than `RETENTION_DAYS` and nulls out `raw_payload`/`normalized_payload` on `ingestion_logs` older than the same threshold. Runs on the **worker** process, not the api — so a worker outage stops cleanups but doesn't impact serving traffic.

**Dependencies added:**

- `@nestjs/schedule@^4`

**Files created:**

- `apps/api/src/modules/retention/retention.service.ts`
- `apps/api/src/modules/retention/retention.module.ts`

**Files changed:**

- `apps/api/src/worker.module.ts` — import `ScheduleModule.forRoot()` and `RetentionModule`
- `packages/types/src/env/api-env.ts` — `RETENTION_DAYS`

**Schema:**

```typescript
RETENTION_DAYS: z.coerce.number().int().positive().default(90),
```

**`retention.service.ts`:**

```typescript
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Logger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { EnvService } from '../../config/config.module';

@Injectable()
export class RetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly env: EnvService,
    private readonly logger: Logger,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'retention-cleanup' })
  async runRetention(): Promise<void> {
    const days = this.env.get('RETENTION_DAYS');
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const t0 = Date.now();

    const eventsDeleted = await this.prisma.inferenceEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    const logsNulled = await this.prisma.$executeRaw`
      UPDATE ingestion_logs
      SET raw_payload = '{}'::jsonb,
          normalized_payload = NULL
      WHERE received_at < ${cutoff}
        AND (raw_payload <> '{}'::jsonb OR normalized_payload IS NOT NULL)
    `;

    this.logger.log(
      { eventsDeleted: eventsDeleted.count, logsNulled, durationMs: Date.now() - t0, cutoff },
      'retention-cleanup completed',
    );
  }
}
```

**Why archive `ingestion_logs` instead of delete:** the timestamp and status rows remain queryable for retention statistics ("how many ingestions did we process last quarter"). Only the bulky JSON payloads are dropped. Trivial to retain, useful for ops auditing.

**Manual trigger** (for ops/admin use): also expose a method that admin can invoke once via a `pnpm script:run-retention` command. Implement as a small Node script that boots `WorkerModule` and calls `retention.runRetention()`:

```bash
pnpm --filter @olives/api script:run-retention
```

**Verification:**

```bash
# Seed test data:
psql -c "INSERT INTO inference_events (id, event_type, event_timestamp, payload, created_at)
         VALUES (gen_random_uuid(), 'request_completed', NOW() - INTERVAL '100 days', '{}', NOW() - INTERVAL '100 days');"

# Run retention manually
pnpm --filter @olives/api script:run-retention

# Verify row gone
psql -c "SELECT count(*) FROM inference_events WHERE created_at < NOW() - INTERVAL '90 days';"
# → 0
```

**Status:** Pending

---

### Step 7 — Dead-letter replay endpoints

**Description:** Two endpoints. `POST /admin/queues/:queueName/failed/:jobId/retry` retries one job. `POST /admin/queues/:queueName/failed/retry-all` retries the whole failed set.

**Files changed:**

- `apps/api/src/modules/admin/admin.controller.ts`

**Implementation:**

```typescript
@Post(':queueName/failed/:jobId/retry')
async retryOne(
  @Param('queueName') name: string,
  @Param('jobId') jobId: string,
): Promise<{ retried: number }> {
  this.assertKnownQueue(name);
  const job = await this.ingestionQueue.getJob(jobId);
  if (!job) throw new NotFoundException(`Job ${jobId} not found`);
  await job.retry();
  return { retried: 1 };
}

@Post(':queueName/failed/retry-all')
async retryAll(
  @Param('queueName') name: string,
  @Query('limit', new DefaultValuePipe(1000), ParseIntPipe) limit: number,
): Promise<{ retried: number }> {
  this.assertKnownQueue(name);
  const failed = await this.ingestionQueue.getFailed(0, limit - 1);
  let n = 0;
  for (const job of failed) {
    await job.retry();
    n += 1;
  }
  return { retried: n };
}
```

**Tradeoff** — `retry-all` is a "blunt instrument". If jobs are failing because of a genuine schema mismatch, retrying them all just generates more failures. We deliberately don't auto-replay; this stays as an operator action.

**Verification:**

```bash
# Force a failure: set INGESTION_MAX_ATTEMPTS=1, then post a payload that fails schema parse
# After failure, the job is in the failed set
curl -s http://localhost:3001/api/v1/admin/queues/ingestion-processing/failed | jq '.[0].id'
# Then retry it
curl -s -X POST http://localhost:3001/api/v1/admin/queues/ingestion-processing/failed/<id>/retry | jq
```

**Status:** Pending

---

### Step 8 — Seed `provider_configs` at boot

**Description:** Insert two rows into `provider_configs` for Anthropic and OpenAI at boot. The table is read by the dashboard (in Phase 4 maybe) but for Phase 3 it exists to make the data model honest — we have multi-provider support, the table that documents available providers should reflect that.

**Files created:**

- `apps/api/src/common/seeding/provider-configs.ts`

**Files changed:**

- `apps/api/src/main.ts` — call `seedProviderConfigs(prisma)` after `seedAnonymousUser`

**Content:**

```typescript
const ANTHROPIC = {
  provider: 'anthropic',
  displayName: 'Anthropic',
  isEnabled: true,
  defaultModel: 'claude-sonnet-4-6',
  timeoutMs: 60_000,
  settings: { supportsStreaming: true, maxContextTokens: 200_000 },
};
const OPENAI = {
  provider: 'openai',
  displayName: 'OpenAI',
  isEnabled: true,
  defaultModel: 'gpt-4.1-mini',
  timeoutMs: 60_000,
  settings: { supportsStreaming: true, maxContextTokens: 128_000 },
};

export async function seedProviderConfigs(prisma: PrismaService): Promise<void> {
  for (const cfg of [ANTHROPIC, OPENAI]) {
    await prisma.providerConfig.upsert({
      where: { provider: cfg.provider },
      create: cfg,
      update: { /* don't overwrite operator-edited fields like isEnabled/defaultModel */ },
    });
  }
}
```

**Verification:**

```bash
pnpm db:studio   # provider_configs has two rows
```

**Status:** Pending

---

### Step 9 — Dockerfile for `api` + `worker` (one image, two entrypoints)

**Description:** Multi-stage Dockerfile in `apps/api/Dockerfile`. Stage 1 installs deps + builds Nest. Stage 2 is a slim runtime that contains only what's needed. The same image is used by the `api` compose service (entrypoint `node dist/main.js`) and the `worker` compose service (entrypoint `node dist/worker.js`).

**Files created:**

- `apps/api/Dockerfile`
- `apps/api/.dockerignore`

**Dockerfile:**

```dockerfile
# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /repo

# ---- deps stage: install pnpm + workspace deps with cache mount ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/types/package.json packages/types/
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---- build stage: copy source + Prisma client + Nest build ----
FROM base AS build
COPY --from=deps /repo/node_modules /repo/node_modules
COPY --from=deps /repo/apps/api/node_modules /repo/apps/api/node_modules
COPY --from=deps /repo/packages/types/node_modules /repo/packages/types/node_modules
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/types ./packages/types
COPY apps/api ./apps/api
RUN cd apps/api && pnpm prisma generate
RUN cd apps/api && pnpm build

# ---- runtime stage ----
FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/prisma ./prisma
COPY --from=build /repo/apps/api/node_modules ./node_modules
COPY --from=build /repo/node_modules ./node_modules-root
# Symlink workspace packages so @olives/types resolves
COPY --from=build /repo/packages ./packages

CMD ["node", "dist/main.js"]
```

**`apps/api/.dockerignore`:**

```
node_modules
.next
dist
.env
.env.*
!.env.example
**/*.log
.git
test
```

**Note on monorepo + Docker:** the simplest pattern is "copy the whole monorepo, install once, build once". The Dockerfile above stays close to that — it only does selective copy for the deps stage (to maximize cache hits when only source changes). The runtime stage doesn't ship dev deps because `pnpm install --prod` runs in a separate `--mount=type=cache` step that we'd want to add if final image size matters. For Phase 3 we ship dev+prod deps in the runtime image — adds ~50MB but simplifies. Phase 4 can optimize.

**Migrate-on-start:** the compose `api` service runs `pnpm prisma migrate deploy && node dist/main.js` as its command, so a fresh deploy applies any new migrations before the api starts serving. We do **not** put `prisma migrate` in the Dockerfile because then every container restart would re-run it.

**Verification:**

```bash
docker build -f apps/api/Dockerfile -t olives-api:dev .
docker run --rm -it --network olives_default --env-file apps/api/.env olives-api:dev
# Inside: process boots, /health/live returns ok if you exec another shell and curl localhost:3001
```

**Status:** Pending

---

### Step 10 — Dockerfile for `web`

**Description:** Standard Next.js 15 standalone-output Dockerfile.

**Files changed:**

- `apps/web/next.config.ts` — `output: 'standalone'`

**Files created:**

- `apps/web/Dockerfile`
- `apps/web/.dockerignore`

**Dockerfile:**

```dockerfile
FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/types/package.json packages/types/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /repo/node_modules /repo/node_modules
COPY --from=deps /repo/apps/web/node_modules /repo/apps/web/node_modules
COPY --from=deps /repo/packages/types/node_modules /repo/packages/types/node_modules
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/types ./packages/types
COPY apps/web ./apps/web
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN cd apps/web && pnpm build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

**Why `ARG NEXT_PUBLIC_API_BASE_URL`:** Next.js inlines `NEXT_PUBLIC_*` env at build time. The compose file passes the production API base URL as a build arg so the resulting image bakes in the right value.

**Verification:**

```bash
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_BASE_URL=http://localhost:3001 -t olives-web:dev .
docker run --rm -p 3000:3000 olives-web:dev
# Browse http://localhost:3000 → app loads
```

**Status:** Pending

---

### Step 11 — Extended `docker-compose.yml` with `api`, `web`, `worker`

**Description:** Add the three app services. Postgres and Redis stay as they were. Provide a `docker-compose.override.yml.example` for local-dev bind mounts.

**Files changed:**

- `docker-compose.yml`

**Files created:**

- `docker-compose.override.yml.example`

**Additions to `docker-compose.yml`:**

```yaml
  api:
    image: olives-api:${TAG:-latest}
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    container_name: olives-api
    restart: unless-stopped
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    environment:
      NODE_ENV: production
      PORT: 3001
      DATABASE_URL: postgresql://${POSTGRES_USER:-olives}:${POSTGRES_PASSWORD:-olives}@postgres:5432/${POSTGRES_DB:-olives}
      REDIS_URL: redis://redis:6379
      LOG_LEVEL: info
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      INGESTION_API_KEY: ${INGESTION_API_KEY}
      CORS_ORIGIN: http://localhost:3000
      PII_REDACTION_ENABLED: "true"
      RETENTION_DAYS: 90
    command: sh -c "cd /app && node node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma && node dist/main.js"
    ports:
      - "${API_PORT:-3001}:3001"
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3001/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      timeout: 5s
      retries: 6

  worker:
    image: olives-api:${TAG:-latest}
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    container_name: olives-worker
    restart: unless-stopped
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
      api:    { condition: service_healthy }   # migrations applied before worker starts
    environment:
      # Same env as api
      NODE_ENV: production
      DATABASE_URL: postgresql://${POSTGRES_USER:-olives}:${POSTGRES_PASSWORD:-olives}@postgres:5432/${POSTGRES_DB:-olives}
      REDIS_URL: redis://redis:6379
      LOG_LEVEL: info
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      INGESTION_API_KEY: ${INGESTION_API_KEY}
      PII_REDACTION_ENABLED: "true"
      RETENTION_DAYS: 90
      INGESTION_QUEUE_CONCURRENCY: 5
      INGESTION_MAX_ATTEMPTS: 5
    command: ["node", "dist/worker.js"]

  web:
    image: olives-web:${TAG:-latest}
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      args:
        NEXT_PUBLIC_API_BASE_URL: ${NEXT_PUBLIC_API_BASE_URL:-http://localhost:3001}
    container_name: olives-web
    restart: unless-stopped
    depends_on:
      api: { condition: service_healthy }
    ports:
      - "${WEB_PORT:-3000}:3000"
```

**Migration on api start:** the `command` chains `prisma migrate deploy` and `node dist/main.js`. If migrations fail the api exits and compose restarts it (eventually failing healthcheck if the migration is genuinely broken). The worker waits for api to be healthy, so it never starts against a stale schema.

**`docker-compose.override.yml.example`** — bind-mount source for local dev, override commands to use `nest start --watch`. Shipped as `.example`; engineer copies to `docker-compose.override.yml` (gitignored) if they want Docker-based dev. Most devs will keep running via `pnpm dev` on the host.

**Verification:**

```bash
docker compose down -v
docker compose up --build
# All five services healthy after ~30s
# Browse http://localhost:3000 → app loads → send a chat turn → dashboard updates → ingestion_logs row appears
```

**Status:** Pending

---

### Step 12 — GitHub Actions CI

**Description:** A single `ci.yml` workflow that runs on every push. No deploy step in v1. Tests run against a service container for Postgres + Redis. Docker images are built but not pushed (sanity check that they build, not a registry publish).

**Files created:**

- `.github/workflows/ci.yml`

**Workflow:**

```yaml
name: CI
on:
  push:
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: olives
          POSTGRES_PASSWORD: olives
          POSTGRES_DB: olives
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U olives -d olives"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      DATABASE_URL: postgresql://olives:olives@localhost:5432/olives
      REDIS_URL: redis://localhost:6379
      ANTHROPIC_API_KEY: test-key
      OPENAI_API_KEY: test-key
      INGESTION_API_KEY: ci-key
      CORS_ORIGIN: http://localhost:3000
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @olives/api prisma migrate deploy
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - name: Build api image
        run: docker build -f apps/api/Dockerfile -t olives-api:ci .
      - name: Build web image
        run: docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_BASE_URL=http://localhost:3001 -t olives-web:ci .
```

**Why everything in one job:** running install/lint/typecheck/test/build in separate parallel jobs would mean re-installing pnpm deps in each job. The cache restore time dwarfs the parallelism win for a small monorepo. One job, sequential, ~3-4 minutes total.

**Verification:** push the branch, watch the workflow turn green.

**Status:** Pending

---

### Step 13 — Production deployment doc in `README.md`

**Description:** A section in `README.md` that walks an operator through deploying to a single VM behind Caddy with TLS. Backup strategy, env management, log access. No fancy infra-as-code — `docker compose up -d` is the deployment.

**README additions:**

- **Production prerequisites:** 1 VM (2+ vCPU, 4+ GB RAM), Docker, Docker Compose v2, a domain pointed at the VM's IP
- **Files to prepare:**
  - `.env` populated from `.env.production.example` — strong `POSTGRES_PASSWORD`, valid API keys, `CORS_ORIGIN=https://chat.example.com`
  - `Caddyfile`:
    ```
    chat.example.com {
      reverse_proxy localhost:3000
    }
    api.chat.example.com {
      reverse_proxy localhost:3001
    }
    ```
- **First deploy:**
  ```bash
  git clone <repo> /opt/olives && cd /opt/olives
  cp .env.production.example .env && $EDITOR .env
  docker compose up -d --build
  ```
- **Updates:** `git pull && docker compose up -d --build` (migrations apply automatically via the api's command chain)
- **Backups:** install `cron` job that runs `docker exec olives-postgres pg_dump -U olives olives | gzip > /var/backups/olives-$(date +%Y%m%d).sql.gz` daily; retain 14 days
- **Logs:** `docker compose logs -f api worker web` for tailing; structured JSON output ships to whatever log shipper the operator runs (left out of scope here)
- **Scaling notes:** when chat load grows, scale workers first (`docker compose up -d --scale worker=3`) since BullMQ handles concurrency natively. API is stateless and can also be scaled — at that point add a real load balancer in front instead of Caddy single-target proxy

**Files created:**

- `.env.production.example`

**Verification:** the README's "First deploy" walkthrough should work on a fresh Ubuntu 24.04 VM end-to-end. We don't actually deploy in Phase 3, but the doc must be specific enough that an operator could.

**Status:** Pending

---

### Step 14 — Phase 3 acceptance pass

```bash
# From a clean checkout
docker compose down -v
docker compose build
docker compose up -d
sleep 20

# All five containers healthy
docker compose ps

# Chat works
curl -s http://localhost:3001/health/ready | jq
# Open http://localhost:3000, send messages via both providers (composer picker)
# Verify dashboard shows mix of provider='anthropic' and provider='openai'

# Rate limiting
for i in $(seq 1 35); do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/v1/chat/conversations/$CONV/messages -d '{"content":"x"}' -H "Content-Type: application/json"; done
# Last 5 should be 429

# Retention manual trigger
docker compose exec worker node -e "require('./dist/scripts/run-retention.js').run()"   # or similar entrypoint
# Logs show retention completed

# Replay
# Force a failure (corrupt a payload), see failed entry, POST retry, see succeed

# CI green
git push origin <branch>   # CI workflow turns green

# Lint guard
# Add `import { z } from 'zod';` to apps/api/src/main.ts; pnpm lint fails with the custom message.

# Tests
pnpm test
# All green including new provider + retention + throttler tests
```

**Status:** Pending

## Implementation Notes

**Why one Dockerfile for api + worker.** Same source, same deps, same Prisma client. Two different `CMD`s. Building twice would double CI time for no benefit.

**Why Caddy.** Automatic HTTPS via Let's Encrypt is one line of config. Nginx is a fine alternative; Caddy is just less ceremony. The README documents Caddy because that's what we recommend, not because it's required.

**Why no Kubernetes / Terraform / cloud-specific deployment.** Premature. The chosen v1 deployment shape (single VM, compose) supports tens of thousands of chat turns/day on modest hardware. Kubernetes is correct when you need rolling updates, autoscaling, or multi-region. None of those are real v1 requirements.

**Why opt-in fallback.** Silent fallbacks across materially different models hide cost/quality differences from the caller. The caller saying "if Anthropic fails, fall back to OpenAI gpt-4.1-mini" is a deliberate choice with a known cost profile. An automatic policy would be a foot-gun the first time the secondary model produces a different answer that breaks downstream parsing.

**Why retention deletes events but archives logs.** Events are debugging data — their value drops to ~0 after a month. Logs are the audit trail and have summary value (counts, statuses) long after the bulky JSON payload becomes irrelevant. Different decay curves, different cleanup behavior.

**Why we run retention on the worker, not api.** Two reasons. First, isolation: a slow retention query (large `DELETE`) shouldn't hold a Postgres connection from the chat-request pool. Second, single ownership: only one process should be running scheduled cleanups. The worker is naturally that process; if we scale to multiple workers, `@nestjs/schedule` with a leader-election pattern (or Postgres advisory locks) keeps it singleton. We document this caveat — Phase 4 may add the lock if/when worker replicas land.

**Why CI doesn't deploy.** v1 deploys are infrequent enough (initial launch + occasional updates) that manual `git pull && docker compose up -d --build` on the VM is fine. Auto-deploy from CI requires SSH credentials in GitHub secrets, deployment lock handling, rollback strategy — all reasonable to add later, none required now.

**Why the lint rule message reads like a doc.** ESLint errors are read by humans, often after a year of forgetting why the rule exists. The message tells them exactly where to put the schema and why.

**Why `import type` from zod is allowed (or banned).** We ban all zod imports outside `packages/types`. Type-only consumption goes through `@olives/types` which re-exports the inferred types. This means even `type Foo = z.infer<...>` written in app code is illegal — the engineer is expected to define the schema once in `packages/types`, re-export the type, and consume the type. No two-step temptation to "just inline this Zod schema here for now".

**What Phase 3 explicitly does NOT do** — pushed to "Future improvements" in `AGENT.md §10`:

- OpenTelemetry traces across web/api/worker
- Materialized views or summary tables for dashboard
- S3 archival of `raw_payload` data
- Multi-tenant isolation (rows-level or schema-level)
- RBAC for admin
- Provider-side prompt caching support
- Semantic search across conversations
- Playwright end-to-end browser tests
- Auto-deploy from CI
- Multi-region or HA topology

These are deliberate non-goals. Phase 3 is "make it shippable for a small team". Anything beyond that is future engineering work, not v1.

## Progress Tracking

Progress: 0%

- Step 1 — OpenAI provider adapter: **Pending**
- Step 2 — Shared adapter contract test: **Pending**
- Step 3 — Provider fallback logic in ChatService: **Pending**
- Step 4 — Rate limiting via @nestjs/throttler: **Pending**
- Step 5 — Lint rule banning Zod outside packages/types: **Pending**
- Step 6 — Retention scheduled cleanup: **Pending**
- Step 7 — Dead-letter replay endpoints: **Pending**
- Step 8 — Seed provider_configs: **Pending**
- Step 9 — Dockerfile for api + worker: **Pending**
- Step 10 — Dockerfile for web: **Pending**
- Step 11 — Extended docker-compose.yml with all services: **Pending**
- Step 12 — GitHub Actions CI workflow: **Pending**
- Step 13 — Production deployment README section: **Pending**
- Step 14 — Phase 3 acceptance pass: **Pending**

## Blockers

None.

## Handoff Context

At the end of Phase 3 the project is **v1-shippable**. There is no Phase 4 in this planning directory. If/when the team picks up follow-on work, the natural starting points are documented in `AGENT.md §10` ("Future Improvements") and reproduced below for convenience:

- OpenTelemetry traces across the full request lifecycle (web → api → worker → provider).
- Materialized views / summary tables for dashboard performance at higher traffic.
- S3-compatible archival for raw `inference_events` and `ingestion_logs` payloads after the in-DB retention window.
- Multi-tenant row-level isolation if the product opens to external customers.
- RBAC for `/dashboard/*` and `/admin/*`.
- Provider-side prompt caching (Anthropic cache_control, OpenAI prompt caching) — wired into `LlmRequest` interface.
- Semantic search over conversations using pgvector or a dedicated vector store.
- Scheduled remote agent ("routine") that summarizes daily usage and posts to Slack.
- Auto-deploy from CI (GitHub Actions → SSH or ArgoCD).
- HA topology: multiple api/worker replicas behind a real load balancer, Redis Sentinel or managed Redis, Postgres replicas.

Each of those is a natural Phase 4+ candidate; none is required for the v1 launch this plan covers.
