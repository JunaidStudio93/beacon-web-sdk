/// Where the SDK is running. Browsers persist their queue and can resolve a
/// timezone from `Intl`; server runtimes (cloud functions) do neither.
export type Runtime = 'browser' | 'server';

export function detectRuntime(): Runtime {
  const hasWindow = typeof window !== 'undefined';
  const hasDocument = typeof document !== 'undefined';
  return hasWindow && hasDocument ? 'browser' : 'server';
}

export function hasLocalStorage(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const probe = '__beacon_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch (_) {
    // Private mode, blocked cookies, or a sandboxed iframe.
    return false;
  }
}
