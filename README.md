# Beacon Web SDK

Event tracking SDK for browsers and server runtimes (cloud functions, API
routes, workers). Same `/track` wire format as the Flutter and React Native
SDKs.

Zero runtime dependencies — uses built-in `fetch`, `crypto` and `Intl`.

## Install

```sh
npm install git+https://github.com/<org>/beacon-web-sdk.git
```

Requires Node 18+ on the server (for built-in `fetch`), any modern browser on
the client.

## Browser

```ts
import { Beacon } from 'beacon-web-sdk';

await Beacon.initialize({
  apiKey: 'bcn_live_sk_...',
  baseUrl: 'https://your-beacon-endpoint.example.com',
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
});

await Beacon.instance.push({
  eventName: 'screen_view',
  funnel: 'onboarding',
  type: 'navigation',
  value: 'home',
  uid: user.id,
  email: user.email,
});
```

In a browser the SDK:

- queues to `localStorage`, so events survive a reload or a tab closing
- batches at `batchSize` (default 10)
- flushes on `pagehide` / `visibilitychange`, using `fetch(..., {keepalive:true})`
  so the request survives the page going away
- reports `platform: "web"`

## Cloud function

Build a client **per invocation** and flush before returning. A serverless
process can be frozen or killed the moment your handler resolves, so anything
left queued is lost.

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

On a server the SDK:

- defaults `batchSize` to **1**, so every push is sent immediately
- keeps its queue in memory only, never touching `localStorage`
- reports `platform: "server"`
- accepts a `sessionToken` so the session belongs to the caller, not the process

Use `BeaconClient` rather than the `Beacon` singleton on a server: concurrent
invocations sharing one instance would share a session and a queue.

## API

`new BeaconClient(options)` / `Beacon.initialize(options)`

| Option | Default | Notes |
| --- | --- | --- |
| `apiKey` | required | `x-api-key` header |
| `baseUrl` | required | `/track` is appended |
| `batchSize` | 10 browser, 1 server | Flush threshold |
| `platform` | `web` / `server` | App value wins; sent as `platform` |
| `appVersion` | `''` | App value wins; sent as `app_version` |
| `buildNumber` | `''` | App value wins; sent as `build_number` |
| `timezone` | from `Intl` | App value wins; sent as `timezone` |
| `sessionToken` | generated | Reuse an existing session |
| `autoFlushOnHide` | `true` in browser | Flush on page hide |
| `storage` | localStorage / memory | Implement `BeaconStorage` to swap |
| `fetchFn` | global `fetch` | For tests |
| `runtime` | auto-detected | `'browser'` or `'server'` |

Methods: `push(...)`, `flush()`, `refresh()`, `dispose()`, and a `sessionToken`
getter.

There is no way to read an app version or build number from a web page or a
cloud function, so both default to empty — pass them from your build config.

## Behaviour

Identical to the mobile SDKs: persist first, batch, upload to
`POST {baseUrl}/track`, and delete only on HTTP **202**. Anything else keeps
events queued for the next attempt. `refresh()` uploads everything pending and
then starts a new session.

Sent properties: `type`, `value`, `platform`, `app_version`, `build_number`,
`timezone`, plus whatever the caller passes in `properties`. The backend adds
`country` from the request IP.

## Differences from the mobile SDKs

- **The browser queue is capped** (500 events, oldest dropped). `localStorage`
  is a few MB per origin and throws when full, which would surface inside the
  host app. The mobile SDKs have no cap.
- **`batchSize` defaults to 1 on a server**, where a queue cannot outlive the
  invocation.
