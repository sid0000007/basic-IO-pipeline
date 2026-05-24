import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  CancelInferenceResponse,
  MessageDto,
  PostMessageRequest,
  PostMessageResponse,
  SseEvent,
} from '@olives/types';
import { EnvService } from '../../config/config.module';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmProviderFactory } from '../../providers/llm/provider.factory';
import type { LlmMessage, LlmRequest } from '../../providers/llm/provider.interface';
import {
  InferenceLoggerService,
  type InferenceContext,
} from '../../sdk/inference-logger/inference-logger.service';
import { CancellationRegistry } from './cancellation-registry';
import { StreamRegistry } from './stream-registry';

interface MessageRowSummary {
  id: string;
  conversationId: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  contentPreview: string | null;
  sequenceNumber: number;
  status: 'completed' | 'streaming' | 'cancelled' | 'failed';
  createdAt: Date;
}

function toMessageDto(m: MessageRowSummary): MessageDto {
  return {
    id: m.id,
    conversationId: m.conversationId,
    role: m.role,
    content: m.content,
    contentPreview: m.contentPreview,
    sequenceNumber: m.sequenceNumber,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
  };
}

type AttemptOutcome =
  | { kind: 'completed'; inputTokens: number; outputTokens: number }
  | { kind: 'error'; code: string; message: string; retryable: boolean }
  | { kind: 'cancelled' };

