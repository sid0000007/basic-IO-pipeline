# Phase 1 — Chat Application (Anthropic, Streaming, Synchronous Persistence)

## Objective

Make the chatbot work end-to-end. A user opens the web app, picks (or creates) a conversation, sends a message, and watches an Anthropic Claude response stream in token by token. They can cancel mid-generation. They can leave and come back to resume the conversation. The api writes every conversation, message, and inference request to Postgres **synchronously** as part of the request flow — no queues yet, no `inference_events` table writes yet, no `ingestion_logs` table writes yet. Those land in Phase 2.

End state of Phase 1:

- `POST /api/v1/chat/conversations` creates a row in `conversations` and returns its id
- `GET /api/v1/chat/conversations` lists conversations (cursor-paginated, newest first)
- `GET /api/v1/chat/conversations/:id` returns metadata + ordered message history
- `POST /api/v1/chat/conversations/:id/messages` writes the user message, creates an `inference_requests` row in `queued` state, kicks off an Anthropic call in the background, and returns `{ inferenceRequestId, status: "queued" }`
- `GET /api/v1/chat/conversations/:id/stream/:inferenceRequestId` opens an SSE connection that emits `message_start`, `token`, `message_complete`, `error`, or `cancelled` events
- `POST /api/v1/chat/inferences/:id/cancel` aborts an in-flight stream and persists `cancelled` status
- Web app under `/conversations` lists conversations and lets the user resume any of them
- Web app under `/conversations/:id` shows full history and streams new assistant turns in real time
- Cancellation button works
- Multi-turn context is preserved — the model receives the prior N messages on every turn
- First Vitest tests pass for the Anthropic adapter and the conversation service
- `pnpm lint`, `pnpm typecheck`, `pnpm test` all green

Phase 1 ships **the synchronous path only**. The in-process `InferenceLoggerService` writes directly to `inference_requests`. Phase 2 will add a BullMQ fan-out that also populates `inference_events` and `ingestion_logs`.

## Dependencies

Phase 0 must be Completed. Phase 1 assumes:

- pnpm workspace functional, all 8 Prisma tables migrated.
- `EnvService` and Pino logger available across `apps/api`.
- `@olives/types` resolves from both apps.
- ESLint `no-cast` rule active.
- `apps/web` boots and renders a shadcn-styled page.
- `/health/ready` returns `database: ok`.

External requirements added in Phase 1:

- An Anthropic API key. The developer puts `ANTHROPIC_API_KEY=sk-ant-...` in `apps/api/.env`. CI uses a dummy value because Vitest mocks the SDK.

## Locked Decisions Inherited Into Phase 1

These were confirmed before Phase 0 was written and bind Phase 1:

- **Auth: none in v1.** A single anonymous user row is seeded at boot. Every conversation belongs to that user. No login UI, no session middleware.
- **LLM providers: Anthropic only.** The `LlmProvider` interface is general, but the only adapter implemented in Phase 1 is `AnthropicProvider`. The factory throws if any other `provider` value is requested. OpenAI lands in Phase 3.
- **SDK: in-process.** `InferenceLoggerService` lives at `apps/api/src/sdk/inference-logger/`. The chat service calls it directly. No HTTP self-loopback.

## Locked Decisions Made For Phase 1

Decisions taken inside Phase 1's scope that bind the rest of the project. Each is justified inline so a reviewer can challenge them:

- **Streaming transport: SSE, not WebSockets.** Browser-native via `EventSource`, no extra dep, one-way fits chat token streaming exactly. WebSockets would only pay off if we needed bidirectional mid-stream signaling — we don't; cancellation goes through a separate POST.
- **Two-step initiation: POST returns id, GET opens SSE.** Browser `EventSource` does not support POST bodies. Inverting this would force `fetch()` + manual SSE parsing in the client — more code, more bugs. The two-step pattern is what `AGENT.md §4` already lays out.
- **In-memory pub/sub between Anthropic stream loop and SSE subscriber.** A `Map<inferenceRequestId, { emitter, buffer }>` in the api process. Tokens get buffered into `buffer` so a subscriber that connects 30ms after the POST still receives the first tokens. Works because Phase 1 runs a single api instance. Phase 3 may need Redis pub/sub when we horizontally scale — flagged in Handoff Context.
- **Cancellation: in-memory `AbortController` registry keyed by `inferenceRequestId`.** Same single-instance assumption.
- **Context window: last 20 messages.** Configurable via `CHAT_CONTEXT_MESSAGE_LIMIT`. Default chosen because it covers most real conversations without blowing up token costs; the cap matters more than the exact number.
- **Test runner: Vitest, not Jest.** ESM-native, faster, simpler config; works fine with `@nestjs/testing`. NestJS docs default to Jest but the team is small and Vitest pays back its setup cost on every test run. We avoid `ts-jest` ESM headaches entirely.
- **No streaming buffer to disk.** If the api process dies mid-stream, the partial assistant message is lost. Acceptable for v1; documented in Failure Handling section.

## Deliverables

Concrete file list. Anything not on this list is **not** Phase 1's job.

`packages/types` additions:

- `packages/types/src/chat/conversation.ts`
- `packages/types/src/chat/message.ts`
- `packages/types/src/chat/inference.ts`
- `packages/types/src/chat/sse-events.ts`
- `packages/types/src/chat/index.ts`
- updated `packages/types/src/index.ts` barrel

`apps/api` additions:

- `apps/api/.env.example` updated with `ANTHROPIC_API_KEY`, `CHAT_CONTEXT_MESSAGE_LIMIT`, `CORS_ORIGIN`
- `apps/api/src/common/pipes/zod-validation.pipe.ts`
- `apps/api/src/common/decorators/zod-body.decorator.ts`
- `apps/api/src/common/seeding/anonymous-user.ts` — seeds the single user at boot
- `apps/api/src/providers/llm/provider.interface.ts`
- `apps/api/src/providers/llm/provider.module.ts`
- `apps/api/src/providers/llm/provider.factory.ts`
- `apps/api/src/providers/llm/anthropic.provider.ts`
- `apps/api/src/sdk/inference-logger/inference-logger.service.ts`
- `apps/api/src/sdk/inference-logger/inference-logger.module.ts`
- `apps/api/src/modules/conversations/conversations.controller.ts`
- `apps/api/src/modules/conversations/conversations.service.ts`
- `apps/api/src/modules/conversations/conversations.module.ts`
- `apps/api/src/modules/chat/chat.controller.ts`
- `apps/api/src/modules/chat/chat.service.ts`
- `apps/api/src/modules/chat/chat.module.ts`
- `apps/api/src/modules/chat/stream-registry.ts`
- `apps/api/src/modules/chat/cancellation-registry.ts`
- `apps/api/vitest.config.ts`
- `apps/api/test/setup.ts`
- `apps/api/test/providers/anthropic.provider.spec.ts`
- `apps/api/test/modules/conversations.service.spec.ts`
- `apps/api/test/modules/chat.service.spec.ts`
- update `apps/api/src/app.module.ts` to import the new modules
- update `apps/api/src/main.ts` to enable CORS, run anonymous-user seed
- update `apps/api/package.json`: add `@anthropic-ai/sdk`, dev `vitest`, `@vitest/coverage-v8`, `@nestjs/testing`

