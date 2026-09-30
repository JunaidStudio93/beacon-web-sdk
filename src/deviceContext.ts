/// Device/app context resolved once at init and attached to every event.
///
/// Country is intentionally omitted; the Beacon backend sets
/// `properties.country` from the request IP on `/track`.
export interface DeviceContext {
  readonly platform: string;
  readonly appVersion: string;
  readonly buildNumber: string;
  readonly timezone: string;
}

/// Wire keys are snake_case: `platform`, `app_version`, `build_number`.
export function deviceContextToMap(
  context: DeviceContext,
): Record<string, unknown> {
  return {
    platform: context.platform,
    app_version: context.appVersion,
    build_number: context.buildNumber,
    timezone: context.timezone,
  };
}
