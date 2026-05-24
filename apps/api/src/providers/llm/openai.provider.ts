import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { EnvService } from '../../config/config.module';
import type { LlmErrorChunk, LlmProvider, LlmRequest, LlmStreamChunk } from './provider.interface';

@Injectable()
export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;

  constructor(env: EnvService) {
    this.client = new OpenAI({ apiKey: env.get('OPENAI_API_KEY') });
  }

  async *stream(request: LlmRequest): AsyncIterable<LlmStreamChunk> {
    const messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }> = [];
    if (request.systemPrompt !== undefined) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    for (const m of request.messages) {
      if (m.role === 'user' || m.role === 'assistant') {
        messages.push({ role: m.role, content: m.content });
      }
    }

    const options = request.abortSignal !== undefined ? { signal: request.abortSignal } : {};

    try {
      const stream = await this.client.chat.completions.create(
        {
          model: request.model,
          max_tokens: request.maxOutputTokens ?? 4096,
          stream: true,
          stream_options: { include_usage: true },
          messages,
          ...(request.temperature !== undefined && { temperature: request.temperature }),
        },
        options,
      );

      let inputTokens = 0;
      let outputTokens = 0;
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (typeof delta === 'string' && delta.length > 0) {
          yield { type: 'token', delta };
        }
        if (chunk.usage !== null && chunk.usage !== undefined) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
        }
      }
      yield { type: 'completed', usage: { inputTokens, outputTokens } };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      yield this.toErrorChunk(err);
    }
  }

  private toErrorChunk(err: unknown): LlmErrorChunk {
    if (err instanceof OpenAI.APIError) {
      // err.status is typed as `any` in the SDK; narrow it via an explicit
      // `unknown` annotation before the typeof check.
      const rawStatus: unknown = err.status;
      const status = typeof rawStatus === 'number' ? rawStatus : 0;
      return {
        type: 'error',
        code: `openai_${status > 0 ? status : 'unknown'}`,
        message: err.message,
        retryable: status >= 500,
      };
    }
    const message = err instanceof Error ? err.message : 'Unknown provider error';
    return { type: 'error', code: 'openai_unknown', message, retryable: false };
  }
}
