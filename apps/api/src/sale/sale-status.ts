export type SaleStatus = 'upcoming' | 'active' | 'sold_out' | 'ended';

/**
 * What the page should show. The caller passes the time, so tests can check exact edges.
 *
 * Open from startsAt (included) until endsAt (not included), the same as the Lua gate.
 *
 * Display only (rule 9). It uses the API's clock because it only drives the page.
 * The Lua script decides real purchases with Redis TIME.
 */
export function computeStatus(
  window: { startsAt: number; endsAt: number },
  stock: number,
  nowMs: number,
): SaleStatus {
  if (nowMs < window.startsAt) return 'upcoming';
  // After the end, show "ended" even if sold out.
  if (nowMs >= window.endsAt) return 'ended';
  return stock > 0 ? 'active' : 'sold_out';
}
