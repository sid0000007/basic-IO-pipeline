import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import type {
  IngestionAcceptResponse,
  IngestionLogStatusResponse,
  InferenceLogPayloadV1,
} from '@olives/types';
import { EnvService } from '../../config/config.module';
import { PrismaService } from '../../prisma/prisma.service';
import { INGESTION_QUEUE } from '../../queues/bullmq.module';

@Injectable()
export class IngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly env: EnvService,
    @Inject(INGESTION_QUEUE) private readonly queue: Queue,
  ) {}

  async receive(payload: InferenceLogPayloadV1): Promise<IngestionAcceptResponse> {
    // Idempotency: if (source, sourceEventId) already exists, return the existing
    // row tagged 'duplicate'. Postgres treats NULL as distinct so multiple rows
    // with NULL sourceEventId coexist freely (which is what we want for callers
    // that don't supply an idempotency key).
    const sourceEventId = payload.sourceEventId ?? null;
    if (sourceEventId !== null) {
      const existing = await this.prisma.ingestionLog.findUnique({
        where: {
          unique_source_event: {
            source: payload.source,
            sourceEventId,
          },
        },
        select: { id: true },
      });
      if (existing !== null) {
        return {
          accepted: true,
          ingestionLogId: existing.id,
          status: 'duplicate',
        };
      }
    }

    const rawPayload = buildRawPayload(payload);

    const row = await this.prisma.ingestionLog.create({
      data: {
        source: payload.source,
        sourceEventId: payload.sourceEventId ?? null,
        requestId: payload.data.inferenceRequestId ?? null,
        payloadVersion: payload.payloadVersion,
        receivedAt: new Date(),
        rawPayload,
        status: 'received',
      },
      select: { id: true },
    });

    await this.queue.add(
      'process',
      { ingestionLogId: row.id },
      {
        attempts: this.env.get('INGESTION_MAX_ATTEMPTS'),
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 24 * 3600, count: 1000 },
        // Keep failed jobs in Redis so /admin/queues/:name/failed can list them.
        removeOnFail: false,
      },
    );

    return {
      accepted: true,
      ingestionLogId: row.id,
      status: 'received',
    };
  }

  async status(id: string): Promise<IngestionLogStatusResponse> {
    const row = await this.prisma.ingestionLog.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        receivedAt: true,
        processedAt: true,
        errorMessage: true,
      },
    });
    if (row === null) {
      throw new NotFoundException(`Ingestion log ${id} not found`);
    }
    return {
      id: row.id,
      status: row.status,
      receivedAt: row.receivedAt.toISOString(),
      processedAt: row.processedAt !== null ? row.processedAt.toISOString() : null,
      errorMessage: row.errorMessage,
    };
  }
}

/**
 * Build the JSON payload stored in `ingestion_logs.raw_payload`.
 *
 * Maps every optional/undefined field to `null` so the persisted JSON has a
 * stable shape — predictable queries via Postgres jsonb operators and no
 * "is the key missing or undefined" ambiguity for downstream consumers.
 */
function buildRawPayload(payload: InferenceLogPayloadV1): Prisma.InputJsonValue {
  const data: Prisma.JsonObject = {
    inferenceRequestId: payload.data.inferenceRequestId ?? null,
    conversationId: payload.data.conversationId ?? null,
    sessionId: payload.data.sessionId,
    provider: payload.data.provider,
    model: payload.data.model,
    status: payload.data.status,
    latencyMs: payload.data.latencyMs ?? null,
    timeToFirstTokenMs: payload.data.timeToFirstTokenMs ?? null,
    inputTokens: payload.data.inputTokens ?? null,
    outputTokens: payload.data.outputTokens ?? null,
    inputPreview: payload.data.inputPreview ?? null,
    outputPreview: payload.data.outputPreview ?? null,
    errorCode: payload.data.errorCode ?? null,
    errorMessage: payload.data.errorMessage ?? null,
  };

  return {
    source: payload.source,
    sourceEventId: payload.sourceEventId ?? null,
    payloadVersion: payload.payloadVersion,
    eventType: payload.eventType,
    timestamp: payload.timestamp,
    data,
  };
}
