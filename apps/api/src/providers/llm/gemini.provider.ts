import { Injectable } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { EnvService } from '../../config/config.module';
import type {
  LlmErrorChunk,
  LlmProvider,
  LlmRequest,
  LlmStreamChunk,
} from './provider.interface';

interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

@Injectable()
export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';
  private readonly client: GoogleGenAI;

  constructor(env: EnvService) {
    this.client = new GoogleGenAI({ apiKey: env.get('GEMINI_API_KEY') });
  }

  async *stream(request: LlmRequest): AsyncIterable<LlmStreamChunk> {
    // Gemini uses 'user' / 'model' role names instead of 'user' / 'assistant'.
    // Map our assistant → model. Skip system / tool (system goes via
    // systemInstruction, tool isn't supported in v1).
    const contents: GeminiContent[] = [];
    for (const m of request.messages) {
      if (m.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: m.content }] });
      } else if (m.role === 'assistant') {
        contents.push({ role: 'model', parts: [{ text: m.content }] });
      }
    }

    try {
      const response = await this.client.models.generateContentStream({
        model: request.model,
        contents,
        config: {
          maxOutputTokens: request.maxOutputTokens ?? 4096,
          ...(request.systemPrompt !== undefined && {
            systemInstruction: request.systemPrompt,
          }),
          ...(request.temperature !== undefined && { temperature: request.temperature }),
        },
      });

      let inputTokens = 0;
      let outputTokens = 0;
      for await (const chunk of response) {
        // Honor abort cooperatively — the Google SDK doesn't natively wire to
        // AbortSignal in its streaming options as of v1, so check between chunks.
        if (request.abortSignal?.aborted === true) {
          return;
        }
        const text = chunk.text;
        if (typeof text === 'string' && text.length > 0) {
          yield { type: 'token', delta: text };
        }
        if (chunk.usageMetadata !== undefined) {
          inputTokens = chunk.usageMetadata.promptTokenCount ?? inputTokens;
          outputTokens = chunk.usageMetadata.candidatesTokenCount ?? outputTokens;
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
    if (err instanceof Error) {
      // Gemini errors can arrive in two shapes: a bracketed prefix
      //   "[400 Bad Request] ..."
      // or a wrapped JSON-in-JSON body containing `"code": 400`. Try both.
      const bracketed = /\[(\d{3})/.exec(err.message);
      const jsonCode = /"code"\s*:\s*(\d{3})/.exec(err.message);
      const statusStr = bracketed?.[1] ?? jsonCode?.[1];
      const parsedStatus =
        typeof statusStr === 'string' ? Number.parseInt(statusStr, 10) : Number.NaN;
      const status = Number.isFinite(parsedStatus) ? parsedStatus : 0;
      return {
        type: 'error',
        code: `gemini_${status > 0 ? status : 'unknown'}`,
        message: err.message,
        retryable: status >= 500,
      };
    }
    return {
      type: 'error',
      code: 'gemini_unknown',
      message: 'Unknown provider error',
      retryable: false,
    };
  }
}
