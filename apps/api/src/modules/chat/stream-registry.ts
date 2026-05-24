import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { SseEvent } from '@olives/types';

export interface StreamEntry {
  emitter: EventEmitter;
  buffer: SseEvent[];
  ended: boolean;
}

/**
 * In-memory pub/sub between the background inference loop and the SSE subscriber.
 *
 * Single-process scope. If we ever run multiple api replicas, swap the
 * implementation for a Redis pub/sub-backed one (Phase 4+ concern; the
 * `StreamRegistry` interface stays).
 *
 * `buffer` lets a subscriber that connects after `message_start` was already
 * emitted catch up. `end()` keeps the entry around for a grace period so a
 * latecomer can still read the full event log of a finished inference.
 */
@Injectable()
export class StreamRegistry {
  private readonly streams = new Map<string, StreamEntry>();
  private static readonly POST_END_GRACE_MS = 60_000;

  open(inferenceRequestId: string): StreamEntry {
    const entry: StreamEntry = {
      emitter: new EventEmitter(),
      buffer: [],
      ended: false,
    };
    this.streams.set(inferenceRequestId, entry);
    return entry;
  }

  publish(inferenceRequestId: string, event: SseEvent): void {
    const entry = this.streams.get(inferenceRequestId);
    if (entry === undefined || entry.ended) return;
    entry.buffer.push(event);
    entry.emitter.emit('event', event);
  }

  end(inferenceRequestId: string): void {
    const entry = this.streams.get(inferenceRequestId);
    if (entry === undefined) return;
    entry.ended = true;
    entry.emitter.emit('end');
    const timer = setTimeout(() => {
      this.streams.delete(inferenceRequestId);
    }, StreamRegistry.POST_END_GRACE_MS);
    timer.unref();
  }

  get(inferenceRequestId: string): StreamEntry | undefined {
    return this.streams.get(inferenceRequestId);
  }
}
