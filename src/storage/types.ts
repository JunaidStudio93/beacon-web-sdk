import { BeaconEvent } from '../eventModel';

/// A queued event plus the id used to delete it once delivered.
export interface StoredEvent {
  readonly id: number;
  readonly event: BeaconEvent;
}

/// Storage contract for the pending-event queue. Injectable so apps can swap
/// the backend and tests can stay in memory.
export interface BeaconStorage {
  insertEvent(event: BeaconEvent): Promise<number>;
  pendingCount(): Promise<number>;
  allPending(): Promise<StoredEvent[]>;
  deleteByIds(ids: number[]): Promise<void>;
  close(): Promise<void>;
}
