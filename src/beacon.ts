import { BeaconConfig } from './beaconConfig';
import { DeviceContext, deviceContextToMap } from './deviceContext';
import {
  DeviceContextOverrides,
  resolveDeviceContext,
} from './deviceContextResolver';
import { BeaconEvent } from './eventModel';
import { detectRuntime, hasLocalStorage, Runtime } from './runtime';
import { sanitizeName, sanitizeValue } from './sanitize';
import { LocalStorageBeaconStorage } from './storage/localStorage';
import { MemoryBeaconStorage } from './storage/memory';
import { BeaconStorage } from './storage/types';
import { BeaconUploader } from './uploader';
import { uuidV4 } from './uuid';

export interface BeaconOptions {
  apiKey: string;
  baseUrl: string;

  /// Flush threshold. Defaults to 10 in a browser and 1 on a server, where a
  /// process can end at any moment and nothing should sit queued.
  batchSize?: number;

  /// App-supplied context. Each value wins over what the SDK would resolve.
  platform?: string;
  appVersion?: string;
  buildNumber?: string;
  timezone?: string;

  /// Reuse an existing session instead of minting one. Useful on a server,
  /// where the session belongs to the caller, not the process.
  sessionToken?: string;

  /// Flush on `pagehide` / `visibilitychange`. Browser only, on by default.
  autoFlushOnHide?: boolean;

  storage?: BeaconStorage;
  deviceContext?: DeviceContext;
  fetchFn?: typeof fetch;
  runtime?: Runtime;
}

export interface BeaconPushOptions {
  eventName: string;
  funnel: string;
  type: string;
  value?: string | null;
  uid?: string;
  email?: string;
  properties?: Record<string, unknown>;
  immediate?: boolean;
}

/// An independent Beacon client.
///
/// Browsers normally use the `Beacon` singleton. Server runtimes should build
/// a client per request instead, so concurrent invocations never share a
/// session or a queue.
export class BeaconClient {
  private readonly config: BeaconConfig;
  private readonly storage: BeaconStorage;
  private readonly deviceContext: DeviceContext;
  private readonly uploader: BeaconUploader;
  private readonly runtime: Runtime;
  private detachHideListener?: () => void;

  /// Mutex so concurrent push/flush calls do not double-send the same rows.
  private flushLock: Promise<void> = Promise.resolve();

  constructor(options: BeaconOptions) {
    const { apiKey, baseUrl } = options;

    if (apiKey.trim().length === 0) {
      throw new Error('apiKey must not be empty');
    }
    if (baseUrl.trim().length === 0) {
      throw new Error('baseUrl must not be empty');
    }

    this.runtime = options.runtime ?? detectRuntime();

    const batchSize = options.batchSize ?? (this.runtime === 'browser' ? 10 : 1);
    if (batchSize < 1) {
      throw new Error('batchSize must be >= 1');
    }

    this.config = new BeaconConfig({
      apiKey,
      baseUrl: baseUrl.trim(),
      batchSize,
      sessionToken: options.sessionToken?.trim() || uuidV4(),
    });

    this.storage =
      options.storage ??
      (this.runtime === 'browser' && hasLocalStorage()
        ? new LocalStorageBeaconStorage()
        : new MemoryBeaconStorage());

    const overrides: DeviceContextOverrides = {
      platform: options.platform,
      appVersion: options.appVersion,
      buildNumber: options.buildNumber,
      timezone: options.timezone,
    };
    this.deviceContext =
      options.deviceContext ?? resolveDeviceContext(overrides, this.runtime);

    this.uploader = new BeaconUploader({
      config: this.config,
      fetchFn: options.fetchFn,
      keepalive: this.runtime === 'browser',
    });

    if (this.runtime === 'browser' && (options.autoFlushOnHide ?? true)) {
      this.attachHideListener();
    }
  }

  /// The token attached to events pushed from now on. Changes on [refresh].
  get sessionToken(): string {
    return this.config.sessionToken;
  }

  /// Queues an event. When [immediate] is true, or the pending count reaches
  /// the batch size, flushes the queue to the API.
  async push(options: BeaconPushOptions): Promise<void> {
    const {
      eventName,
      funnel,
      type,
      value,
      uid = 'anonymous',
      email = 'anonymous',
      properties,
      immediate = false,
    } = options;

    const props: Record<string, unknown> = {
      type,
      value: sanitizeValue(value),
      ...deviceContextToMap(this.deviceContext),
      ...(properties ?? {}),
    };

    await this.storage.insertEvent({
      eventName: sanitizeName(eventName),
      funnel: sanitizeName(funnel),
      uid,
      email,
      sessionToken: this.config.sessionToken,
      timestamp: new Date().toISOString(),
      properties: props,
    });

    if (immediate) {
      await this.flush();
      return;
    }

    const count = await this.storage.pendingCount();
    if (count >= this.config.batchSize) {
      await this.flush();
    }
  }

  /// Uploads all pending events. On HTTP 202, deletes only the sent rows.
  flush(): Promise<void> {
    const previous = this.flushLock;
    const current = previous.then(() => this.flushInternal());
    this.flushLock = current.catch(() => {});
    return current;
  }

  /// Uploads everything pending, then starts a new session.
  ///
  /// Runs on the same lock as [flush], so no push or flush can interleave
  /// between the upload and the new token. Events queued before the call keep
  /// the previous token — including events the upload failed to deliver.
  refresh(): Promise<void> {
    const previous = this.flushLock;
    const current = previous.then(async () => {
      await this.flushInternal();
      this.config.regenerateSession();
    });
    this.flushLock = current.catch(() => {});
    return current;
  }

  private async flushInternal(): Promise<void> {
    const rows = await this.storage.allPending();
    if (rows.length === 0) return;

    const events: BeaconEvent[] = rows.map((row) => row.event);

    try {
      const accepted = await this.uploader.upload(events);
      if (accepted) {
        await this.storage.deleteByIds(rows.map((r) => r.id));
      } else {
        console.warn('Beacon: upload rejected (non-202); events kept for retry');
      }
    } catch (e) {
      console.warn('Beacon: upload failed; events kept for retry', e);
    }
  }

  private attachHideListener(): void {
    const onHide = () => {
      void this.flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide();
    };

    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);

    this.detachHideListener = () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }

  /// Flushes what is queued and releases listeners. On a server, call this (or
  /// `flush()`) before the invocation returns, or queued events are lost.
  async dispose(): Promise<void> {
    this.detachHideListener?.();
    this.detachHideListener = undefined;
    await this.flush();
    await this.storage.close();
  }
}

/// Process-wide singleton, for browsers and long-lived servers.
export class Beacon {
  private static _instance: BeaconClient | null = null;

  static get instance(): BeaconClient {
    const current = Beacon._instance;
    if (current === null) {
      throw new Error(
        'Beacon has not been initialized. Call Beacon.initialize() first.',
      );
    }
    return current;
  }

  static get isInitialized(): boolean {
    return Beacon._instance !== null;
  }

  /// Initializes the singleton, replacing any previous instance after
  /// flushing and closing it.
  static async initialize(options: BeaconOptions): Promise<BeaconClient> {
    const previous = Beacon._instance;
    if (previous !== null) {
      Beacon._instance = null;
      await previous.dispose();
    }

    const client = new BeaconClient(options);
    Beacon._instance = client;

    // Send anything a previous page view left behind.
    await client.flush();

    return client;
  }

  static async dispose(): Promise<void> {
    const current = Beacon._instance;
    Beacon._instance = null;
    if (current !== null) await current.dispose();
  }
}
