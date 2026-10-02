import { uuidV4 } from './uuid';

/// Runtime Beacon configuration and session state.
export class BeaconConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly batchSize: number;

  /// Mutable: `refresh()` starts a new session by replacing this.
  /// Events carry the token that was current when they were pushed.
  sessionToken: string;

  constructor(params: {
    apiKey: string;
    baseUrl: string;
    batchSize: number;
    sessionToken: string;
  }) {
    this.apiKey = params.apiKey;
    this.baseUrl = params.baseUrl;
    this.batchSize = params.batchSize;
    this.sessionToken = params.sessionToken;
  }

  /// Starts a new session. Events already queued keep the previous token.
  regenerateSession(): void {
    this.sessionToken = uuidV4();
  }

  private get origin(): string {
    return this.baseUrl.endsWith('/')
      ? this.baseUrl.slice(0, this.baseUrl.length - 1)
      : this.baseUrl;
  }

  get trackUrl(): string {
    return `${this.origin}/track`;
  }

  get identifyUrl(): string {
    return `${this.origin}/identify`;
  }
}
