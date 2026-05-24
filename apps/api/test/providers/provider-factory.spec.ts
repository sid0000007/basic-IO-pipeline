import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { AnthropicProvider } from '../../src/providers/llm/anthropic.provider';
import { GeminiProvider } from '../../src/providers/llm/gemini.provider';
import { OpenAiProvider } from '../../src/providers/llm/openai.provider';
import { LlmProviderFactory } from '../../src/providers/llm/provider.factory';

function buildFactory(): LlmProviderFactory {
  const anthropic = mockDeep<AnthropicProvider>();
  Object.defineProperty(anthropic, 'name', { value: 'anthropic' });
  const openai = mockDeep<OpenAiProvider>();
  Object.defineProperty(openai, 'name', { value: 'openai' });
  const gemini = mockDeep<GeminiProvider>();
  Object.defineProperty(gemini, 'name', { value: 'gemini' });
  return new LlmProviderFactory(anthropic, openai, gemini);
}

describe('LlmProviderFactory', () => {
  it('returns the Anthropic provider for "anthropic"', () => {
    const factory = buildFactory();
    expect(factory.get('anthropic').name).toBe('anthropic');
  });

  it('returns the OpenAI provider for "openai"', () => {
    const factory = buildFactory();
    expect(factory.get('openai').name).toBe('openai');
  });

  it('returns the Gemini provider for "gemini"', () => {
    const factory = buildFactory();
    expect(factory.get('gemini').name).toBe('gemini');
  });

  it('throws on an unknown provider name', () => {
    const factory = buildFactory();
    expect(() => factory.get('cohere')).toThrow('Unsupported LLM provider');
  });
});
