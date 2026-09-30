# Beacon Web SDK — Integration Guide

Event tracking for the website and for cloud functions. One package, no runtime
dependencies, same `/track` format as the Flutter and React Native SDKs.

---

## 1. Requirements

| Where | Needs |
| --- | --- |
| Website | Any modern browser. No polyfills. |
| Cloud function | **Node 18 or newer**, for built-in `fetch`. |
| Both | A Beacon API key and base URL, from the backend owner. |

Zero runtime dependencies — built-in `fetch`, `crypto` and `Intl` only.

## 2. Install

```sh
npm install git+https://github.com/JunaidStudio93/beacon-web-sdk.git
```

TypeScript, compiled on install by the `prepare` script, so a git dependency
needs no extra build step. Ships ESM, CommonJS and its own type definitions.

Pin a version with a tag or commit: `...beacon-web-sdk.git#v0.0.1`. To update
later, re-run the same command — npm pins the commit in the lockfile and will
not pick up new ones on its own.

## 3. Use it

### Website

```ts
import { Beacon } from 'beacon-web-sdk';

await Beacon.initialize({
  apiKey: process.env.NEXT_PUBLIC_BEACON_API_KEY!,
  baseUrl: process.env.NEXT_PUBLIC_BEACON_BASE_URL!,
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
});

await Beacon.instance.push({
  eventName: 'screen_view',
  funnel: 'onboarding',
  type: 'navigation',
  value: 'home',
  uid: user.id,       // omit for 'anonymous'
  email: user.email,  // omit for 'anonymous'
});
```

Do not block rendering on `initialize`.

### Cloud function

Build a client **per invocation** and flush before returning. Use
`BeaconClient`, not the `Beacon` singleton — concurrent invocations sharing one
instance would share a session and a queue.

```ts
import { BeaconClient } from 'beacon-web-sdk';

export async function handler(req, res) {
  const beacon = new BeaconClient({
    apiKey: process.env.BEACON_API_KEY!,
    baseUrl: process.env.BEACON_BASE_URL!,
    sessionToken: req.headers['x-session-token'], // the caller's session
  });

  await beacon.push({
    eventName: 'order_created',
    funnel: 'checkout',
    type: 'server',
    uid: req.body.userId,
  });

  await beacon.dispose(); // flushes, then releases
  res.status(200).end();
}
```

## 4. What differs between the two

Detected automatically; nothing to configure.

| | Browser | Cloud function |
| --- | --- | --- |
| Queue | `localStorage`, survives reloads | in-memory only |
| Batching | 10 events | **never batches** |
| On page hide | flushes with `keepalive` | n/a |
| Session token | generated | caller can supply it |
| `platform` | `web` | `server` |

A serverless process can be frozen the moment its handler resolves, so anything
left queued is lost. A `batchSize` passed on a server is ignored, with a warning.

## 5. Options

| Option | Default | Notes |
| --- | --- | --- |
| `apiKey` | required | `x-api-key` header |
| `baseUrl` | required | `/track` is appended |
| `batchSize` | 10 | Browser only; ignored on a server |
| `platform` | `web` / `server` | Sent as `platform` |
| `appVersion` | empty | Sent as `app_version` |
| `buildNumber` | empty | Sent as `build_number` |
| `timezone` | from `Intl` | Sent as `timezone` |
| `sessionToken` | generated | Reuse an existing session |
| `autoFlushOnHide` | `true` | Browser only |
| `storage` | localStorage / memory | Implement `BeaconStorage` to swap |
| `fetchFn` | global `fetch` | For tests |
| `runtime` | auto-detected | `'browser'` or `'server'` |

Any value passed wins; omitted or blank values fall back to the resolved one.
`appVersion` and `buildNumber` cannot be detected on the web — pass them from
your build config or they stay empty.

**Methods:** `push(...)`, `flush()`, `refresh()`, `dispose()`, and a
`sessionToken` getter.

## 6. What gets sent

`POST {baseUrl}/track` with `x-api-key`. Success is HTTP **202**; any other
status keeps events queued for the next attempt.

```json
{
  "events": [
    {
      "eventName": "screen_view",
      "uid": "u_123",
      "funnel": "onboarding",
      "sessionToken": "76e08819-c81a-4eb0-9d42-90205be4496e",
      "timestamp": "2026-09-30T08:42:04.000Z",
      "email": "a@b.com",
      "properties": {
        "type": "navigation",
        "value": "home",
        "platform": "web",
        "app_version": "3.1.0",
        "build_number": "904",
        "timezone": "Asia/Karachi"
      }
    }
  ]
}
```

`country` is added by the backend from the request IP.

`eventName` and `funnel` are sanitized to 40 characters of `[a-zA-Z0-9_]`
starting with a letter, so `sign-up!` is sent as `sign_up_`.

Custom `properties` merge last, so keys named `type`, `value`, `platform`,
`app_version`, `build_number` or `timezone` overwrite the SDK's own. Treat
those six as reserved.

## 7. Check it works

- [ ] Website: fire 10 events, see exactly one `POST /track`
- [ ] Cloud function: fire 1 event, see one request immediately
- [ ] Request carries `x-api-key` and hits `{baseUrl}/track`
- [ ] Server responds 202
- [ ] Website: queue a few events, reload — they upload rather than vanish
- [ ] Website: close the tab with events pending — the request still goes out
- [ ] `properties` shows the right `platform`, `app_version`, `timezone`

## 8. Troubleshooting

| Symptom | Cause |
| --- | --- |
| Events never upload | The server is not returning exactly 202 |
| `app_version` empty | Not passed to `initialize`; it cannot be detected |
| `fetch is not defined` | Node older than 18 |
| Events lost from a function | Handler returned before `dispose()` resolved |
| Server events share a session | Singleton reused; use `new BeaconClient(...)` per invocation |
| Nothing persists in the browser | Private mode or blocked storage; falls back to memory |

## 9. Known limits

1. **The browser queue is capped at 500 events**, oldest dropped. `localStorage`
   is a few MB per origin and throws when full, which would surface inside the
   site. The mobile SDKs have no cap.
2. **A flush uploads the whole queue**, not one batch. After a long offline
   stretch that can make a very large request.
3. **Non-retryable errors retry forever.** A 400 or 401 is treated like a 503,
   so one malformed event can block the queue.
4. **No request timeout.** Do not `await` a push on a render-blocking path —
   use `void Beacon.instance.push({...})`.

## 10. Status

11 of 12 behaviours covered by tests; browser and server runtimes both
simulated. **Not yet run in a real browser or a deployed function** — the first
live event is the outstanding check.
