import { clockOffset } from './clock';

// Types copied from the API's answers. A copy is simpler than a shared package for four types.
export type SaleStatus = 'upcoming' | 'active' | 'sold_out' | 'ended';

export interface Sale {
  product: { name: string; price: string; imageUrl: string };
  status: SaleStatus;
  startsAt: string;
  endsAt: string;
  initialStock: number;
  stockRemaining: number;
  serverTime: string;
}

export type MyPurchase =
  { purchased: false } | { purchased: true; status: 'reserved' | 'confirmed' };

const PURCHASE_RESULTS = [
  'SUCCESS',
  'ALREADY_PURCHASED',
  'SOLD_OUT',
  'NOT_STARTED',
  'ENDED',
] as const;
type PurchaseResult = (typeof PURCHASE_RESULTS)[number];

/**
 * Every way a Buy click can end. The first five come from the Lua gate, the rest from the HTTP
 * status or the network. NETWORK means "we don't know if it reached the gate", so we ask /me.
 */
export type BuyOutcome =
  PurchaseResult | 'RATE_LIMITED' | 'UNAVAILABLE' | 'SESSION_EXPIRED' | 'NETWORK';

export type LoginAnswer =
  | { ok: true; accessToken: string; userId: string }
  | { ok: false; reason: 'INVALID' | 'RATE_LIMITED' | 'UNAVAILABLE' };

/** /me can also say "token expired" or "can't tell right now". */
export type MeAnswer = MyPurchase | 'SESSION_EXPIRED' | 'UNKNOWN';

// Empty means same origin: Vite forwards /api in dev, nginx does in Docker.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// A buy normally takes milliseconds. After this long, stop waiting and ask /me.
const TIMEOUT_MS = 10_000;

/** fetch with a timeout. Throws on network error or timeout; HTTP errors come back normally. */
function call(path: string, init: RequestInit & { token?: string } = {}) {
  const { token, ...rest } = init;
  const headers = new Headers(rest.headers);
  // Who you are is only in the token (rule 8). The body never has a userId.
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${BASE_URL}${path}`, { ...rest, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/** The sale, plus how far this browser's clock is off from the server's (see clock.ts). */
export async function getSale(): Promise<{ sale: Sale; offsetMs: number }> {
  const sentAt = Date.now();
  const res = await call('/api/sale');
  const receivedAt = Date.now();
  if (!res.ok) throw new Error(`GET /api/sale answered ${res.status}`);
  const sale = (await res.json()) as Sale;
  return { sale, offsetMs: clockOffset(sale.serverTime, sentAt, receivedAt) };
}

export async function demoLogin(userId: string): Promise<LoginAnswer> {
  let res: Response;
  try {
    res = await call('/api/auth/demo-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch {
    return { ok: false, reason: 'UNAVAILABLE' };
  }
  if (res.ok) {
    const body = (await res.json()) as { accessToken: string; userId: string };
    return { ok: true, ...body };
  }
  if (res.status === 400) return { ok: false, reason: 'INVALID' };
  if (res.status === 429) return { ok: false, reason: 'RATE_LIMITED' };
  return { ok: false, reason: 'UNAVAILABLE' };
}

export async function buy(token: string): Promise<BuyOutcome> {
  let res: Response;
  try {
    res = await call('/api/purchases', { method: 'POST', token });
  } catch {
    // Timed out or no connection. Not "failed": the gate may have said yes.
    return 'NETWORK';
  }
  if (res.status === 401) return 'SESSION_EXPIRED';
  if (res.status === 429) return 'RATE_LIMITED';

  // 201, 409, 410 and 403 include the gate's answer. We read `result`, because
  // NOT_STARTED and ENDED are both 403.
  const body = (await res.json().catch(() => null)) as { result?: string } | null;
  const result = PURCHASE_RESULTS.find((r) => r === body?.result);
  // Anything else (503, 500, a proxy error) means "please try again".
  return result ?? 'UNAVAILABLE';
}

export async function getMyPurchase(token: string): Promise<MeAnswer> {
  try {
    const res = await call('/api/purchases/me', { token });
    if (res.status === 401) return 'SESSION_EXPIRED';
    if (!res.ok) return 'UNKNOWN';
    return (await res.json()) as MyPurchase;
  } catch {
    return 'UNKNOWN';
  }
}
