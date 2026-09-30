/// Event payload sent to the Beacon `/track` endpoint.
export interface BeaconEvent {
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
    eventName: event.eventName,
    uid: event.uid,
    funnel: event.funnel,
    sessionToken: event.sessionToken,
    timestamp: event.timestamp,
    email: event.email,
    properties: event.properties,
  };
}
