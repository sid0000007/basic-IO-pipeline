import { z } from 'zod';
import { uuidSchema } from '../common/id';
import { inferenceEventTypeSchema, inferenceStatusSchema } from '../chat/inference';

export const dashboardInferenceRequestSummarySchema = z.object({
  id: uuidSchema,
  conversationId: uuidSchema,
  sessionId: z.string(),
  provider: z.string(),
  model: z.string(),
  status: inferenceStatusSchema,
  requestStartedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  latencyMs: z.number().int().nullable(),
  timeToFirstTokenMs: z.number().int().nullable(),
  inputTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  totalTokens: z.number().int().nullable(),
  inputPreview: z.string().nullable(),
  outputPreview: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
});
export type DashboardInferenceRequestSummary = z.infer<
  typeof dashboardInferenceRequestSummarySchema
>;

export const listInferenceRequestsQuerySchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  status: inferenceStatusSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListInferenceRequestsQuery = z.infer<typeof listInferenceRequestsQuerySchema>;

export const listInferenceRequestsResponseSchema = z.object({
  items: z.array(dashboardInferenceRequestSummarySchema),
  nextCursor: z.string().nullable(),
});
export type ListInferenceRequestsResponse = z.infer<typeof listInferenceRequestsResponseSchema>;

export const dashboardInferenceEventSchema = z.object({
  id: uuidSchema,
  eventType: inferenceEventTypeSchema,
  eventTimestamp: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
});
export type DashboardInferenceEvent = z.infer<typeof dashboardInferenceEventSchema>;

export const dashboardInferenceRequestDetailSchema = dashboardInferenceRequestSummarySchema.extend({
  events: z.array(dashboardInferenceEventSchema),
});
export type DashboardInferenceRequestDetail = z.infer<typeof dashboardInferenceRequestDetailSchema>;