`apps/web` additions:

- `apps/web/src/lib/api-client.ts` — typed fetch wrapper sharing Zod schemas with api
- `apps/web/src/lib/sse-client.ts` — `EventSource` wrapper that decodes typed events
- `apps/web/src/hooks/use-streaming-chat.ts`
- `apps/web/src/app/(chat)/layout.tsx` — sidebar + main panel layout
- `apps/web/src/app/(chat)/conversations/page.tsx` — conversation list
- `apps/web/src/app/(chat)/conversations/[id]/page.tsx` — chat view
- `apps/web/src/components/chat/conversation-list.tsx`
- `apps/web/src/components/chat/message-list.tsx`
- `apps/web/src/components/chat/composer.tsx`
- `apps/web/src/components/chat/cancel-button.tsx`
- shadcn primitives added via CLI: `card`, `input`, `textarea`, `scroll-area`, `separator`, `skeleton`
- update `apps/web/src/app/page.tsx` — replace Phase 0 placeholder with a link to `/conversations`

## Step-by-step Tasks

Steps are sequential. Verification on each step before moving on.

---

### Step 1 — Author chat Zod schemas in `packages/types`

**Description:** Every wire contract for Phase 1 — conversation DTOs, message DTOs, SSE event payloads — lives in `@olives/types`. Both api and web import from the same schemas so request/response shapes can never drift.

**Files created:**

- `packages/types/src/chat/conversation.ts`
- `packages/types/src/chat/message.ts`
- `packages/types/src/chat/inference.ts`
- `packages/types/src/chat/sse-events.ts`
- `packages/types/src/chat/index.ts`

**Key content:**

`packages/types/src/chat/inference.ts` — enums shared between api persistence and web UI rendering:

```typescript
import { z } from 'zod';

export const inferenceStatusSchema = z.enum([
  'queued',
  'started',
  'streaming',
  'completed',
  'failed',
  'cancelled',
]);
export type InferenceStatus = z.infer<typeof inferenceStatusSchema>;

export const messageRoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const messageStatusSchema = z.enum(['completed', 'streaming', 'cancelled', 'failed']);
export type MessageStatus = z.infer<typeof messageStatusSchema>;

export const conversationStatusSchema = z.enum(['active', 'completed', 'cancelled', 'archived']);
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;
```

`packages/types/src/chat/conversation.ts`:

```typescript
import { z } from 'zod';
import { uuidSchema } from '../common/id';
import { conversationStatusSchema } from './inference';

export const createConversationRequestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});
export type CreateConversationRequest = z.infer<typeof createConversationRequestSchema>;

export const conversationSummarySchema = z.object({
  id: uuidSchema,
  title: z.string(),
  status: conversationStatusSchema,
  lastMessageAt: z.string().datetime().nullable(),
  messageCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

export const listConversationsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: conversationStatusSchema.optional(),
});
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;

export const listConversationsResponseSchema = z.object({
  items: z.array(conversationSummarySchema),
  nextCursor: z.string().nullable(),
});
export type ListConversationsResponse = z.infer<typeof listConversationsResponseSchema>;

export const conversationDetailSchema = conversationSummarySchema.extend({
  messages: z.array(z.lazy(() => messageDtoSchema)),
});
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

// Forward declaration; messageDtoSchema lives in message.ts but referenced here.
// Use z.lazy to avoid circular import issues.
import type { z as _zForType } from 'zod';
import { messageDtoSchema } from './message';
void _zForType;
```

**Note on the `z.lazy` + import dance:** Two schemas reference each other (`conversationDetail` includes messages, `message` has a `conversationId`). The cleanest fix is `z.lazy()` on one side and a regular import on the other. Both files end up importable.

`packages/types/src/chat/message.ts`:

```typescript
import { z } from 'zod';
import { uuidSchema } from '../common/id';
import { messageRoleSchema, messageStatusSchema, inferenceStatusSchema } from './inference';

export const messageDtoSchema = z.object({
  id: uuidSchema,
  conversationId: uuidSchema,
  role: messageRoleSchema,
  content: z.string(),
  contentPreview: z.string().nullable(),
  sequenceNumber: z.number().int().nonnegative(),
  status: messageStatusSchema,
  createdAt: z.string().datetime(),
});
export type MessageDto = z.infer<typeof messageDtoSchema>;

export const postMessageRequestSchema = z.object({
  content: z.string().min(1).max(50000),
  stream: z.boolean().default(true),
  provider: z.literal('anthropic').default('anthropic'),
  model: z.string().min(1).default('claude-sonnet-4-6'),
});
export type PostMessageRequest = z.infer<typeof postMessageRequestSchema>;

export const postMessageResponseSchema = z.object({
  userMessage: messageDtoSchema,
  inferenceRequestId: uuidSchema,
  status: inferenceStatusSchema,
});
export type PostMessageResponse = z.infer<typeof postMessageResponseSchema>;

export const cancelInferenceResponseSchema = z.object({
  id: uuidSchema,
  status: inferenceStatusSchema,
});
export type CancelInferenceResponse = z.infer<typeof cancelInferenceResponseSchema>;
```

`packages/types/src/chat/sse-events.ts` — the typed SSE event payloads. Both the api emitter and the web consumer parse against these:

```typescript
import { z } from 'zod';

export const sseMessageStartSchema = z.object({
  type: z.literal('message_start'),
  inferenceRequestId: z.string().uuid(),
  assistantMessageId: z.string().uuid(),
});

export const sseTokenSchema = z.object({
  type: z.literal('token'),
  delta: z.string(),
});

export const sseMessageCompleteSchema = z.object({
  type: z.literal('message_complete'),
  assistantMessageId: z.string().uuid(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  }),
});

export const sseErrorSchema = z.object({
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
});

export const sseCancelledSchema = z.object({
  type: z.literal('cancelled'),
});

export const sseEventSchema = z.discriminatedUnion('type', [
  sseMessageStartSchema,
  sseTokenSchema,
  sseMessageCompleteSchema,
  sseErrorSchema,
  sseCancelledSchema,
]);
export type SseEvent = z.infer<typeof sseEventSchema>;
```

