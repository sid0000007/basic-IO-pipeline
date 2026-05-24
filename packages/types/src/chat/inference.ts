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

// Full set of inference_events.event_type values matching the Prisma enum.
// The ingestion HTTP endpoint accepts a subset (without stream_delta) since
// stream_delta is an internal-only buffering event.
export const inferenceEventTypeSchema = z.enum([
  'request_started',
  'first_token',
  'stream_delta',
  'request_completed',
  'request_failed',
  'request_cancelled',
]);
export type InferenceEventType = z.infer<typeof inferenceEventTypeSchema>;
