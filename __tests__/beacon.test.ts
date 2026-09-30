import { Beacon, BeaconClient } from '../src/beacon';
import { LocalStorageBeaconStorage } from '../src/storage/localStorage';
import { MemoryBeaconStorage } from '../src/storage/memory';
import { sanitizeName, sanitizeValue } from '../src/sanitize';

interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
  keepalive: boolean;
}

function mockClient(
  handler: (request: CapturedRequest) => number,
): typeof fetch {
  return (async (url: string, init: RequestInit & { keepalive?: boolean }) => {
    const status = handler({
      url,
      headers: init.headers as Record<string, string>,
      body: init.body as string,
      keepalive: init.keepalive === true,
    });
    return { status } as Response;
  }) as unknown as typeof fetch;
}

/// Minimal localStorage stand-in so browser behaviour is testable under Node.
class FakeStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

describe('sanitizeName', () => {
  test('replaces invalid characters and truncates', () => {
    expect(sanitizeName('  hello-world!  ')).toBe('hello_world_');
    expect(sanitizeName('123bad')).toBe('e_123bad');
    expect(sanitizeName('a'.repeat(50))).toBe('a'.repeat(40));
  });
});

describe('sanitizeValue', () => {
  test('handles null empty and long values', () => {
    expect(sanitizeValue(null)).toBe('');
    expect(sanitizeValue('x'.repeat(150))).toBe('x'.repeat(100));
  });
});