**Verification:**

```bash
pnpm --filter @olives/types typecheck
```

**Status:** Pending

---

### Step 2 — Zod validation pipe + decorator in `apps/api`

**Description:** A reusable NestJS pipe that parses request bodies and query params with a Zod schema and throws a `BadRequestException` with the formatted Zod issues on failure. Keeps DTO validation logic in one place and lets controllers stay declarative.

We deliberately **do not** add `nestjs-zod` as a dependency. The wrapper we need is ~25 lines. Adding a library for that creates one more thing to track for upgrades.

**Files created:**

- `apps/api/src/common/pipes/zod-validation.pipe.ts`
- `apps/api/src/common/decorators/zod-body.decorator.ts`
- `apps/api/src/common/decorators/zod-query.decorator.ts`

**Key content:**

`zod-validation.pipe.ts`:

```typescript
import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

export class ZodValidationPipe<TSchema extends ZodSchema> implements PipeTransform {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): ReturnType<TSchema['parse']> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: result.error.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      });
    }
    return result.data;
  }
}
```

`zod-body.decorator.ts`:

```typescript
import { Body } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';

export function ZodBody<TSchema extends ZodSchema>(schema: TSchema) {
  return Body(new ZodValidationPipe(schema));
}
```

Usage in a controller:

```typescript
@Post('conversations')
create(@ZodBody(createConversationRequestSchema) body: CreateConversationRequest) {
  return this.conversations.create(body);
}
```

Note: `TSchema['parse']`'s return type narrows the parameter type cleanly. No casts.

**Verification:** verified at controller wire-up in Step 4.

**Status:** Pending

---

### Step 3 — CORS + main.ts updates

**Description:** Enable CORS in `apps/api/src/main.ts` so the web app at `http://localhost:3000` can call the api at `http://localhost:3001`. Allowlist comes from `CORS_ORIGIN` env (comma-separated string parsed by Zod env schema).

**Files changed:**

- `apps/api/src/main.ts`
- `packages/types/src/env/api-env.ts` — add `CORS_ORIGIN`, `ANTHROPIC_API_KEY`, `CHAT_CONTEXT_MESSAGE_LIMIT`
- `apps/api/.env.example` — same additions

**Schema additions:**

```typescript
export const apiEnvSchema = z.object({
  // ...existing fields...
  ANTHROPIC_API_KEY: z.string().min(1),
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:3000')
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),
  CHAT_CONTEXT_MESSAGE_LIMIT: z.coerce.number().int().min(1).max(200).default(20),
});
```

After the transform, `EnvService.get('CORS_ORIGIN')` returns `string[]`.

`main.ts`:

```typescript
const env = app.get(EnvService);
app.enableCors({
  origin: env.get('CORS_ORIGIN'),
  credentials: false,
});
app.setGlobalPrefix('api/v1', { exclude: ['health/(.*)'] });
```

**Decision:** All chat/conversation/dashboard routes get the `/api/v1` prefix; `/health/*` does not (matches `AGENT.md §4`).

**Verification:**

```bash
pnpm --filter @olives/api dev
# In another terminal:
curl -i -H "Origin: http://localhost:3000" http://localhost:3001/health/live
# Expected: response includes `Access-Control-Allow-Origin: http://localhost:3000`
```

**Status:** Pending

---

### Step 4 — Anonymous user seed at boot

**Description:** Phase 1 has no auth. The schema still has a `users` table with a nullable `userId` on `conversations`. To keep code simple, we seed a single "anonymous" user at app boot and tag every conversation with that user id. Future auth swaps this single user for many real ones without schema changes.

**Files created:**

- `apps/api/src/common/seeding/anonymous-user.ts`

**Files changed:**

- `apps/api/src/main.ts` — invoke seed after Nest boots, before `app.listen`

**Key content:**

```typescript
import { PrismaService } from '../../prisma/prisma.service';

const ANONYMOUS_USER_ID = '00000000-0000-0000-0000-000000000001';

export async function seedAnonymousUser(prisma: PrismaService): Promise<string> {
  await prisma.user.upsert({
    where: { id: ANONYMOUS_USER_ID },
    create: {
      id: ANONYMOUS_USER_ID,
      email: null,
      name: 'Anonymous',
    },
    update: {},
  });
  return ANONYMOUS_USER_ID;
}

export { ANONYMOUS_USER_ID };
```

Idempotent. Safe to call on every boot.

`main.ts` after Nest creation:

```typescript
await seedAnonymousUser(app.get(PrismaService));
```

**Verification:**

```bash
pnpm db:studio
# users table has exactly one row with id 00000000-0000-0000-0000-000000000001
# Restart api; row is still there (upsert no-op).
```

**Status:** Pending

---

### Step 5 — `LlmProvider` interface + Anthropic adapter

**Description:** Define the provider abstraction in one place. Implement the Anthropic adapter against it. The factory only knows about Anthropic in Phase 1 — adding OpenAI later is a one-file change.

**Files created:**

- `apps/api/src/providers/llm/provider.interface.ts`
- `apps/api/src/providers/llm/provider.module.ts`
- `apps/api/src/providers/llm/provider.factory.ts`
- `apps/api/src/providers/llm/anthropic.provider.ts`

**Dependencies added to `apps/api`:**

- `@anthropic-ai/sdk@^0.30.0`

**Key content:**

`provider.interface.ts` — the abstraction. Designed around what every modern LLM provides: streaming tokens with usage at the end and a way to abort:

```typescript
import type { MessageRole } from '@olives/types';

export interface LlmMessage {
  role: MessageRole;
  content: string;
}

export interface LlmRequest {
  model: string;
  systemPrompt?: string;
  messages: LlmMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  abortSignal?: AbortSignal;
}

