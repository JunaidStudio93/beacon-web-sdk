## Unreleased

* Add `identify(deviceId, email)`: attaches a real email to a device's
  anonymous event history. Pages send their device id in the `email` field
  while signed out; this call asks the backend (`POST /identify`) to rewrite
  that history onto the real email once the visitor signs in. Flushes pending
  events first so none are stranded under the old identity. Failures are
  logged, not thrown.

## 0.0.1

* Initial Beacon Web SDK: browser and server runtimes, `push` / `flush` /
  `refresh`, localStorage-backed browser queue with page-hide flushing, and
  per-invocation `BeaconClient` for cloud functions. Server runtimes never
  batch: every push is uploaded immediately.
