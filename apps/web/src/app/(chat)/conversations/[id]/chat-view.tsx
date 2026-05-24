'use client';

import { useEffect, useRef, useState } from 'react';
import type { MessageDto } from '@olives/types';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Composer } from '@/components/chat/composer';
import { MessageList } from '@/components/chat/message-list';
import { useStreamingChat } from '@/hooks/use-streaming-chat';

interface Props {
  conversationId: string;
  initialMessages: MessageDto[];
}

export function ChatView({ conversationId, initialMessages }: Props) {
  const [messages, setMessages] = useState<MessageDto[]>(initialMessages);
  const { state, send, cancel, reset } = useStreamingChat(conversationId);

  // The id of the assistant placeholder we created for the current turn.
  // We mutate THIS message's content as tokens stream in, then flip its
  // status to completed/cancelled/failed when the stream terminates.
  // Single source of truth — the messages array — so prior turns never
  // disappear when a new turn starts.
  const streamingIdRef = useRef<string | null>(null);

  // Auto-scroll the messages pane to the bottom whenever content changes.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el === null) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Sync the streaming hook's state into the placeholder message.
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
      // Don't reset() — keep state.message visible in the error banner below
      // until the user clicks the Reset button.
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
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pr-2">
        <MessageList messages={messages} />
        {state.status === 'error' && (
          <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-800">
            {state.message}
          </div>
        )}
      </div>
      <div className="shrink-0">
        <Separator className="mb-3" />
        <div className="flex flex-col gap-2">
          <Composer disabled={isStreaming} onSubmit={handleSubmit} />
          {isStreaming && (
            <Button type="button" variant="outline" onClick={cancel}>
              Cancel generation
            </Button>
          )}
          {state.status === 'error' && (
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              Dismiss error
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