export interface LlmTokenChunk {
  type: 'token';
  delta: string;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmCompletedChunk {
  type: 'completed';
  usage: LlmUsage;
}

export interface LlmErrorChunk {
  type: 'error';
  code: string;
  message: string;
  retryable: boolean;
}

export type LlmStreamChunk = LlmTokenChunk | LlmCompletedChunk | LlmErrorChunk;

export interface LlmProvider {
  readonly name: string;
  stream(request: LlmRequest): AsyncIterable<LlmStreamChunk>;
}
```

**Note:** the interface only exposes `stream()`. Non-streaming completion in Phase 1 is implemented in `ChatService` by reading the stream to completion server-side and returning the assembled response — no need for a separate `generate()` method. Keeps the interface narrow.

`anthropic.provider.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { EnvService } from '../../config/config.module';
import type { LlmProvider, LlmRequest, LlmStreamChunk } from './provider.interface';

@Injectable()
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(env: EnvService) {
    this.client = new Anthropic({ apiKey: env.get('ANTHROPIC_API_KEY') });
  }

  async *stream(request: LlmRequest): AsyncIterable<LlmStreamChunk> {
    const stream = await this.client.messages.stream(
      {
        model: request.model,
        max_tokens: request.maxOutputTokens ?? 4096,
        temperature: request.temperature,
        system: request.systemPrompt,
        messages: request.messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role, content: m.content })),
      },
      { signal: request.abortSignal },
    );

    try {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'token', delta: event.delta.text };
        }
      }
      const finalMessage = await stream.finalMessage();
      yield {
        type: 'completed',
        usage: {
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
        },
      };
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      if (isAbort) {
        // Caller (chat service) interprets stream termination + cancellation flag.
        return;
      }
      yield this.toErrorChunk(err);
    }
  }

  private toErrorChunk(err: unknown): LlmStreamChunk {
    if (err instanceof Anthropic.APIError) {
      return {
        type: 'error',
        code: `anthropic_${err.status ?? 'unknown'}`,
        message: err.message,
        retryable: err.status !== undefined && err.status >= 500,
      };
    }
    const message = err instanceof Error ? err.message : 'Unknown provider error';
    return { type: 'error', code: 'anthropic_unknown', message, retryable: false };
  }
}
```

**No casts.** `err instanceof Error` is a real type guard; `err instanceof Anthropic.APIError` likewise.

`provider.factory.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { AnthropicProvider } from './anthropic.provider';
import type { LlmProvider } from './provider.interface';

@Injectable()
export class LlmProviderFactory {
  constructor(private readonly anthropic: AnthropicProvider) {}

  get(name: string): LlmProvider {
    if (name === 'anthropic') return this.anthropic;
    throw new Error(`Unsupported LLM provider: ${name}. Available: anthropic`);
  }
}
```

`provider.module.ts` — `@Global()` module that provides `AnthropicProvider` and `LlmProviderFactory` and exports the factory.

**Verification:** unit test in Step 10 covers the adapter against a mocked Anthropic SDK.

**Status:** Pending

---

### Step 6 — In-process `InferenceLoggerService` SDK

**Description:** Wrap every LLM call in begin/complete lifecycle methods that write rows to `inference_requests` synchronously. Phase 2 will refactor this to also emit BullMQ events for async fan-out, but the public API of this service stays stable across both phases — so `ChatService` doesn't change.

**Files created:**

- `apps/api/src/sdk/inference-logger/inference-logger.service.ts`
- `apps/api/src/sdk/inference-logger/inference-logger.module.ts`

**API design:**

```typescript
interface BeginInferenceInput {
  conversationId: string;
  userMessageId: string;
  sessionId: string;
  provider: string;
  model: string;
}

interface CompletedInferenceInput {
  assistantMessageId: string;
  inputTokens: number;
  outputTokens: number;
  firstTokenAt: Date | null;
  inputPreview: string;
  outputPreview: string;
}

interface FailedInferenceInput {
  errorCode: string;
  errorMessage: string;
}

export interface InferenceContext {
  inferenceRequestId: string;
  startedAt: Date;
}
```

**Method behaviors:**

- `begin(input)` — INSERT `inference_requests` (`status='started'`, `request_started_at=now()`). Returns context.
- `markFirstToken(ctx)` — UPDATE `first_token_at` and `status='streaming'`. Idempotent.
- `complete(ctx, result)` — UPDATE `status='completed'`, `completed_at=now()`, latencies, tokens, previews, `assistant_message_id`.
- `fail(ctx, error)` — UPDATE `status='failed'`, error fields, `completed_at=now()`.
- `cancel(ctx)` — UPDATE `status='cancelled'`, `completed_at=now()`.

All preview truncation is in this service: `inputPreview` and `outputPreview` are capped at 1000 chars before write. PII redaction is **not** done here — it lands in the Phase 2 worker. We document this clearly in code comments to avoid confusion.

**Verification:** covered in `chat.service.spec.ts` via integration test (Step 10).

**Status:** Pending

---

### Step 7 — `ConversationsModule`

**Description:** CRUD for conversations. No SSE here, no LLM calls — purely Postgres operations. The only "smart" pieces are cursor pagination and counting messages efficiently.

**Files created:**

- `apps/api/src/modules/conversations/conversations.service.ts`
- `apps/api/src/modules/conversations/conversations.controller.ts`
- `apps/api/src/modules/conversations/conversations.module.ts`

**Endpoints:**

- `POST /api/v1/chat/conversations` — body validated by `createConversationRequestSchema`. Inserts row with `userId=ANONYMOUS_USER_ID`, `title = body.title ?? 'New conversation'`.
- `GET /api/v1/chat/conversations` — query validated by `listConversationsQuerySchema`. Uses cursor pagination on `(updated_at DESC, id DESC)`. Cursor is base64(`updated_at|id`).
- `GET /api/v1/chat/conversations/:id` — returns conversation + all messages ordered by `sequence_number`.
- `PATCH /api/v1/chat/conversations/:id` — body `{ title? , status? }`. Allows archive.

**Cursor pagination snippet:**

```typescript
// Decode cursor → { updatedAt: Date, id: string }
// SELECT * FROM conversations
//   WHERE userId = $anon
//     AND (status = $status OR $status IS NULL)
//     AND (updated_at, id) < ($cursorUpdatedAt, $cursorId)
//   ORDER BY updated_at DESC, id DESC
//   LIMIT $limit + 1
// nextCursor = encode(items[$limit-1])  if items.length > $limit
```

We use Prisma's keyset-style query through `where` clauses combined with `orderBy`. Cleaner than `skip/take` which gets slow at depth.

**Message count** — Phase 1 reads it as a subquery per conversation (`_count.messages` via Prisma `include`). For tens of conversations this is fine. Phase 4 would add a denormalized counter if needed.

**Verification:**

```bash
curl -s -X POST http://localhost:3001/api/v1/chat/conversations \
  -H "Content-Type: application/json" -d '{"title":"Test"}' | jq
