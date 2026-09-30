import { DeviceContext } from './deviceContext';
import { detectRuntime, Runtime } from './runtime';

/// Values the app can supply instead of letting the SDK resolve them.
/// Anything omitted, empty or blank falls back to the resolved value.
export interface DeviceContextOverrides {
  platform?: string;
  appVersion?: string;
  buildNumber?: string;
  timezone?: string;
}

function provided(value?: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch (_) {
    return '';
  }
}

/// Resolves context once at init.
///
/// There is no reliable way to read an app version or build number from a web
/// page or a cloud function, so both default to empty — pass them from your
/// build config (for example `process.env.NEXT_PUBLIC_APP_VERSION`).
///
/// On a server runtime the timezone is the machine's, which is usually UTC and
/// says nothing about the user; pass the visitor's timezone if you have it.
export function resolveDeviceContext(
  overrides: DeviceContextOverrides = {},
  runtime: Runtime = detectRuntime(),
): DeviceContext {
  return {
    platform: provided(overrides.platform) ?? (runtime === 'browser' ? 'web' : 'server'),
    appVersion: provided(overrides.appVersion) ?? '',
    buildNumber: provided(overrides.buildNumber) ?? '',
    timezone: provided(overrides.timezone) ?? resolveTimezone(),
  };
}
