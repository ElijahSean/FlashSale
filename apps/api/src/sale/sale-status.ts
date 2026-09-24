export type SaleStatus = 'upcoming' | 'active' | 'sold_out' | 'ended';

/**
 * What the page should show. Pure: the caller passes the time, so tests can hit exact boundaries.
 *
 * The window is half-open, [startsAt, endsAt): live from the start instant, over at the end
 * instant. The Lua gate (03) must use the same boundaries so the page and the gate agree.
 *
 * This is informational only (design rule 9). It uses the API's clock because it only drives
 * the UI. Whether a purchase is allowed is decided by the Lua script with Redis TIME.
 */
export function computeStatus(
  window: { startsAt: number; endsAt: number },
  stock: number,
  nowMs: number,
): SaleStatus {
  if (nowMs < window.startsAt) return 'upcoming';
  // Ended wins over sold out: after the end, "ended" is the more useful message.
  if (nowMs >= window.endsAt) return 'ended';
  return stock > 0 ? 'active' : 'sold_out';
}