curl -s http://localhost:3001/api/v1/chat/conversations | jq '.items[0].title'  # → "Test"
curl -s http://localhost:3001/api/v1/chat/conversations/<id> | jq '.messages'   # → []
```

**Status:** Pending

---

### Step 8 — `ChatModule` part 1: POST messages + context loading

**Description:** Handle a user message: validate, write `messages` row (`role='user'`, `sequenceNumber=next`), create `inference_requests` row via `InferenceLoggerService.begin()`, build the multi-turn context from the last N messages, kick off the Anthropic stream in a background task that publishes to the `StreamRegistry`. Return immediately with `{ inferenceRequestId }`.

**Files created:**

- `apps/api/src/modules/chat/chat.service.ts`
- `apps/api/src/modules/chat/chat.controller.ts`
- `apps/api/src/modules/chat/chat.module.ts`
- `apps/api/src/modules/chat/stream-registry.ts`
- `apps/api/src/modules/chat/cancellation-registry.ts`

**`StreamRegistry`** — in-memory pub/sub for an in-flight inference:

```typescript
import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { SseEvent } from '@olives/types';

interface StreamEntry {
  emitter: EventEmitter;
  buffer: SseEvent[];
  ended: boolean;
}

@Injectable()
export class StreamRegistry {
  private readonly streams = new Map<string, StreamEntry>();

  open(inferenceRequestId: string): StreamEntry {
    const entry: StreamEntry = { emitter: new EventEmitter(), buffer: [], ended: false };
    this.streams.set(inferenceRequestId, entry);
    return entry;
  }

  publish(inferenceRequestId: string, event: SseEvent): void {
    const entry = this.streams.get(inferenceRequestId);
    if (!entry || entry.ended) return;
    entry.buffer.push(event);
    entry.emitter.emit('event', event);
  }

  end(inferenceRequestId: string): void {
    const entry = this.streams.get(inferenceRequestId);
    if (!entry) return;
    entry.ended = true;
    entry.emitter.emit('end');
    // Hold the entry for 60s so late subscribers can replay the buffer, then drop.
    setTimeout(() => this.streams.delete(inferenceRequestId), 60_000).unref();
  }

  get(inferenceRequestId: string): StreamEntry | undefined {
    return this.streams.get(inferenceRequestId);
  }
}
```

`buffer` lets a subscriber that connects after `message_start` was already emitted catch up. The 60s grace period after `end` lets a subscriber that connects very late see the full event log (useful for the UI to show "this finished while you were away"). Phase 2/3 may swap this for Redis pub/sub if we run multiple api instances; flagged in Handoff Context.

**`CancellationRegistry`** — `Map<inferenceRequestId, AbortController>`. Same single-instance assumption. `requestCancel(id)` calls `abort()` and removes the entry.

**`ChatService.startInference()`** flow:

1. Load conversation. Throw 404 if missing or archived.
2. Compute `sequenceNumber = currentMaxSequenceNumber + 1`.
3. Begin a Prisma transaction:
   - INSERT user message row (`status='completed'`).
   - Call `inferenceLogger.begin({...})`.
4. Outside the transaction, kick off `runInferenceInBackground(...)` (a `void`-returning method on `ChatService`). Critically: **do not await it.** Use `void runInBackground();` so the request returns immediately.
5. Return `{ userMessage, inferenceRequestId, status: 'queued' }`.

**`runInferenceInBackground(ctx)`** flow:

1. Load last `CHAT_CONTEXT_MESSAGE_LIMIT` messages from the conversation (including the user message just written), ordered ascending.
2. Build `LlmRequest.messages`.
3. Register an `AbortController` with `CancellationRegistry`.
4. Open `StreamRegistry` entry. Publish `message_start`.
5. Loop over `provider.stream(...)`:
   - On first `token`, call `inferenceLogger.markFirstToken(ctx)`, publish `message_start` if not yet (already done), publish `token`.
   - On subsequent `token`s, append to in-memory `assistantContent` buffer, publish `token`.
   - On `completed`, write assistant message row (transaction), call `inferenceLogger.complete(ctx, ...)`, publish `message_complete`, `StreamRegistry.end()`.
   - On `error`, call `inferenceLogger.fail(ctx, ...)`, publish `error`, `StreamRegistry.end()`.
6. If `AbortController.signal.aborted` is observed: call `inferenceLogger.cancel(ctx)`, write partial assistant message with `status='cancelled'`, publish `cancelled`, `StreamRegistry.end()`.

**Background task error handling** — wrap the whole `runInferenceInBackground` body in `try/catch`. Any uncaught error becomes a `fail` write + `error` SSE event. **Never** let an unhandled rejection escape.

**Controller:**

```typescript
@Controller('chat')
export class ChatController {
  // POST /api/v1/chat/conversations/:id/messages
  @Post('conversations/:conversationId/messages')
  async post(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @ZodBody(postMessageRequestSchema) body: PostMessageRequest,
  ): Promise<PostMessageResponse> {
    return this.chat.startInference(conversationId, body);
  }
}
```

**Verification:**

```bash
# Create conversation
CONV=$(curl -s -X POST http://localhost:3001/api/v1/chat/conversations \
  -H "Content-Type: application/json" -d '{}' | jq -r .id)

# Post a message
curl -s -X POST http://localhost:3001/api/v1/chat/conversations/$CONV/messages \
  -H "Content-Type: application/json" \
  -d '{"content":"Say hi in one word","stream":true}'
# → {"userMessage":{...},"inferenceRequestId":"...","status":"queued"}

