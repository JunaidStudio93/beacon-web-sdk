## 0.0.1

* Initial Beacon Web SDK: browser and server runtimes, `push` / `flush` /
  `refresh`, localStorage-backed browser queue with page-hide flushing, and
  per-invocation `BeaconClient` for cloud functions. Server runtimes never
  batch: every push is uploaded immediately.
