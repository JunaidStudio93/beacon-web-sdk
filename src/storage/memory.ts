import { BeaconEvent } from '../eventModel';
import { BeaconStorage, StoredEvent } from './types';

/// In-process queue. The default on server runtimes, where each invocation is
/// short-lived and nothing should outlive the process. Also used by tests.
export class MemoryBeaconStorage implements BeaconStorage {
  private rows: StoredEvent[] = [];
  private nextId = 1;

  async insertEvent(event: BeaconEvent): Promise<number> {
    const id = this.nextId++;
    this.rows.push({ id, event });
    return id;
  }

  async pendingCount(): Promise<number> {
    return this.rows.length;
  }

  async allPending(): Promise<StoredEvent[]> {
    return [...this.rows].sort((a, b) => a.id - b.id);
  }

  async deleteByIds(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const removed = new Set(ids);
    this.rows = this.rows.filter((row) => !removed.has(row.id));
  }

  async close(): Promise<void> {
    this.rows = [];
  }
}