# Inspect DB: messages has the user row; inference_requests has a queued/started row
pnpm db:studio
```

**Status:** Pending

---

### Step 9 — `ChatModule` part 2: SSE stream + cancellation

**Description:** The GET SSE endpoint replays buffered events and subscribes to new ones for the given `inferenceRequestId`. The POST cancel endpoint flips the abort flag.

**Files changed:**

- `apps/api/src/modules/chat/chat.controller.ts` (add stream + cancel endpoints)
- `apps/api/src/modules/chat/chat.service.ts` (add cancel method)

**Stream controller:**

```typescript
@Sse('conversations/:conversationId/stream/:inferenceRequestId')
stream(
  @Param('inferenceRequestId', new ParseUUIDPipe()) inferenceRequestId: string,
): Observable<MessageEvent> {
  const entry = this.streamRegistry.get(inferenceRequestId);
  if (!entry) {
    throw new NotFoundException('Inference not found or expired');
  }
  return new Observable<MessageEvent>((subscriber) => {
    for (const event of entry.buffer) {
      subscriber.next({ data: event });
    }
    if (entry.ended) {
      subscriber.complete();
      return;
    }
    const onEvent = (event: SseEvent): void => subscriber.next({ data: event });
    const onEnd = (): void => subscriber.complete();
    entry.emitter.on('event', onEvent);
    entry.emitter.once('end', onEnd);
    return () => {
      entry.emitter.off('event', onEvent);
      entry.emitter.off('end', onEnd);
    };
  });
}
```

`@nestjs/common`'s `@Sse()` decorator serializes the returned `Observable<MessageEvent>` to a proper SSE response (`Content-Type: text/event-stream`, `event:` + `data:` framing). The `data` field is JSON-serialized.

**Cancel controller:**

```typescript
@Post('inferences/:inferenceRequestId/cancel')
async cancel(
  @Param('inferenceRequestId', new ParseUUIDPipe()) id: string,
): Promise<CancelInferenceResponse> {
  return this.chat.requestCancel(id);
}
```

**`ChatService.requestCancel`:**

1. Look up `inference_requests` row.
2. If status is terminal (`completed`/`failed`/`cancelled`), return current status (idempotent).
3. Otherwise: call `cancellationRegistry.requestCancel(id)` — this triggers the in-flight `runInferenceInBackground` loop to observe `abortSignal.aborted` and clean up.
4. Return `{ id, status: 'cancelled' }`.

**Edge case** — if the cancel arrives before the background loop has registered its `AbortController`, store an intent flag (`cancellationRegistry.markIntent(id)`) that the loop checks before starting the provider stream. Tiny race condition window but worth covering.

**Verification:**

```bash
# Open SSE stream (in a separate terminal)
curl -N http://localhost:3001/api/v1/chat/conversations/$CONV/stream/$INF
# Expected: event: message  data: {"type":"message_start",...}
#           event: message  data: {"type":"token","delta":"H"}
#           ...
#           event: message  data: {"type":"message_complete",...}

# Mid-stream cancel test
# Post a long message, immediately cancel:
INF=$(curl -s -X POST .../messages -d '{"content":"Write a 500-word essay","stream":true}' | jq -r .inferenceRequestId)
curl -s -X POST http://localhost:3001/api/v1/chat/inferences/$INF/cancel
# SSE stream from above should emit a "cancelled" event then close.
# DB: inference_requests row has status='cancelled', assistant message has status='cancelled' with partial content.
```

**Status:** Pending

---

### Step 10 — Vitest setup + first tests

**Description:** Configure Vitest for `apps/api`, write three focused tests that lock the contracts that matter most.

**Files created:**

- `apps/api/vitest.config.ts`
- `apps/api/test/setup.ts`
- `apps/api/test/providers/anthropic.provider.spec.ts`
- `apps/api/test/modules/conversations.service.spec.ts`
- `apps/api/test/modules/chat.service.spec.ts`

**Dependencies added (`apps/api` devDeps):**

- `vitest@^2`
- `@vitest/coverage-v8`
- `@nestjs/testing`
- `vite-tsconfig-paths`

**`vitest.config.ts`:**

```typescript
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.spec.ts'],
    setupFiles: ['test/setup.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
});
```

**Test 1 — `anthropic.provider.spec.ts`**

What it locks: given a mocked `Anthropic.messages.stream` that emits two `content_block_delta` events, `AnthropicProvider.stream()` yields two `{ type: 'token' }` chunks followed by one `{ type: 'completed' }` chunk with usage from `finalMessage()`.

Mock strategy: `vi.mock('@anthropic-ai/sdk', ...)` returning a class whose `messages.stream` returns an async iterator.

**Test 2 — `conversations.service.spec.ts`**

What it locks: `create()` writes a row with the seeded anonymous user; `list()` returns items in `updated_at DESC` order; cursor pagination yields no duplicates across pages.

Strategy: spin up a test database via `testcontainers` is overkill for Phase 1. Use a Prisma mock layer (`vitest-mock-extended` or hand-rolled). For now use a hand-rolled `PrismaService` mock that the service depends on — keeps tests in-process and fast.

**Test 3 — `chat.service.spec.ts`**

What it locks: `startInference()` writes a user message + an `inference_requests` row in one transaction, registers a `StreamRegistry` entry, and returns a `queued` response without blocking on the LLM.

Strategy: mock `PrismaService`, `LlmProviderFactory`, `InferenceLoggerService`. Assert call order: `prisma.$transaction(...)` called before the background task is kicked off.

**Add scripts to `apps/api/package.json`:**

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

**Add to root `package.json` scripts:**

```json
"test": "pnpm -r --filter='./apps/*' --filter='./packages/*' test"
```

**Verification:**

```bash
pnpm --filter @olives/api test
# Expected: 3 tests pass, ~1-2s.
```

**Status:** Pending

---

### Step 11 — Web app: API client + SSE client + hooks

**Description:** Typed HTTP client and SSE client in `apps/web/src/lib/`. Both reuse Zod schemas from `@olives/types`. A `useStreamingChat` hook abstracts the open/subscribe/cancel lifecycle so the page components stay clean.

**Files created:**

- `apps/web/src/lib/api-client.ts`
- `apps/web/src/lib/sse-client.ts`
- `apps/web/src/hooks/use-streaming-chat.ts`

**`api-client.ts`** — a tiny `fetch` wrapper. For each endpoint, define a function that takes typed input, calls `fetch`, runs Zod `parse` on the response, and returns typed output.

```typescript
import {
  conversationDetailSchema,
  createConversationRequestSchema,
  listConversationsQuerySchema,
  listConversationsResponseSchema,
  postMessageRequestSchema,
  postMessageResponseSchema,
  cancelInferenceResponseSchema,
  type ConversationDetail,
  type ConversationSummary,
  type CreateConversationRequest,
  type ListConversationsQuery,
  type PostMessageRequest,
  type PostMessageResponse,
  type CancelInferenceResponse,
} from '@olives/types';

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

async function request<TOut>(
  path: string,
  init: RequestInit,
  outSchema: { parse: (input: unknown) => TOut },
): Promise<TOut> {
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return outSchema.parse(await res.json());
}

