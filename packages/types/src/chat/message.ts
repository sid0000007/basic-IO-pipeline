import { z } from 'zod';
import { uuidSchema } from '../common/id';
import { inferenceStatusSchema, messageRoleSchema, messageStatusSchema } from './inference';

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

export const llmProviderNameSchema = z.enum(['anthropic', 'openai', 'gemini']);
export type LlmProviderName = z.infer<typeof llmProviderNameSchema>;

export const postMessageRequestSchema = z.object({
  content: z.string().min(1).max(50000),
  stream: z.boolean().default(true),
  provider: llmProviderNameSchema.default('anthropic'),
  model: z.string().min(1).default('claude-sonnet-4-6'),
  fallbackProvider: llmProviderNameSchema.optional(),
  fallbackModel: z.string().min(1).optional(),
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
