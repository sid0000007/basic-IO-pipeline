import { Injectable } from '@nestjs/common';
import { AnthropicProvider } from './anthropic.provider';
import { GeminiProvider } from './gemini.provider';
import { OpenAiProvider } from './openai.provider';
import type { LlmProvider } from './provider.interface';

@Injectable()
export class LlmProviderFactory {
  constructor(
    private readonly anthropic: AnthropicProvider,
    private readonly openai: OpenAiProvider,
    private readonly gemini: GeminiProvider,
  ) {}

  get(name: string): LlmProvider {
    if (name === 'anthropic') return this.anthropic;
    if (name === 'openai') return this.openai;
    if (name === 'gemini') return this.gemini;
    throw new Error(
      `Unsupported LLM provider: ${name}. Available: anthropic, openai, gemini`,
    );
  }
}
