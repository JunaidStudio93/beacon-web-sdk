/// Beacon event tracking SDK for browsers and server runtimes.
export { Beacon, BeaconClient } from './beacon';
export type { BeaconOptions, BeaconPushOptions } from './beacon';
export { BeaconConfig } from './beaconConfig';
export type { DeviceContext } from './deviceContext';
export type { DeviceContextOverrides } from './deviceContextResolver';
export type { BeaconEvent } from './eventModel';
export type { Runtime } from './runtime';
export type { BeaconStorage, StoredEvent } from './storage/types';
export { MemoryBeaconStorage } from './storage/memory';
export { LocalStorageBeaconStorage } from './storage/localStorage';
