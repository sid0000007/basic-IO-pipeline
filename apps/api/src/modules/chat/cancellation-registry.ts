import { Injectable } from '@nestjs/common';

interface CancellationEntry {
  controller: AbortController;
  cancelRequested: boolean;
}

/**
 * In-memory registry of abort controllers, keyed by inferenceRequestId.
 *
 * Two callers:
 *   - the chat background loop registers an AbortController via `register()`
 *     when it kicks off the provider stream.
 *   - the cancel endpoint calls `requestCancel()` which flips the abort signal.
 *
 * `requestCancel()` is safe to call before `register()` — we record the intent
 * and the registering call observes it and aborts immediately. This closes the
 * race window where a user clicks cancel between POST and the background loop
 * actually starting the provider stream.
 *
 * Single-process scope, same as `StreamRegistry`.
 */
@Injectable()
export class CancellationRegistry {
  private readonly entries = new Map<string, CancellationEntry>();
  private readonly preRegisteredIntent = new Set<string>();

  register(inferenceRequestId: string): AbortController {
    const controller = new AbortController();
    const cancelRequested = this.preRegisteredIntent.delete(inferenceRequestId);
    if (cancelRequested) {
      controller.abort();
    }
    this.entries.set(inferenceRequestId, { controller, cancelRequested });
    return controller;
  }

  requestCancel(inferenceRequestId: string): boolean {
    const entry = this.entries.get(inferenceRequestId);
    if (entry === undefined) {
      this.preRegisteredIntent.add(inferenceRequestId);
      return true;
    }
    if (entry.cancelRequested) return false;
    entry.cancelRequested = true;
    entry.controller.abort();
    return true;
  }

  release(inferenceRequestId: string): void {
    this.entries.delete(inferenceRequestId);
    this.preRegisteredIntent.delete(inferenceRequestId);
  }

  wasCancelled(inferenceRequestId: string): boolean {
    return this.entries.get(inferenceRequestId)?.cancelRequested === true;
  }
}
