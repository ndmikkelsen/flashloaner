/**
 * Event capture utilities for testing EventEmitter-based modules.
 *
 * Provides helpers to collect, wait for, and assert on events emitted
 * by PriceMonitor, OpportunityDetector, and other EventEmitter classes.
 */

import type { EventEmitter } from "node:events";

/** A captured event with its arguments */
export interface CapturedEvent<T = unknown> {
  /** Event name */
  name: string;
  /** Event arguments */
  args: T;
  /** Capture timestamp (ms) */
  timestamp: number;
}

/**
 * Capture all events of a given name from an emitter.
 * Returns a function that retrieves all captured events.
 *
 * @example
 * ```ts
 * const captured = captureEvents(monitor, "priceUpdate");
 * await monitor.poll();
 * expect(captured()).toHaveLength(1);
 * ```
 */
export function captureEvents<T = unknown>(
  emitter: EventEmitter,
  eventName: string,
): () => CapturedEvent<T>[] {
  const events: CapturedEvent<T>[] = [];

  emitter.on(eventName, (...args: unknown[]) => {
    events.push({
      name: eventName,
      args: (args.length === 1 ? args[0] : args) as T,
      timestamp: Date.now(),
    });
  });

  return () => events;
}

/**
 * Wait for a specific event to be emitted, with timeout.
 *
 * @example
 * ```ts
 * const promise = waitForEvent(detector, "opportunityFound", 5000);
 * monitor.emitOpportunity(delta);
 * const opportunity = await promise;
 * ```
 */
export function waitForEvent<T = unknown>(
  emitter: EventEmitter,
  eventName: string,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event "${eventName}" after ${timeoutMs}ms`));
    }, timeoutMs);

    emitter.once(eventName, (...args: unknown[]) => {
      clearTimeout(timer);
      resolve((args.length === 1 ? args[0] : args) as T);
    });
  });
}

/**
 * Wait for N events to be emitted, with timeout.
 *
 * @example
 * ```ts
 * const promise = waitForEvents(monitor, "priceUpdate", 3);
 * await monitor.poll(); // triggers 3 pool updates
 * const updates = await promise;
 * expect(updates).toHaveLength(3);
 * ```
 */
export function waitForEvents<T = unknown>(
  emitter: EventEmitter,
  eventName: string,
  count: number,
  timeoutMs = 5000,
): Promise<T[]> {
  return new Promise<T[]>((resolve, reject) => {
    const collected: T[] = [];

    const timer = setTimeout(() => {
      reject(
        new Error(
          `Timeout: received ${collected.length}/${count} "${eventName}" events after ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);

    const handler = (...args: unknown[]) => {
      collected.push((args.length === 1 ? args[0] : args) as T);
      if (collected.length >= count) {
        clearTimeout(timer);
        emitter.off(eventName, handler);
        resolve(collected);
      }
    };

    emitter.on(eventName, handler);
  });
}

/**
 * Assert that an event is NOT emitted within a given window.
 *
 * @example
 * ```ts
 * await assertNoEvent(detector, "opportunityFound", async () => {
 *   monitor.emitOpportunity(unprofitableDelta);
 * });
 * ```
 */
export async function assertNoEvent(
  emitter: EventEmitter,
  eventName: string,
  action: () => Promise<void> | void,
  windowMs = 100,
): Promise<void> {
  let emitted = false;

  const handler = () => {
    emitted = true;
  };
  emitter.on(eventName, handler);

  await action();
  await new Promise((r) => setTimeout(r, windowMs));

  emitter.off(eventName, handler);

  if (emitted) {
    throw new Error(`Expected "${eventName}" to NOT be emitted, but it was`);
  }
}
