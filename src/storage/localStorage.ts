import { BeaconEvent } from '../eventModel';
import { uuidV4 } from '../uuid';
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
      const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
      const nextId = parsed.nextId ?? 1;
      return { nextId, rows: this.backfillEventIds(rows, nextId) };
    } catch (_) {
      // Corrupt or unreadable: start clean rather than throw into the app.
      return { nextId: 1, rows: [] };
    }
  }

  /// Gives an id to rows written by an SDK version that predates `eventId`.
  ///
  /// The id is minted on this read and written back, so the row keeps it
  /// across retries. It cannot be matched against a copy delivered before the
  /// upgrade, since that copy carried no id at all — a one-time residual
  /// limited to whatever was in the queue when the page picked up the new SDK.
  private backfillEventIds(rows: StoredEvent[], nextId: number): StoredEvent[] {
    let changed = false;
    const filled = rows.map((row) => {
      if (row.event?.eventId) return row;
      changed = true;
      return { ...row, event: { ...row.event, eventId: uuidV4() } };
    });

    if (changed) {
      try {
        localStorage.setItem(this.key, JSON.stringify({ nextId, rows: filled }));
      } catch (_) {
        // Could not persist the backfill; the ids are still used for this
        // upload, and the next read mints fresh ones.
      }
    }

    return filled;
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
