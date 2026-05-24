import { Injectable, Logger } from '@nestjs/common';
import type { InferenceLogPayloadV1 } from '@olives/types';
import { PrismaService } from '../../prisma/prisma.service';
import { IngestionEnqueuer } from '../../modules/ingestion/ingestion-enqueuer.service';

const PREVIEW_MAX_CHARS = 1000;

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

export interface BeginInferenceInput {
  conversationId: string;
  userMessageId: string;
  sessionId: string;
  provider: string;
  model: string;
}

export interface CompletedInferenceInput {
  assistantMessageId: string;
  inputTokens: number;
  outputTokens: number;
  firstTokenAt: Date | null;
  inputPreview: string;
  outputPreview: string;
}

export interface FailedInferenceInput {
  assistantMessageId?: string;
  errorCode: string;
  errorMessage: string;
  firstTokenAt?: Date | null;
  partialOutputPreview?: string;
}

export interface CancelledInferenceInput {
  assistantMessageId?: string;
  firstTokenAt?: Date | null;
  partialOutputPreview?: string;
}

/**
 * Context returned by `begin()` and threaded through subsequent lifecycle calls.
 * Carries enough metadata for both the row update and the Phase 2 ingestion payload.
 */
export interface InferenceContext {
  inferenceRequestId: string;
  startedAt: Date;
  conversationId: string;
  userMessageId: string;
  sessionId: string;
  provider: string;
  model: string;
}

/**
 * In-process SDK that wraps every LLM call with structured persistence.
 *
 * Phase 1 wrote synchronously to `inference_requests`.
 *
 * Phase 2 (this version) additionally emits an async ingestion event after
 * each terminal write. The ingestion enqueue failure is logged but NEVER
 * propagated — chat success cannot depend on log ingestion success
 * (`AGENT.md §8`).
 */
@Injectable()
export class InferenceLoggerService {
  private readonly logger = new Logger(InferenceLoggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly enqueuer: IngestionEnqueuer,
  ) {}

  async begin(input: BeginInferenceInput): Promise<InferenceContext> {
    const startedAt = new Date();
    const row = await this.prisma.inferenceRequest.create({
      data: {
        conversationId: input.conversationId,
        userMessageId: input.userMessageId,
        sessionId: input.sessionId,
        provider: input.provider,
        model: input.model,
        status: 'started',
        requestStartedAt: startedAt,
      },
      select: { id: true },
    });
    return {
      inferenceRequestId: row.id,
      startedAt,
      conversationId: input.conversationId,
      userMessageId: input.userMessageId,
      sessionId: input.sessionId,
      provider: input.provider,
      model: input.model,
    };
  }

  async markFirstToken(ctx: InferenceContext, firstTokenAt: Date): Promise<void> {
    await this.prisma.inferenceRequest.update({
      where: { id: ctx.inferenceRequestId },
      data: {
        status: 'streaming',
        firstTokenAt,
        timeToFirstTokenMs: firstTokenAt.getTime() - ctx.startedAt.getTime(),
      },
    });
  }

  async complete(ctx: InferenceContext, result: CompletedInferenceInput): Promise<void> {
    const completedAt = new Date();
    const latencyMs = completedAt.getTime() - ctx.startedAt.getTime();
    const timeToFirstTokenMs =
      result.firstTokenAt !== null ? result.firstTokenAt.getTime() - ctx.startedAt.getTime() : null;
    const inputPreview = truncate(result.inputPreview, PREVIEW_MAX_CHARS);
    const outputPreview = truncate(result.outputPreview, PREVIEW_MAX_CHARS);

    await this.prisma.inferenceRequest.update({
      where: { id: ctx.inferenceRequestId },
      data: {
        status: 'completed',
        completedAt,
        latencyMs,
        firstTokenAt: result.firstTokenAt,
        timeToFirstTokenMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        totalTokens: result.inputTokens + result.outputTokens,
        inputPreview,
        outputPreview,
        assistantMessageId: result.assistantMessageId,
      },
    });

    await this.emit({
      source: 'chat-api',
      sourceEventId: `${ctx.inferenceRequestId}:completed`,
      payloadVersion: '1.0',
      eventType: 'request_completed',
      timestamp: completedAt.toISOString(),
      data: {
        inferenceRequestId: ctx.inferenceRequestId,
        conversationId: ctx.conversationId,
        sessionId: ctx.sessionId,
        provider: ctx.provider,
        model: ctx.model,
        status: 'completed',
        latencyMs,
        timeToFirstTokenMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        inputPreview,
        outputPreview,
      },
    });
  }

