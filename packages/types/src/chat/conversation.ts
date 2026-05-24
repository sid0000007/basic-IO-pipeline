import { z } from 'zod';
import { uuidSchema } from '../common/id';
import { conversationStatusSchema } from './inference';
import { messageDtoSchema } from './message';

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
  messages: z.array(messageDtoSchema),
});
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

export const updateConversationRequestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  status: conversationStatusSchema.optional(),
});
export type UpdateConversationRequest = z.infer<typeof updateConversationRequestSchema>;