export const api = {
  createConversation(body: CreateConversationRequest) {
    const parsed = createConversationRequestSchema.parse(body);
    return request('/chat/conversations', { method: 'POST', body: JSON.stringify(parsed) }, /* ... */);
  },
  // ... listConversations, getConversation, postMessage, cancelInference
};
```

Generic `request<TOut>` returns the parsed output type via the schema's `.parse` signature. No casts.

**`sse-client.ts`** — wraps `EventSource`, parses each `data` field with `sseEventSchema`, and exposes a typed `onEvent` callback.

```typescript
import { sseEventSchema, type SseEvent } from '@olives/types';

export interface SseClientHandle {
  close(): void;
}

export function openSseStream(
  url: string,
  onEvent: (event: SseEvent) => void,
  onError: (err: Error) => void,
): SseClientHandle {
  const es = new EventSource(url);
  es.onmessage = (msg) => {
    const parsed = sseEventSchema.safeParse(JSON.parse(msg.data));
    if (!parsed.success) {
      onError(new Error(`Invalid SSE event: ${parsed.error.message}`));
      return;
    }
    onEvent(parsed.data);
  };
  es.onerror = () => onError(new Error('SSE connection error'));
  return { close: () => es.close() };
}
```

**`use-streaming-chat.ts`** — combines POST + SSE + cancel into one React hook:

```typescript
'use client';
import { useCallback, useRef, useState } from 'react';
import { api } from '../lib/api-client';
import { openSseStream } from '../lib/sse-client';

export type StreamingState =
  | { status: 'idle' }
  | { status: 'streaming'; assistantText: string; inferenceRequestId: string }
  | { status: 'completed'; assistantText: string }
  | { status: 'cancelled'; assistantText: string }
  | { status: 'error'; message: string };

export function useStreamingChat(conversationId: string) {
  const [state, setState] = useState<StreamingState>({ status: 'idle' });
  const sseRef = useRef<{ close: () => void } | null>(null);

  const send = useCallback(async (content: string) => {
    setState({ status: 'streaming', assistantText: '', inferenceRequestId: '' });
    const res = await api.postMessage(conversationId, { content });
    setState({ status: 'streaming', assistantText: '', inferenceRequestId: res.inferenceRequestId });
    sseRef.current = openSseStream(
      `${baseUrl}/api/v1/chat/conversations/${conversationId}/stream/${res.inferenceRequestId}`,
      (event) => {
        if (event.type === 'token') {
          setState((s) =>
            s.status === 'streaming' ? { ...s, assistantText: s.assistantText + event.delta } : s,
          );
        } else if (event.type === 'message_complete') {
          setState((s) =>
            s.status === 'streaming' ? { status: 'completed', assistantText: s.assistantText } : s,
          );
        } else if (event.type === 'cancelled') {
          setState((s) =>
            s.status === 'streaming' ? { status: 'cancelled', assistantText: s.assistantText } : s,
          );
        } else if (event.type === 'error') {
          setState({ status: 'error', message: event.message });
        }
      },
      (err) => setState({ status: 'error', message: err.message }),
    );
  }, [conversationId]);

  const cancel = useCallback(() => {
    if (state.status === 'streaming') {
      void api.cancelInference(state.inferenceRequestId);
    }
  }, [state]);

  return { state, send, cancel };
}
```

**Verification:** verified visually in Step 12.

**Status:** Pending

---

### Step 12 — Web app: conversation list + chat view

**Description:** Two routes under `apps/web/src/app/(chat)/`. A list page that fetches `/chat/conversations` and renders rows. A detail page that renders the message history + composer + cancel button, wired to `useStreamingChat`.

**Files created:**

- `apps/web/src/app/(chat)/layout.tsx` — sidebar + main split
- `apps/web/src/app/(chat)/conversations/page.tsx` — server component, fetches list
- `apps/web/src/app/(chat)/conversations/[id]/page.tsx` — server component, fetches conversation detail
- `apps/web/src/app/(chat)/conversations/[id]/chat-view.tsx` — client component wired to `useStreamingChat`
- `apps/web/src/components/chat/conversation-list.tsx`
- `apps/web/src/components/chat/message-list.tsx`
- `apps/web/src/components/chat/composer.tsx`
- `apps/web/src/components/chat/cancel-button.tsx`

**shadcn primitives to add via CLI:**

```bash
pnpm --filter @olives/web dlx shadcn@latest add card input textarea scroll-area separator skeleton
```

**Page layout summary:**

`/conversations` page (server component):

- Fetches `/chat/conversations?limit=50` on the server, renders a list. Clicking an item routes to `/conversations/[id]`.
- "+ New conversation" button POSTs and redirects.

`/conversations/[id]` page (server component shell):

- Fetches `/chat/conversations/[id]` on the server for initial paint of full history.
- Hands the data to `chat-view.tsx` (client component) which mounts `useStreamingChat`.

`chat-view.tsx`:

- Renders `MessageList` with the existing messages.
- Appends the streaming assistant message at the bottom while `state.status === 'streaming'`.
- `Composer` posts new messages on submit.
- `CancelButton` only rendered when `state.status === 'streaming'`.

**Replace `apps/web/src/app/page.tsx`** Phase 0 placeholder with a redirect to `/conversations`:

```typescript
import { redirect } from 'next/navigation';
export default function Home() { redirect('/conversations'); }
```

**Verification (end-to-end, manual):**

1. `pnpm dev`
2. Browser → `http://localhost:3000` → redirects to `/conversations`
3. Click "+ New conversation" — new row appears, browser navigates to `/conversations/<id>`
4. Type "Hello, who are you?" — tokens stream into the UI
5. Type "Write a long poem about clouds" — click Cancel mid-stream — partial response remains, status shows "cancelled"
6. Click back to `/conversations` — list shows both conversations with `lastMessageAt`
7. Click the first conversation — full history loads
8. Refresh the page mid-stream of a new conversation — open SSE on `inferenceRequestId` should resume from the buffer

**Status:** Pending

---

### Step 13 — Full Phase 1 acceptance pass

**Description:** Same shape as the Phase 0 acceptance pass. Wipe state, walk the full happy path, exercise cancellation, exercise resume.

```bash
docker compose down -v && docker compose up -d
pnpm db:migrate
pnpm dev &

# Wait for both apps
sleep 5

# Lint/typecheck/test all green
pnpm typecheck && pnpm lint && pnpm test

# Manual UI walk-through:
#   1. New conversation → send message → tokens stream → DB has user + assistant + inference_requests row with completed status, latency, tokens.
#   2. Send a second message in the same conversation → assistant has prior context.
#   3. Send a long-output prompt → cancel mid-stream → DB inference_requests status=cancelled, partial assistant message saved.
#   4. Open /conversations → both conversations listed with correct lastMessageAt.
#   5. Refresh /conversations/[id] mid-second-stream → SSE replays buffered events.
#   6. Stop the api (Ctrl+C), restart, refresh /conversations → history persists.

# Final DB inspection
pnpm db:studio
# inference_requests: each row has provider='anthropic', model set, latency_ms, time_to_first_token_ms,
#   input_tokens, output_tokens, input_preview ≤ 1000 chars, output_preview ≤ 1000 chars, status terminal.
```

