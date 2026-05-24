import { describe, expect, it } from 'vitest';
import {
  createConversationRequestSchema,
  postMessageRequestSchema,
  sseEventSchema,
} from '@olives/types';

describe('postMessageRequestSchema', () => {
  it('applies defaults for stream / provider / model', () => {
    const parsed = postMessageRequestSchema.parse({ content: 'hello' });
    expect(parsed.content).toBe('hello');
    expect(parsed.stream).toBe(true);
    expect(parsed.provider).toBe('anthropic');
    expect(parsed.model).toBe('claude-sonnet-4-6');
  });

  it('rejects empty content', () => {
    expect(() => postMessageRequestSchema.parse({ content: '' })).toThrow();
  });

  it('rejects unsupported provider', () => {
    expect(() => postMessageRequestSchema.parse({ content: 'x', provider: 'cohere' })).toThrow();
  });

  it('accepts the Phase 3 fallback fields', () => {
    const parsed = postMessageRequestSchema.parse({
      content: 'x',
      provider: 'anthropic',
      fallbackProvider: 'openai',
      fallbackModel: 'gpt-4.1-mini',
    });
    expect(parsed.fallbackProvider).toBe('openai');
    expect(parsed.fallbackModel).toBe('gpt-4.1-mini');
  });
});

describe('createConversationRequestSchema', () => {
  it('treats body without title as valid', () => {
    const parsed = createConversationRequestSchema.parse({});
    expect(parsed.title).toBeUndefined();
  });

  it('rejects empty title string', () => {
    expect(() => createConversationRequestSchema.parse({ title: '' })).toThrow();
  });
});

describe('sseEventSchema discriminated union', () => {
  it('parses a token event', () => {
    const parsed = sseEventSchema.parse({ type: 'token', delta: 'hi' });
    expect(parsed.type).toBe('token');
    if (parsed.type === 'token') {
      expect(parsed.delta).toBe('hi');
    }
  });

  it('rejects unknown event types', () => {
    expect(() => sseEventSchema.parse({ type: 'mystery' })).toThrow();
  });
});
