import type { EventName, EventPayload } from './types/events.js';

type EventHandler<K extends EventName> = (payload: EventPayload<K>) => void;

interface ListenerEntry {
  readonly event: EventName;
  readonly handler: EventHandler<EventName>;
  readonly once: boolean;
}

export class EventBus {
  private readonly listeners = new Map<EventName, ListenerEntry[]>();

  on<K extends EventName>(event: K, handler: EventHandler<K>): () => void {
    const entry: ListenerEntry = {
      event,
      handler: handler as EventHandler<EventName>,
      once: false,
    };
    this.addListener(event, entry);
    return () => this.removeListener(event, entry);
  }

  once<K extends EventName>(event: K, handler: EventHandler<K>): () => void {
    const entry: ListenerEntry = {
      event,
      handler: handler as EventHandler<EventName>,
      once: true,
    };
    this.addListener(event, entry);
    return () => this.removeListener(event, entry);
  }

  emit<K extends EventName>(event: K, payload: EventPayload<K>): void {
    const entries = this.listeners.get(event);
    if (!entries) return;

    const toRemove: ListenerEntry[] = [];
    for (const entry of entries) {
      entry.handler(payload as EventPayload<EventName>);
      if (entry.once) {
        toRemove.push(entry);
      }
    }

    for (const entry of toRemove) {
      this.removeListener(event, entry);
    }
  }

  removeAllListeners(event?: EventName): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  listenerCount(event: EventName): number {
    return this.listeners.get(event)?.length ?? 0;
  }

  private addListener(event: EventName, entry: ListenerEntry): void {
    const existing = this.listeners.get(event) ?? [];
    this.listeners.set(event, [...existing, entry]);
  }

  private removeListener(event: EventName, entry: ListenerEntry): void {
    const existing = this.listeners.get(event);
    if (!existing) return;
    const filtered = existing.filter((e) => e !== entry);
    if (filtered.length === 0) {
      this.listeners.delete(event);
    } else {
      this.listeners.set(event, filtered);
    }
  }
}
