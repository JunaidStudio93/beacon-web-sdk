/// Event payload sent to the Beacon `/track` endpoint.
export interface BeaconEvent {
  /// Stable per-event identifier, generated once when the event is created and
  /// persisted with it. A retried upload carries the same `eventId`, so the
  /// backend can drop the repeat instead of counting it twice.
  readonly eventId: string;
  readonly eventName: string;
  readonly uid: string;
  readonly funnel: string;
  readonly sessionToken: string;
  readonly timestamp: string;
  readonly email: string;
  readonly properties: Record<string, unknown>;
}

export function eventToJson(event: BeaconEvent): Record<string, unknown> {
  return {
    eventId: event.eventId,
    eventName: event.eventName,
    uid: event.uid,
    funnel: event.funnel,
    sessionToken: event.sessionToken,
    timestamp: event.timestamp,
    email: event.email,
    properties: event.properties,
  };
}
