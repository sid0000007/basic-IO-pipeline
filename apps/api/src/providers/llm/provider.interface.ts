import type { MessageRole } from '@olives/types';

export interface LlmMessage {
  role: MessageRole;
  content: string;
}

export interface LlmRequest {
  model: string;
  systemPrompt?: string;
  messages: LlmMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  abortSignal?: AbortSignal;
}

export interface LlmTokenChunk {
  type: 'token';
  delta: string;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmCompletedChunk {
  type: 'completed';
  usage: LlmUsage;
}

export interface LlmErrorChunk {
  type: 'error';
  code: string;
  message: string;
  retryable: boolean;
}

export type LlmStreamChunk = LlmTokenChunk | LlmCompletedChunk | LlmErrorChunk;

export interface LlmProvider {
  readonly name: string;
  stream(request: LlmRequest): AsyncIterable<LlmStreamChunk>;
}
