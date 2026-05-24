'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api-client';
import { openSseStream, type SseClientHandle } from '../lib/sse-client';

export type StreamingState =
  | { status: 'idle' }
  | {
      status: 'streaming';
      assistantText: string;
      inferenceRequestId: string;
    }
  | {
      status: 'completed';
      assistantText: string;
      inferenceRequestId: string;
    }
  | {
      status: 'cancelled';
      assistantText: string;
      inferenceRequestId: string;
    }
  | { status: 'error'; message: string };

interface UseStreamingChat {
  state: StreamingState;
  send(content: string): Promise<void>;
  cancel(): Promise<void>;
  reset(): void;
}

export function useStreamingChat(conversationId: string): UseStreamingChat {
  const [state, setState] = useState<StreamingState>({ status: 'idle' });
  const sseRef = useRef<SseClientHandle | null>(null);

  useEffect(() => {
    return () => {
      sseRef.current?.close();
      sseRef.current = null;
    };
  }, []);

  const send = useCallback(
    async (content: string) => {
      sseRef.current?.close();
      sseRef.current = null;

      let inferenceRequestId: string;
      try {
        const response = await api.postMessage(conversationId, {
          content,
          stream: true,
          provider: 'anthropic',
          model: 'claude-sonnet-4-6',
        });
        inferenceRequestId = response.inferenceRequestId;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to send message';
        setState({ status: 'error', message });
        return;
      }

      setState({ status: 'streaming', assistantText: '', inferenceRequestId });

      sseRef.current = openSseStream(
        api.sseStreamUrl(conversationId, inferenceRequestId),
        (event) => {
          setState((prev) => {
            if (prev.status !== 'streaming') return prev;
            if (event.type === 'token') {
              return { ...prev, assistantText: prev.assistantText + event.delta };
            }
            if (event.type === 'message_complete') {
              sseRef.current?.close();
              sseRef.current = null;
              return {
                status: 'completed',
                assistantText: prev.assistantText,
                inferenceRequestId: prev.inferenceRequestId,
              };
            }
            if (event.type === 'cancelled') {
              sseRef.current?.close();
              sseRef.current = null;
              return {
                status: 'cancelled',
                assistantText: prev.assistantText,
                inferenceRequestId: prev.inferenceRequestId,
              };
            }
            if (event.type === 'error') {
              sseRef.current?.close();
              sseRef.current = null;
              return { status: 'error', message: event.message };
            }
            return prev;
          });
        },
        (err) => {
          setState((prev) =>
            prev.status === 'streaming' || prev.status === 'idle'
              ? { status: 'error', message: err.message }
              : prev,
          );
        },
      );
    },
    [conversationId],
  );

  const cancel = useCallback(async () => {
    if (state.status !== 'streaming') return;
    try {
      await api.cancelInference(state.inferenceRequestId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Cancel failed';
      setState({ status: 'error', message });
    }
  }, [state]);

  const reset = useCallback(() => {
    sseRef.current?.close();
    sseRef.current = null;
    setState({ status: 'idle' });
  }, []);

  return { state, send, cancel, reset };
}
