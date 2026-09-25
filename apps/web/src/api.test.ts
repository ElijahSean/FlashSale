import { afterEach, describe, expect, it, vi } from 'vitest';
import { buy, demoLogin, getMyPurchase, getSale } from './api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function stubFetch(answer: () => Response | Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(async () => answer());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('buy', () => {
  it('sends the token and no body (identity comes from the token, rule 8)', async () => {
    const fetchMock = stubFetch(() => json(201, { result: 'SUCCESS' }));
    await buy('tok');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/purchases');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tok');
    expect(init?.body).toBeUndefined();
  });

  it.each([
    [201, 'SUCCESS'],
    [409, 'ALREADY_PURCHASED'],
    [410, 'SOLD_OUT'],
    [403, 'NOT_STARTED'],
    [403, 'ENDED'],
  ])('reads the gate result from the body (%i %s)', async (status, result) => {
    stubFetch(() => json(status, { statusCode: status, result, message: 'x' }));
    expect(await buy('tok')).toBe(result);
  });

  it.each([
    [401, 'SESSION_EXPIRED'],
    [429, 'RATE_LIMITED'],
    [503, 'UNAVAILABLE'],
  ])('maps HTTP %i to %s', async (status, outcome) => {
    stubFetch(() => json(status, { statusCode: status, message: 'x' }));
    expect(await buy('tok')).toBe(outcome);
  });

  it('treats a non-JSON error page (a proxy 502) as try again', async () => {
    stubFetch(() => new Response('<html>Bad Gateway</html>', { status: 502 }));
    expect(await buy('tok')).toBe('UNAVAILABLE');
  });

  it('reports NETWORK, not failure, when the request never gets an answer', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await buy('tok')).toBe('NETWORK');
  });
});

describe('getMyPurchase', () => {
  it('returns the answer, SESSION_EXPIRED on 401, UNKNOWN otherwise', async () => {
    stubFetch(() => json(200, { purchased: true, status: 'reserved' }));
    expect(await getMyPurchase('tok')).toEqual({ purchased: true, status: 'reserved' });
    stubFetch(() => json(401, {}));
    expect(await getMyPurchase('tok')).toBe('SESSION_EXPIRED');
    stubFetch(() => json(503, {}));
    expect(await getMyPurchase('tok')).toBe('UNKNOWN');
    stubFetch(() => Promise.reject(new TypeError('offline')));
    expect(await getMyPurchase('tok')).toBe('UNKNOWN');
  });
});

describe('demoLogin', () => {
  it('returns the token and the API-normalized userId', async () => {
    const fetchMock = stubFetch(() => json(200, { accessToken: 'tok', userId: 'eli@x.com' }));
    expect(await demoLogin(' Eli@X.com ')).toEqual({
      ok: true,
      accessToken: 'tok',
      userId: 'eli@x.com',
    });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/demo-login');
  });

  it.each([
    [400, 'INVALID'],
    [429, 'RATE_LIMITED'],
    [503, 'UNAVAILABLE'],
  ])('maps HTTP %i to %s', async (status, reason) => {
    stubFetch(() => json(status, {}));
    expect(await demoLogin('eli')).toEqual({ ok: false, reason });
  });
});

describe('getSale', () => {
  it('returns the sale and the clock offset measured on this request', async () => {
    vi.useFakeTimers();
    const browserNow = Date.parse('2026-10-01T10:05:00Z'); // 5 min fast
    vi.setSystemTime(browserNow);
    stubFetch(() => json(200, { serverTime: '2026-10-01T10:00:00.000Z' }));
    const { offsetMs } = await getSale();
    expect(offsetMs).toBe(-5 * 60_000);
    vi.useRealTimers();
  });

  it('throws on an error answer so the page keeps its last good data', async () => {
    stubFetch(() => json(503, {}));
    await expect(getSale()).rejects.toThrow('503');
  });
});
