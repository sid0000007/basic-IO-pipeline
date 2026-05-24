import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import type { Prisma } from '@prisma/client';
import {
  inferenceLogPayloadV1Schema,
  ingestionJobPayloadSchema,
  type InferenceLogPayloadV1,
} from '@olives/types';
import { EnvService } from '../../config/config.module';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_INGESTION_PROCESSING } from '../../queues/queue-names';
import { REDIS_CLIENT } from '../../queues/redis.module';
import { redactPii } from '../../common/redaction/pii-redactor';

@Injectable()
export class LoggingPipelineProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LoggingPipelineProcessor.name);
  private worker?: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly env: EnvService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker(
      QUEUE_INGESTION_PROCESSING,
      async (job: Job): Promise<void> => {
        await this.process(job);
      },
      {
        connection: this.redis,
        concurrency: this.env.get('INGESTION_QUEUE_CONCURRENCY'),
      },
    );

    this.worker.on('failed', (job, err) => {
      void this.handleFailed(job, err);
    });

    this.worker.on('ready', () => {
      this.logger.log(`Worker ready on queue ${QUEUE_INGESTION_PROCESSING}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker !== undefined) {
      await this.worker.close().catch(() => undefined);
    }
  }

  private async process(job: Job): Promise<void> {
    const jobPayload = ingestionJobPayloadSchema.parse(job.data);
    const row = await this.prisma.ingestionLog.findUniqueOrThrow({
      where: { id: jobPayload.ingestionLogId },
    });

    // Re-parse from storage. Defense in depth: if the schema evolves between
    // enqueue and dequeue, we surface the mismatch loudly rather than writing
    // a malformed inference_events row.
    const validated: InferenceLogPayloadV1 = inferenceLogPayloadV1Schema.parse(row.rawPayload);

    const redactionEnabled = this.env.get('PII_REDACTION_ENABLED');
    const inputPreview = validated.data.inputPreview ?? null;
    const outputPreview = validated.data.outputPreview ?? null;
    const normalizedInput =
      redactionEnabled && inputPreview !== null ? redactPii(inputPreview) : inputPreview;
    const normalizedOutput =
      redactionEnabled && outputPreview !== null ? redactPii(outputPreview) : outputPreview;

    const normalizedPayload = buildNormalizedPayload(validated, normalizedInput, normalizedOutput);

    const eventPayload = buildEventPayload(validated, normalizedInput, normalizedOutput);

    await this.prisma.$transaction(async (tx) => {
      const linkedInferenceId = validated.data.inferenceRequestId ?? null;
      if (linkedInferenceId !== null) {
        await tx.inferenceEvent.create({
          data: {
            inferenceRequestId: linkedInferenceId,
            eventType: validated.eventType,
            eventTimestamp: new Date(validated.timestamp),
            payload: eventPayload,
          },
        });
      }

      await tx.ingestionLog.update({
        where: { id: row.id },
        data: {
          status: 'processed',
          processedAt: new Date(),
          normalizedPayload,
        },
      });
    });
  }

  private async handleFailed(job: Job | undefined, err: Error): Promise<void> {
    this.logger.error({ jobId: job?.id, err: err.message }, 'Ingestion job failed');
    if (job === undefined) return;
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < attempts) {
      // Will be retried by BullMQ — don't mark the ingestion log as failed yet.
      return;
    }
    const parsed = ingestionJobPayloadSchema.safeParse(job.data);
    if (!parsed.success) return;
    await this.prisma.ingestionLog
      .update({
        where: { id: parsed.data.ingestionLogId },
        data: { status: 'failed', errorMessage: err.message },
      })
      .catch((updateErr: unknown) => {
        this.logger.error(
          { jobId: job.id, err: updateErr },
          'Failed to mark ingestion log as failed',
        );
      });
  }
}

function buildNormalizedPayload(
  payload: InferenceLogPayloadV1,
  inputPreview: string | null,
  outputPreview: string | null,
): Prisma.InputJsonValue {
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
    inputPreview,
    outputPreview,
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

function buildEventPayload(
  payload: InferenceLogPayloadV1,
  inputPreview: string | null,
  outputPreview: string | null,
): Prisma.InputJsonValue {
  return {
    sessionId: payload.data.sessionId,
    provider: payload.data.provider,
    model: payload.data.model,
    status: payload.data.status,
    latencyMs: payload.data.latencyMs ?? null,
    timeToFirstTokenMs: payload.data.timeToFirstTokenMs ?? null,
    inputTokens: payload.data.inputTokens ?? null,
    outputTokens: payload.data.outputTokens ?? null,
    inputPreview,
    outputPreview,
    errorCode: payload.data.errorCode ?? null,
    errorMessage: payload.data.errorMessage ?? null,
  };
}
