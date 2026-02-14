import type { EventEmitter } from "node:events";

/**
 * Collects events from one or more EventEmitters for test assertions.
 * Automatically cleans up listeners on dispose.
 */
export class EventCollector {
  private collected = new Map<string, unknown[]>();
  private cleanups: Array<() => void> = [];

  /** Start collecting events of a given name from an emitter */
  collect<T>(emitter: EventEmitter, eventName: string): T[] {
    const events: T[] = [];
    this.collected.set(this.key(emitter, eventName), events);

    const handler = (...args: unknown[]) => {
      events.push(args.length === 1 ? (args[0] as T) : (args as unknown as T));
    };

    emitter.on(eventName, handler);
    this.cleanups.push(() => emitter.off(eventName, handler));
    return events;
  }

  /** Wait for N events of a given type, with timeout */
  async waitFor<T>(
    emitter: EventEmitter,
    eventName: string,
    count: number,
    timeoutMs = 5000,
  ): Promise<T[]> {
    const events: T[] = [];

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `Timeout waiting for ${count} "${eventName}" events (got ${events.length})`,
          ),
        );
      }, timeoutMs);

      const handler = (...args: unknown[]) => {
        events.push(args.length === 1 ? (args[0] as T) : (args as unknown as T));
        if (events.length >= count) {
          cleanup();
          resolve(events);
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        emitter.off(eventName, handler);
      };

      emitter.on(eventName, handler);
      this.cleanups.push(cleanup);
    });
  }

  /** Get all collected events for an emitter+event pair */
  get(emitter: EventEmitter, eventName: string): unknown[] {
    return this.collected.get(this.key(emitter, eventName)) ?? [];
  }

  /** Clean up all listeners */
  dispose(): void {
    for (const cleanup of this.cleanups) {
      cleanup();
    }
    this.cleanups = [];
    this.collected.clear();
  }

  private key(emitter: EventEmitter, eventName: string): string {
    // Use object identity via a WeakMap-like approach
    return `${(emitter as any).__testId ?? "unknown"}_${eventName}`;
  }
}