interface AttemptState {
  assistantContent: string;
  firstTokenAt: Date | null;
  ctx: InferenceContext;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly env: EnvService,
    private readonly providers: LlmProviderFactory,
    private readonly inferenceLogger: InferenceLoggerService,
    private readonly streams: StreamRegistry,
    private readonly cancellations: CancellationRegistry,
  ) {}

  async startInference(
    conversationId: string,
    body: PostMessageRequest,
  ): Promise<PostMessageResponse> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, status: true },
    });
    if (conv === null) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }
    if (conv.status === 'archived') {
      throw new BadRequestException('Conversation is archived');
    }

    const last = await this.prisma.message.findFirst({
      where: { conversationId },
      orderBy: { sequenceNumber: 'desc' },
      select: { sequenceNumber: true },
    });
    const userSeq = (last?.sequenceNumber ?? -1) + 1;
    const assistantSeq = userSeq + 1;
    const sessionId = conversationId;

    const result = await this.prisma.$transaction(async (tx) => {
      const userMsg = await tx.message.create({
        data: {
          conversationId,
          role: 'user',
          content: body.content,
          contentPreview: body.content.slice(0, 1000),
          sequenceNumber: userSeq,
          status: 'completed',
        },
      });
      const assistantMsg = await tx.message.create({
        data: {
          conversationId,
          role: 'assistant',
          content: '',
          sequenceNumber: assistantSeq,
          status: 'streaming',
        },
      });
      const inferenceRow = await tx.inferenceRequest.create({
        data: {
          conversationId,
          userMessageId: userMsg.id,
          assistantMessageId: assistantMsg.id,
          sessionId,
          provider: body.provider,
          model: body.model,
          status: 'started',
          requestStartedAt: new Date(),
        },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: userMsg.createdAt },
      });
      return { userMsg, assistantMsg, inferenceRow };
    });

    const ctx: InferenceContext = {
      inferenceRequestId: result.inferenceRow.id,
      startedAt: result.inferenceRow.requestStartedAt,
      conversationId,
      userMessageId: result.userMsg.id,
      sessionId,
      provider: body.provider,
      model: body.model,
    };

    void this.runInferenceInBackground(ctx, result.assistantMsg.id, body).catch((err: unknown) => {
      this.logger.error(
        { err, inferenceRequestId: ctx.inferenceRequestId },
        'Unhandled error in runInferenceInBackground',
      );
    });

    return {
      userMessage: toMessageDto(result.userMsg),
      inferenceRequestId: result.inferenceRow.id,
      status: 'queued',
    };
  }

  async requestCancel(inferenceRequestId: string): Promise<CancelInferenceResponse> {
    const row = await this.prisma.inferenceRequest.findUnique({
      where: { id: inferenceRequestId },
      select: { id: true, status: true },
    });
    if (row === null) {
      throw new NotFoundException(`Inference ${inferenceRequestId} not found`);
    }
    const terminal = ['completed', 'failed', 'cancelled'];
    if (terminal.includes(row.status)) {
      return { id: row.id, status: row.status };
    }
    this.cancellations.requestCancel(inferenceRequestId);
    return { id: row.id, status: 'cancelled' };
  }

  private async runInferenceInBackground(
    ctxInitial: InferenceContext,
    assistantMessageId: string,
    body: PostMessageRequest,
  ): Promise<void> {
    this.streams.open(ctxInitial.inferenceRequestId);
    const abortCtl = this.cancellations.register(ctxInitial.inferenceRequestId);

    this.publishEvent(ctxInitial.inferenceRequestId, {
      type: 'message_start',
      inferenceRequestId: ctxInitial.inferenceRequestId,
      assistantMessageId,
    });

    const state: AttemptState = {
      assistantContent: '',
      firstTokenAt: null,
      ctx: ctxInitial,
    };
    let terminalEmitted = false;

    try {
      const limit = this.env.get('CHAT_CONTEXT_MESSAGE_LIMIT');
      const recentMessages = await this.prisma.message.findMany({
        where: {
          conversationId: state.ctx.conversationId,
          status: 'completed',
          role: { in: ['user', 'assistant'] },
        },
        orderBy: { sequenceNumber: 'desc' },
        take: limit,
      });
      const llmMessages: LlmMessage[] = recentMessages
        .reverse()
        .map((m) => ({ role: m.role, content: m.content }));

      // Primary attempt
      let outcome = await this.runAttempt(
        state.ctx,
        body.provider,
        body.model,
        llmMessages,
        abortCtl.signal,
        state,
      );

      // Fallback attempt: only if primary failed retryably AND no tokens streamed
      // AND a fallback was requested. Single-row design — the inference_requests
      // row's provider/model gets updated to the fallback values. Full audit
      // trail across two rows is a Phase 4 enhancement (see handover.md).
      const fallbackEligible =
        outcome.kind === 'error' &&
        outcome.retryable &&
        body.fallbackProvider !== undefined &&
        state.firstTokenAt === null;
      if (fallbackEligible && body.fallbackProvider !== undefined) {
        const fallbackModel = body.fallbackModel ?? body.model;
        this.logger.warn(
          {
            inferenceRequestId: state.ctx.inferenceRequestId,
            primaryProvider: body.provider,
            primaryError: outcome.kind === 'error' ? outcome.code : null,
            fallbackProvider: body.fallbackProvider,
            fallbackModel,
          },
          'Retrying inference on fallback provider',
        );
        await this.prisma.inferenceRequest.update({
          where: { id: state.ctx.inferenceRequestId },
          data: {
            provider: body.fallbackProvider,
            model: fallbackModel,
            status: 'started',
            errorCode: null,
            errorMessage: null,
          },
        });
        state.ctx = { ...state.ctx, provider: body.fallbackProvider, model: fallbackModel };
        outcome = await this.runAttempt(
          state.ctx,
          body.fallbackProvider,
          fallbackModel,
          llmMessages,
          abortCtl.signal,
          state,
        );
      }

      if (outcome.kind === 'completed') {
        await this.finalizeCompleted(
          state.ctx,
          assistantMessageId,
          state.assistantContent,
          body.content,
          state.firstTokenAt,
          outcome.inputTokens,
          outcome.outputTokens,
        );
        terminalEmitted = true;
      } else if (outcome.kind === 'error') {
        await this.finalizeFailed(
          state.ctx,
          assistantMessageId,
          state.assistantContent,
          state.firstTokenAt,
          outcome.code,
          outcome.message,
        );
        terminalEmitted = true;
      } else {
        // outcome.kind === 'cancelled'
        await this.finalizeCancelled(
          state.ctx,
          assistantMessageId,
          state.assistantContent,
          state.firstTokenAt,
        );
        terminalEmitted = true;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      try {
        await this.finalizeFailed(
          state.ctx,
          assistantMessageId,
          state.assistantContent,
          state.firstTokenAt,
          'unhandled_exception',
          errorMessage,
        );
        terminalEmitted = true;
      } catch (innerErr) {
        this.logger.error(
          { err: innerErr, inferenceRequestId: state.ctx.inferenceRequestId },
          'Failed to record terminal failure',
        );
      }
    } finally {
      if (!terminalEmitted) {
        this.publishEvent(state.ctx.inferenceRequestId, {
          type: 'error',
          code: 'internal_error',
          message: 'Inference terminated without a terminal event',
        });
      }
      this.cancellations.release(state.ctx.inferenceRequestId);
      this.streams.end(state.ctx.inferenceRequestId);
    }
  }

  private async runAttempt(
    ctx: InferenceContext,
    providerName: string,
    model: string,
    messages: LlmMessage[],
    abortSignal: AbortSignal,
    state: AttemptState,
  ): Promise<AttemptOutcome> {
    const provider = this.providers.get(providerName);
    const llmRequest: LlmRequest = { model, messages, abortSignal };

    for await (const chunk of provider.stream(llmRequest)) {
      if (abortSignal.aborted) {
        return { kind: 'cancelled' };
      }

      if (chunk.type === 'token') {
        if (state.firstTokenAt === null) {
          state.firstTokenAt = new Date();
          await this.inferenceLogger.markFirstToken(ctx, state.firstTokenAt);
        }
        state.assistantContent += chunk.delta;
        this.publishEvent(ctx.inferenceRequestId, { type: 'token', delta: chunk.delta });
      } else if (chunk.type === 'completed') {
        return {
          kind: 'completed',
          inputTokens: chunk.usage.inputTokens,
          outputTokens: chunk.usage.outputTokens,
        };
      } else if (chunk.type === 'error') {
        return {
          kind: 'error',
          code: chunk.code,
          message: chunk.message,
          retryable: chunk.retryable,
        };
      }
    }

    if (this.cancellations.wasCancelled(ctx.inferenceRequestId)) {
      return { kind: 'cancelled' };
    }
    return {
      kind: 'error',
      code: 'stream_ended_unexpectedly',
      message: 'Provider stream terminated without a terminal chunk',
      retryable: false,
    };
  }

  private publishEvent(inferenceRequestId: string, event: SseEvent): void {
    this.streams.publish(inferenceRequestId, event);
  }

  private async finalizeCompleted(
    ctx: InferenceContext,
    assistantMessageId: string,
    assistantContent: string,
    userContent: string,
    firstTokenAt: Date | null,
    inputTokens: number,
    outputTokens: number,
  ): Promise<void> {
    const completedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.message.update({
        where: { id: assistantMessageId },
        data: { content: assistantContent, status: 'completed' },
      });
      await tx.conversation.update({
        where: { id: ctx.conversationId },
        data: { lastMessageAt: completedAt },
      });
    });
    await this.inferenceLogger.complete(ctx, {
      assistantMessageId,
      inputTokens,
      outputTokens,
      firstTokenAt,
      inputPreview: userContent,
      outputPreview: assistantContent,
    });
    this.publishEvent(ctx.inferenceRequestId, {
      type: 'message_complete',
      assistantMessageId,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    });
  }

  private async finalizeFailed(
    ctx: InferenceContext,
    assistantMessageId: string,
    partialContent: string,
    firstTokenAt: Date | null,
    code: string,
    message: string,
  ): Promise<void> {
    await this.prisma.message.update({
      where: { id: assistantMessageId },
      data: { content: partialContent, status: 'failed' },
    });
    await this.inferenceLogger.fail(ctx, {
      assistantMessageId,
      errorCode: code,
      errorMessage: message,
      firstTokenAt,
      partialOutputPreview: partialContent,
    });
    this.publishEvent(ctx.inferenceRequestId, { type: 'error', code, message });
  }

  private async finalizeCancelled(
    ctx: InferenceContext,
    assistantMessageId: string,
    partialContent: string,
    firstTokenAt: Date | null,
  ): Promise<void> {
    await this.prisma.message.update({
      where: { id: assistantMessageId },
      data: { content: partialContent, status: 'cancelled' },
    });
    await this.inferenceLogger.cancel(ctx, {
      assistantMessageId,
      firstTokenAt,
      partialOutputPreview: partialContent,
    });
    this.publishEvent(ctx.inferenceRequestId, { type: 'cancelled' });
  }
}
