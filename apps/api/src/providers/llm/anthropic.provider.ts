import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { EnvService } from '../../config/config.module';
import type { LlmErrorChunk, LlmProvider, LlmRequest, LlmStreamChunk } from './provider.interface';

@Injectable()
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(env: EnvService) {
    this.client = new Anthropic({ apiKey: env.get('ANTHROPIC_API_KEY') });
  }

  async *stream(request: LlmRequest): AsyncIterable<LlmStreamChunk> {
    const apiMessages: Anthropic.MessageParam[] = [];
    for (const m of request.messages) {
      if (m.role === 'user' || m.role === 'assistant') {
        apiMessages.push({ role: m.role, content: m.content });
      }
    }

    const params: Anthropic.MessageStreamParams = {
      model: request.model,
      max_tokens: request.maxOutputTokens ?? 4096,
      messages: apiMessages,
      ...(request.systemPrompt !== undefined && { system: request.systemPrompt }),
      ...(request.temperature !== undefined && { temperature: request.temperature }),
    };
    const options = request.abortSignal !== undefined ? { signal: request.abortSignal } : {};

    const stream = this.client.messages.stream(params, options);

    try {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'token', delta: event.delta.text };
        }
      }
      const finalMessage = await stream.finalMessage();
      yield {
        type: 'completed',
        usage: {
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
        },
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Caller decides cancellation semantics; stop yielding.
        return;
      }
      yield this.toErrorChunk(err);
    }
  }

  private toErrorChunk(err: unknown): LlmErrorChunk {
    if (err instanceof Anthropic.APIError) {
      const status = err.status ?? 0;
      return {
        type: 'error',
        code: `anthropic_${status || 'unknown'}`,
        message: err.message,
        retryable: status >= 500,
      };
    }
    const message = err instanceof Error ? err.message : 'Unknown provider error';
    return { type: 'error', code: 'anthropic_unknown', message, retryable: false };
  }
}
