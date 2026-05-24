import { z } from 'zod';
import { uuidSchema } from '../common/id';

/**
 * BullMQ job payload for the `ingestion-processing` queue.
 *
 * Carries only the id — the worker reloads the full payload from Postgres
 * to avoid stale data and keep Redis payloads small.
 */
export const ingestionJobPayloadSchema = z.object({
  ingestionLogId: uuidSchema,
});
export type IngestionJobPayload = z.infer<typeof ingestionJobPayloadSchema>;
