import { BeaconConfig } from './beaconConfig';
import { BeaconEvent, eventToJson } from './eventModel';

/// Posts batched events to the Beacon track endpoint.
export class BeaconUploader {
  private readonly config: BeaconConfig;
  private readonly fetchFn: typeof fetch;
  private readonly keepalive: boolean;

  constructor(params: {
    config: BeaconConfig;
    fetchFn?: typeof fetch;
    keepalive?: boolean;
  }) {
    this.config = params.config;
    this.fetchFn = params.fetchFn ?? fetch;
    this.keepalive = params.keepalive ?? false;
  }

  /// Returns `true` when the server accepts the batch (HTTP 202).
  ///
  /// In a browser the request is sent with `keepalive` so a flush started
  /// during page unload still completes. That flag caps the body at 64 KB,
  /// so oversized batches fall back to an ordinary request.
  async upload(events: BeaconEvent[]): Promise<boolean> {
    if (events.length === 0) return true;

    const body = JSON.stringify({ events: events.map(eventToJson) });
    const keepalive = this.keepalive && body.length <= 60000;

    const response = await this.fetchFn(this.config.trackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
      },
      body,
      ...(keepalive ? { keepalive: true } : {}),
    });

    return response.status === 202;
  }

  /// Asks the API to rewrite a device's anonymous history onto a real email.
  /// Returns `true` when the server accepts the request (HTTP 202).
  ///
  /// 202 means the backfill job was submitted, not that it has finished — the
  /// rewrite completes inside BigQuery a few seconds later.
  ///
  /// Sent without `keepalive`, unlike [upload]: this fires on sign-in, not on
  /// page unload, so it has no reason to spend that budget.
  async identify(deviceId: string, email: string): Promise<boolean> {
    const response = await this.fetchFn(this.config.identifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
      },
      body: JSON.stringify({ deviceId, email }),
    });

    return response.status === 202;
  }
}
