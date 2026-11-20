## Unreleased

* Add a unique `eventId` (UUID v4) to every event. It is generated when the
  event is created, stored in the queue alongside it, and sent as a top-level
  field on `/track`. An event that is re-sent — because the tab was closed or
  frozen before the `202` landed, so the row was never deleted — arrives with
  the id it was created with, letting the backend drop the duplicate.

  **Backend:** dedupe on `eventId`. Calling pages need no change; the id is
  minted inside `push()`.

  Events already in `localStorage` from an earlier SDK version are backfilled
  with an id on first read and written back, so they carry one and keep it
  across retries. Such an id cannot be matched against a copy delivered before
  the upgrade — a one-time residual limited to whatever was queued at that
  moment.

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