**Status:** Pending

## Implementation Notes

**Why two-step POST + GET SSE.** Browser `EventSource` doesn't take POST bodies. The alternative (`fetch` + manual SSE parsing) is more code and harder to test in the browser. Two endpoints is the cleaner contract — POST is the side-effectful action, GET is the read of the stream.

**Why in-memory pub/sub instead of Redis Streams.** Phase 1 runs one api instance. The complexity of Redis pub/sub buys us nothing here. We pay the price (HA limitation) only when we horizontally scale, which is a Phase 4+ concern.

**Why the `runInferenceInBackground` pattern.** The HTTP request returns in <50ms with an `inferenceRequestId`. The LLM call (which can take 30+ seconds) runs detached. The frontend opens SSE to receive tokens. This decouples the request lifecycle from the streaming lifecycle — important because mobile clients drop connections aggressively.

**Why no `process.on('SIGTERM')` graceful drain in Phase 1.** Production deployment isn't a Phase 1 concern. Phase 3 will wire signal handlers that:
- Stop accepting new POST messages
- Wait up to N seconds for in-flight inferences to complete
- Mark anything still running as `cancelled` with a `shutdown` reason

**Why don't we redact PII before writing previews to `inference_requests` in Phase 1.** Phase 2 owns redaction. Doing it in two places (synchronous write here, async re-redaction in the worker) is a recipe for inconsistent state. Phase 1 simply truncates to 1000 chars; redaction is a Phase 2 worker step. **Documented in code** with a comment on `InferenceLoggerService.complete` so the gap is visible.

**Why Vitest over Jest.** Phase 1 is the first chance to make this choice. Vitest's ESM-native model means we never fight `ts-jest` to import ESM-only deps (and `@anthropic-ai/sdk` is ESM-leaning). The trade-off is fewer NestJS-specific Jest plugins, but `@nestjs/testing`'s programmatic API works exactly the same under either runner.

**Why CHAT_CONTEXT_MESSAGE_LIMIT=20.** Anthropic Claude Sonnet 4.6 has a 200K-token context window. 20 turns of ~500 tokens each = 10K tokens of history, which leaves plenty of room for the system prompt and response. Configurable for ops who want to tune cost.

**What Phase 1 explicitly does NOT do** — pushed to Phase 2 or Phase 3:

- No BullMQ. No worker process. No async ingestion.
- No `inference_events` table writes. No `ingestion_logs` table writes.
- No `/api/v1/ingestion/*` endpoints.
- No dashboard module, no dashboard UI.
- No PII redaction.
- No OpenAI adapter.
- No rate limiting.
- No production Dockerfiles. No CI workflow.
- No retention/cleanup jobs.
- No automated end-to-end browser tests (Playwright lands in Phase 3 if at all).

## Progress Tracking

Progress: 0%

- Step 1 — Chat Zod schemas in `packages/types`: **Pending**
- Step 2 — Zod validation pipe + decorator: **Pending**
- Step 3 — CORS + `/api/v1` global prefix: **Pending**
- Step 4 — Anonymous user seed: **Pending**
- Step 5 — `LlmProvider` interface + Anthropic adapter: **Pending**
- Step 6 — `InferenceLoggerService` in-process SDK: **Pending**
- Step 7 — `ConversationsModule`: **Pending**
- Step 8 — `ChatModule` part 1 (POST + context loading): **Pending**
- Step 9 — `ChatModule` part 2 (SSE + cancel): **Pending**
- Step 10 — Vitest setup + first tests: **Pending**
- Step 11 — Web API client + SSE client + hook: **Pending**
- Step 12 — Conversation list + chat view UI: **Pending**
- Step 13 — Phase 1 acceptance pass: **Pending**

## Blockers

None.

## Handoff Context

What Phase 2 inherits from Phase 1:

**The synchronous chat path works end-to-end.** Phase 2 layers **async fan-out** on top. The `InferenceLoggerService` public API does not change — Phase 2 adds an internal collaborator (`IngestionEnqueuer`) that gets called from the same `complete`/`fail`/`cancel` methods. `ChatService` does not change at all.

**`StreamRegistry` and `CancellationRegistry` are in-memory.** Phase 2 does not need to change them. Phase 4 (HA scale-out) would replace them with Redis pub/sub + a Redis-backed cancellation flag.

**Provider abstraction shape is locked.** Phase 3's OpenAI adapter implements the same `LlmProvider` interface defined in Step 5. Do not add provider-specific methods to the interface; provider-specific config goes through the `provider_configs` table (which Phase 2 may start populating).

**`provider` is a request parameter.** The current default in `postMessageRequestSchema` is `'anthropic'` via `z.literal('anthropic').default('anthropic')`. Phase 3 will widen this to `z.enum(['anthropic','openai'])` — single-line schema change plus a one-line factory case.

**Schema-stored statuses are stable.** No status enum values were added in Phase 1. Phase 2 will read `inference_requests` rows in the worker; it does not need to add new statuses.

**Test infrastructure exists.** Phase 2 should add its own specs against the same Vitest config and follow the mocked-Prisma pattern.

**What Phase 1 deliberately leaves broken / unfinished for Phase 2 to fix:**

- `inference_events` table has zero writers. Phase 2 worker is its first writer.
- `ingestion_logs` table has zero writers. Phase 2 worker (and HTTP endpoint) populate it.
- `queue_jobs` table has zero writers. Phase 2 worker populates on dead-letter, optional.
- `provider_configs` table has zero writers. Phase 3 may seed it; Phase 2 reads `env` only.
- Redis is running in compose but no app code talks to it. `/health/ready` does not yet ping Redis. Phase 2 wires both.
- No retry on Anthropic transient failures. Phase 1 surfaces them as `error` events; Phase 2 (in the worker) does not retry chat — the retry concept only applies to ingestion jobs. Provider retries for chat itself are Phase 3.

Phase 2 should open by re-reading this section, then `AGENT.md §5.C` (ingestion flow) and `§8` (failure handling), then writing its own `phase-2.md` step plan at the same level of detail as Phase 1.