  async fail(ctx: InferenceContext, input: FailedInferenceInput): Promise<void> {
    const completedAt = new Date();
    const latencyMs = completedAt.getTime() - ctx.startedAt.getTime();
    const partialOutputPreview =
      input.partialOutputPreview !== undefined
        ? truncate(input.partialOutputPreview, PREVIEW_MAX_CHARS)
        : null;
    const firstTokenAt = input.firstTokenAt ?? null;
    const timeToFirstTokenMs =
      firstTokenAt !== null ? firstTokenAt.getTime() - ctx.startedAt.getTime() : null;

    await this.prisma.inferenceRequest.update({
      where: { id: ctx.inferenceRequestId },
      data: {
        status: 'failed',
        completedAt,
        latencyMs,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        ...(input.assistantMessageId !== undefined && {
          assistantMessageId: input.assistantMessageId,
        }),
        ...(input.firstTokenAt !== undefined && {
          firstTokenAt,
          timeToFirstTokenMs,
        }),
        ...(partialOutputPreview !== null && { outputPreview: partialOutputPreview }),
      },
    });

    await this.emit({
      source: 'chat-api',
      sourceEventId: `${ctx.inferenceRequestId}:failed`,
      payloadVersion: '1.0',
      eventType: 'request_failed',
      timestamp: completedAt.toISOString(),
      data: {
        inferenceRequestId: ctx.inferenceRequestId,
        conversationId: ctx.conversationId,
        sessionId: ctx.sessionId,
        provider: ctx.provider,
        model: ctx.model,
        status: 'failed',
        latencyMs,
        timeToFirstTokenMs,
        outputPreview: partialOutputPreview,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
      },
    });
  }

  async cancel(ctx: InferenceContext, input: CancelledInferenceInput = {}): Promise<void> {
    const completedAt = new Date();
    const latencyMs = completedAt.getTime() - ctx.startedAt.getTime();
    const partialOutputPreview =
      input.partialOutputPreview !== undefined
        ? truncate(input.partialOutputPreview, PREVIEW_MAX_CHARS)
        : null;
    const firstTokenAt = input.firstTokenAt ?? null;
    const timeToFirstTokenMs =
      firstTokenAt !== null ? firstTokenAt.getTime() - ctx.startedAt.getTime() : null;

    await this.prisma.inferenceRequest.update({
      where: { id: ctx.inferenceRequestId },
      data: {
        status: 'cancelled',
        completedAt,
        latencyMs,
        ...(input.assistantMessageId !== undefined && {
          assistantMessageId: input.assistantMessageId,
        }),
        ...(input.firstTokenAt !== undefined && {
          firstTokenAt,
          timeToFirstTokenMs,
        }),
        ...(partialOutputPreview !== null && { outputPreview: partialOutputPreview }),
      },
    });

    await this.emit({
      source: 'chat-api',
      sourceEventId: `${ctx.inferenceRequestId}:cancelled`,
      payloadVersion: '1.0',
      eventType: 'request_cancelled',
      timestamp: completedAt.toISOString(),
      data: {
        inferenceRequestId: ctx.inferenceRequestId,
        conversationId: ctx.conversationId,
        sessionId: ctx.sessionId,
        provider: ctx.provider,
        model: ctx.model,
        status: 'cancelled',
        latencyMs,
        timeToFirstTokenMs,
        outputPreview: partialOutputPreview,
      },
    });
  }

  /**
   * Emit to the ingestion pipeline, swallowing any failure with a log entry.
   * Chat success must not depend on ingestion success — that's a v1 design
   * tenet (`AGENT.md §8`).
   */
  private async emit(payload: InferenceLogPayloadV1): Promise<void> {
    try {
      await this.enqueuer.enqueue(payload);
    } catch (err) {
      this.logger.error(
        {
          err,
          inferenceRequestId: payload.data.inferenceRequestId,
          eventType: payload.eventType,
        },
        'Failed to enqueue ingestion event',
      );
    }
  }
}
