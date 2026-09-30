import { BeaconEvent } from '../eventModel';
import { BeaconStorage, StoredEvent } from './types';

const DEFAULT_KEY = 'beacon_events';

/// Browser queue backed by `localStorage`, so events survive a reload or a
/// tab closing mid-batch.
///
/// Unlike the mobile SDKs, this queue is capped: `localStorage` is a few MB
/// per origin and throws once full, which would surface inside the host app.
/// At the cap the oldest events are dropped.
export class LocalStorageBeaconStorage implements BeaconStorage {
  private readonly key: string;
  private readonly maxEvents: number;

  constructor(options: { key?: string; maxEvents?: number } = {}) {
    this.key = options.key ?? DEFAULT_KEY;
    this.maxEvents = options.maxEvents ?? 500;
  }

  private read(): { nextId: number; rows: StoredEvent[] } {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return { nextId: 1, rows: [] };
      const parsed = JSON.parse(raw) as { nextId?: number; rows?: StoredEvent[] };
      return {
        nextId: parsed.nextId ?? 1,
        rows: Array.isArray(parsed.rows) ? parsed.rows : [],
      };
    } catch (_) {
      // Corrupt or unreadable: start clean rather than throw into the app.
      return { nextId: 1, rows: [] };
    }
  }

  private write(state: { nextId: number; rows: StoredEvent[] }): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(state));
    } catch (_) {
      // Quota exceeded even after capping: drop the oldest half and retry
      // once. Losing old analytics beats throwing inside the host app.
      try {
        const half = Math.floor(state.rows.length / 2);
        localStorage.setItem(
          this.key,
          JSON.stringify({ nextId: state.nextId, rows: state.rows.slice(half) }),
        );
      } catch (_) {
        // Storage is unusable; events for this page view are lost.
      }
    }
  }

  async insertEvent(event: BeaconEvent): Promise<number> {
    const state = this.read();
    const id = state.nextId;
    state.rows.push({ id, event });
    state.nextId = id + 1;

    if (state.rows.length > this.maxEvents) {
      state.rows = state.rows.slice(state.rows.length - this.maxEvents);
    }

    this.write(state);
    return id;
  }

  async pendingCount(): Promise<number> {
    return this.read().rows.length;
  }

  async allPending(): Promise<StoredEvent[]> {
    return this.read().rows;
  }

  async deleteByIds(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const state = this.read();
    const removed = new Set(ids);
    state.rows = state.rows.filter((row) => !removed.has(row.id));
    this.write(state);
  }

  async close(): Promise<void> {
    // Nothing to close; the queue intentionally outlives the page.
  }
}
