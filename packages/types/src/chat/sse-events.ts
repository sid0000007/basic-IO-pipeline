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
