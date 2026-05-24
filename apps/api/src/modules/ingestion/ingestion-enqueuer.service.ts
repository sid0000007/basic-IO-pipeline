import { Injectable } from '@nestjs/common';
import type { InferenceLogPayloadV1 } from '@olives/types';
import { IngestionService } from './ingestion.service';

/**
 * Thin facade so internal callers (e.g. `InferenceLoggerService`) don't depend
 * on the HTTP controller layer of `IngestionModule`. Today this delegates to
 * `IngestionService.receive()` directly, sharing one code path with the
 * external HTTP endpoint. A future optimization could swap in a direct
 * BullMQ enqueue (skipping `ingestion_logs` writes for internal traffic) —
 * that change happens here, not at every call site.
 */
@Injectable()
export class IngestionEnqueuer {
  constructor(private readonly ingestion: IngestionService) {}

  async enqueue(payload: InferenceLogPayloadV1): Promise<void> {
    await this.ingestion.receive(payload);
  }
}
