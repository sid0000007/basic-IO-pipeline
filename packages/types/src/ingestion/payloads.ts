import { z } from 'zod';
import { uuidSchema } from '../common/id';
import { inferenceStatusSchema } from '../chat/inference';

// Subset of `InferenceEventType` accepted from external producers.
// `stream_delta` is intentionally excluded — it is an internal-only event the
// worker may write but external producers never send.
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
  // Nullable so the worker can re-parse rawPayload after IngestionService
  // normalizes undefined → null on write.
  sourceEventId: z.string().min(1).max(200).nullable().optional(),
  payloadVersion: z.literal('1.0'),
  eventType: inferenceLogEventTypeSchema,
  timestamp: z.string().datetime(),
  data: z.object({
    inferenceRequestId: uuidSchema.nullable().optional(),
    conversationId: uuidSchema.nullable().optional(),
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
  }),
});
export type InferenceLogPayloadV1 = z.infer<typeof inferenceLogPayloadV1Schema>;
