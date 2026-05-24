'use client';

import { useEffect, useRef, useState } from 'react';
import type { MessageDto } from '@olives/types';
import { Composer } from '@/components/chat/composer';
import { MessageList } from '@/components/chat/message-list';
import { Icon } from '@/components/layout/icon';
import { useStreamingChat } from '@/hooks/use-streaming-chat';

interface Props {
  conversationId: string;
  initialMessages: MessageDto[];
}

const SUGGESTIONS = [
  {
    tag: 'QUOTE',
    title: 'Quote my deployment',
    sub: "Walk through controls, get a binder by end of call.",
  },
  {
    tag: 'INCIDENT',
    title: 'Report an incident',
    sub: 'Open a claim or a near-miss for one of your covered perils.',
  },
  {
    tag: 'POLICY',
    title: 'Explain my coverage',
    sub: "Plain-language summary of what's covered and what isn't.",
  },
  {
    tag: 'BENCHMARK',
    title: 'Benchmark my risk',
    sub: 'Compare your telemetry to similar deployments in our book.',
  },
];

export function ChatView({ conversationId, initialMessages }: Props) {
  const [messages, setMessages] = useState<MessageDto[]>(initialMessages);
  const { state, send, cancel, reset } = useStreamingChat(conversationId);

  const streamingIdRef = useRef<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = threadRef.current;
    if (el === null) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const streamingId = streamingIdRef.current;
    if (streamingId === null) return;

    if (state.status === 'streaming') {
      const text = state.assistantText;
      setMessages((prev) =>
        prev.map((m) => (m.id === streamingId ? { ...m, content: text } : m)),
      );
      return;
    }
    if (state.status === 'completed') {
      const text = state.assistantText;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingId ? { ...m, content: text, status: 'completed' } : m,
        ),
      );
      streamingIdRef.current = null;
      reset();
      return;
    }
    if (state.status === 'cancelled') {
      const text = state.assistantText;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingId ? { ...m, content: text, status: 'cancelled' } : m,
        ),
      );
      streamingIdRef.current = null;
      reset();
      return;
    }
    if (state.status === 'error') {
      setMessages((prev) =>
        prev.map((m) => (m.id === streamingId ? { ...m, status: 'failed' } : m)),
      );
      streamingIdRef.current = null;
    }
  }, [state, reset]);

  async function handleSubmit(content: string) {
    const now = Date.now();
    const userId = `local-user-${now}`;
    const assistantId = `local-assistant-${now}`;
    const userMessage: MessageDto = {
      id: userId,
      conversationId,
      role: 'user',
      content,
      contentPreview: content.slice(0, 1000),
      sequenceNumber: messages.length,
      status: 'completed',
      createdAt: new Date().toISOString(),
    };
    const assistantPlaceholder: MessageDto = {
      id: assistantId,
      conversationId,
      role: 'assistant',
      content: '',
      contentPreview: null,
      sequenceNumber: messages.length + 1,
      status: 'streaming',
      createdAt: new Date().toISOString(),
    };
    streamingIdRef.current = assistantId;
    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
    await send(content);
  }

  const isStreaming = state.status === 'streaming';

  return (
    <>
      <div className="thread" ref={threadRef}>
        <MessageList messages={messages} />
        {state.status === 'error' && (
          <div
            style={{
              borderRadius: 'var(--radius)',
              border: '1px solid color-mix(in oklch, var(--err) 30%, transparent)',
              background: 'color-mix(in oklch, var(--err) 8%, transparent)',
              color: 'var(--err)',
              padding: '10px 12px',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <span>{state.message}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
              Dismiss
            </button>
          </div>
        )}
      </div>

      <div className="composer-wrap">
        {messages.length === 0 && (
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.tag}
                type="button"
                className="suggestion"
                onClick={() => {
                  void handleSubmit(`${s.title}.`);
                }}
                disabled={isStreaming}
              >
                <span className="tag">{s.tag}</span>
                <strong>{s.title}</strong>
                <span>{s.sub}</span>
              </button>
            ))}
          </div>
        )}
        <Composer disabled={isStreaming} onSubmit={handleSubmit} />
        <div className="composer-hint">
          <span className="kbd">⌘</span>
          <span className="kbd">↵</span>
          <span>to send</span>
          {isStreaming ? (
            <button
              type="button"
              onClick={cancel}
              style={{
                marginLeft: 'auto',
                color: 'var(--err)',
                fontSize: 11,
                borderBottom: '1px dotted',
              }}
            >
              Cancel generation <Icon name="x" size={10} />
            </button>
          ) : (
            <span style={{ marginLeft: 'auto' }}>Logged to telemetry</span>
          )}
        </div>
      </div>
    </>
  );
}
