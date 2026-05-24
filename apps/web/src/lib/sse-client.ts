import { sseEventSchema, type SseEvent } from '@olives/types';

export interface SseClientHandle {
  close(): void;
}

export function openSseStream(
  url: string,
  onEvent: (event: SseEvent) => void,
  onError: (err: Error) => void,
): SseClientHandle {
  const es = new EventSource(url);

  es.onmessage = (msg: MessageEvent<string>) => {
    let raw: unknown;
    try {
      raw = JSON.parse(msg.data);
    } catch {
      onError(new Error(`SSE payload is not valid JSON: ${msg.data}`));
      return;
    }
    const parsed = sseEventSchema.safeParse(raw);
    if (!parsed.success) {
      onError(new Error(`Invalid SSE event shape: ${parsed.error.message}`));
      return;
    }
    onEvent(parsed.data);
  };

  es.onerror = () => {
    onError(new Error('SSE connection error'));
  };

  return {
    close: () => {
      es.close();
    },
  };
}