describe('server runtime', () => {
  test('never batches, even when a batchSize is passed', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    let postCount = 0;
    const fetchFn = mockClient(() => {
      postCount++;
      return 202;
    });

    const client = new BeaconClient({
      apiKey: 'k',
      baseUrl: 'https://example.com',
      batchSize: 50, // ignored on a server
      fetchFn,
      runtime: 'server',
    });

    await client.push({ eventName: 'a', funnel: 'f', type: 't' });
    await client.push({ eventName: 'b', funnel: 'f', type: 't' });
    await client.push({ eventName: 'c', funnel: 'f', type: 't' });

    expect(postCount).toBe(3);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('sends immediately with no batchSize given', async () => {
    let postCount = 0;
    const fetchFn = mockClient(() => {
      postCount++;
      return 202;
    });

    const client = new BeaconClient({
      apiKey: 'k',
      baseUrl: 'https://example.com',
      fetchFn,
      runtime: 'server',
    });

    await client.push({ eventName: 'signup', funnel: 'api', type: 'server' });
    expect(postCount).toBe(1);
  });

  test('platform defaults to server and never uses keepalive', async () => {
    let captured: CapturedRequest | undefined;
    const fetchFn = mockClient((r) => {
      captured = r;
      return 202;
    });

    const client = new BeaconClient({
      apiKey: 'k',
      baseUrl: 'https://example.com',
      fetchFn,
      runtime: 'server',
    });

    await client.push({ eventName: 'e', funnel: 'f', type: 't' });

    const body = JSON.parse(captured!.body) as {
      events: { properties: Record<string, unknown> }[];
    };
    expect(body.events[0].properties.platform).toBe('server');
    expect(captured!.keepalive).toBe(false);
  });

  test('accepts a caller-supplied session token', async () => {
    let captured: CapturedRequest | undefined;
    const fetchFn = mockClient((r) => {
      captured = r;
      return 202;
    });

    const client = new BeaconClient({
      apiKey: 'k',
      baseUrl: 'https://example.com',
      fetchFn,
      runtime: 'server',
      sessionToken: 'session-from-the-caller',
    });

    expect(client.sessionToken).toBe('session-from-the-caller');

    await client.push({ eventName: 'e', funnel: 'f', type: 't' });
    const body = JSON.parse(captured!.body) as {
      events: { sessionToken: string }[];
    };
    expect(body.events[0].sessionToken).toBe('session-from-the-caller');
  });

  test('concurrent clients keep separate sessions and queues', async () => {
    const seen: string[] = [];
    const fetchFn = mockClient((r) => {
      const body = JSON.parse(r.body) as { events: { uid: string }[] };
      seen.push(body.events[0].uid);
      return 202;
    });

    const a = new BeaconClient({
      apiKey: 'k',
      baseUrl: 'https://example.com',
      fetchFn,
      runtime: 'server',
    });
    const b = new BeaconClient({
      apiKey: 'k',
      baseUrl: 'https://example.com',
      fetchFn,
      runtime: 'server',
    });

    expect(a.sessionToken).not.toBe(b.sessionToken);

    await Promise.all([
      a.push({ eventName: 'e', funnel: 'f', type: 't', uid: 'user_a' }),
      b.push({ eventName: 'e', funnel: 'f', type: 't', uid: 'user_b' }),
    ]);

    expect(seen.sort()).toEqual(['user_a', 'user_b']);
  });
});

describe('browser runtime', () => {
  test('batches, persists to localStorage, and sends with keepalive', async () => {
    const store = new FakeStorage();
    let postCount = 0;
    let captured: CapturedRequest | undefined;
    const fetchFn = mockClient((r) => {
      postCount++;
      captured = r;
      return 202;
    });

    const storage = new LocalStorageBeaconStorage();
    (globalThis as { localStorage?: unknown }).localStorage = store;

    const client = new BeaconClient({
      apiKey: 'k',
      baseUrl: 'https://example.com',
      batchSize: 3,
      fetchFn,
      runtime: 'browser',
      storage,
      autoFlushOnHide: false,
    });

    await client.push({ eventName: 'one', funnel: 'f', type: 't' });
    await client.push({ eventName: 'two', funnel: 'f', type: 't' });
    expect(postCount).toBe(0);

    // Survives a "reload": a fresh storage object reads the same queue.
    expect(await new LocalStorageBeaconStorage().pendingCount()).toBe(2);

    await client.push({ eventName: 'three', funnel: 'f', type: 't' });
    expect(postCount).toBe(1);
    expect(captured!.keepalive).toBe(true);
    expect(await new LocalStorageBeaconStorage().pendingCount()).toBe(0);

    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  test('caps the queue instead of overflowing storage', async () => {
    (globalThis as { localStorage?: unknown }).localStorage = new FakeStorage();
    const storage = new LocalStorageBeaconStorage({ maxEvents: 5 });

    for (let i = 0; i < 12; i++) {
      await storage.insertEvent({
        eventName: `e${i}`,
        uid: 'u',
        funnel: 'f',
        sessionToken: 's',
        timestamp: new Date().toISOString(),
        email: 'e',
        properties: {},
      });
    }

    const rows = await storage.allPending();
    expect(rows).toHaveLength(5);
    // Oldest dropped, newest kept.
    expect(rows[rows.length - 1].event.eventName).toBe('e11');

    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});

describe('shared behaviour', () => {
  afterEach(async () => {
    if (Beacon.isInitialized) await Beacon.dispose();
  });

  test('app-supplied context wins and is sent snake_case', async () => {
    let captured: CapturedRequest | undefined;
    const fetchFn = mockClient((r) => {
      captured = r;
      return 202;
    });

    await Beacon.initialize({
      apiKey: 'k',
      baseUrl: 'https://example.com',
      batchSize: 1,
      fetchFn,
      runtime: 'server',
      storage: new MemoryBeaconStorage(),
      platform: 'web',
      appVersion: '3.1.0',
      buildNumber: '904',
      timezone: 'Asia/Karachi',
    });

    await Beacon.instance.push({ eventName: 'e', funnel: 'f', type: 't' });

    const props = (
      JSON.parse(captured!.body) as {
        events: { properties: Record<string, unknown> }[];
      }
    ).events[0].properties;

    expect(props.platform).toBe('web');
    expect(props.app_version).toBe('3.1.0');
    expect(props.build_number).toBe('904');
    expect(props.timezone).toBe('Asia/Karachi');
  });

  test('keeps events when the upload is not 202', async () => {
    let postCount = 0;
    const fetchFn = mockClient(() => {
      postCount++;
      return 500;
    });

    const storage = new MemoryBeaconStorage();
    const client = new BeaconClient({
      apiKey: 'k',
      baseUrl: 'https://example.com',
      batchSize: 1,
      fetchFn,
      runtime: 'server',
      storage,
    });

    await client.push({ eventName: 'fail', funnel: 'f', type: 't' });
    expect(postCount).toBe(1);
    expect(await storage.pendingCount()).toBe(1);

    await client.flush();
    expect(postCount).toBe(2);
  });

  test('refresh uploads pending events and rotates the session', async () => {
    const batches: { sessionToken: string }[][] = [];
    const fetchFn = mockClient((r) => {
      batches.push(
        (JSON.parse(r.body) as { events: { sessionToken: string }[] }).events,
      );
      return 202;
    });

    const client = new BeaconClient({
      apiKey: 'k',
      baseUrl: 'https://example.com',
      batchSize: 100,
      fetchFn,
      runtime: 'server',
      storage: new MemoryBeaconStorage(),
    });

    const first = client.sessionToken;
    await client.push({ eventName: 'a', funnel: 'f', type: 't' });
    await client.refresh();

    expect(batches[0][0].sessionToken).toBe(first);
    expect(client.sessionToken).not.toBe(first);
  });
});
