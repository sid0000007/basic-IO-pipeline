import { Global, Module } from '@nestjs/common';
import { AnthropicProvider } from './anthropic.provider';
import { GeminiProvider } from './gemini.provider';
import { OpenAiProvider } from './openai.provider';
import { LlmProviderFactory } from './provider.factory';

@Global()
@Module({
  providers: [AnthropicProvider, OpenAiProvider, GeminiProvider, LlmProviderFactory],
  exports: [LlmProviderFactory],
})
export class LlmProviderModule {}
