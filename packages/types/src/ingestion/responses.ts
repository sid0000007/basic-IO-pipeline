import { z } from 'zod';
import { uuidSchema } from '../common/id';

export const ingestionStatusSchema = z.enum(['received', 'validated', 'processed', 'failed']);
export type IngestionStatus = z.infer<typeof ingestionStatusSchema>;

export const ingestionAcceptResponseSchema = z.object({
  accepted: z.literal(true),
  ingestionLogId: uuidSchema,
  status: z.enum(['received', 'duplicate']),
});
export type IngestionAcceptResponse = z.infer<typeof ingestionAcceptResponseSchema>;

export const ingestionLogStatusResponseSchema = z.object({
  id: uuidSchema,
  status: ingestionStatusSchema,
  receivedAt: z.string().datetime(),
  processedAt: z.string().datetime().nullable(),
  errorMessage: z.string().nullable(),
});
export type IngestionLogStatusResponse = z.infer<typeof ingestionLogStatusResponseSchema>;
