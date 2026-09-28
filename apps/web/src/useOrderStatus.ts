import { useCallback, useEffect, useRef, useState } from 'react';
import { getMyPurchase } from './api';

export type OrderStatus = 'reserved' | 'confirmed' | null;

export const ORDER_POLL_MS = 1_000;
// About 10 s. The worker usually saves an order in under a second. After this we stop asking.
export const ORDER_MAX_CHECKS = 10;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The user's order, from GET /api/purchases/me. The page calls `track` after sign-in and after a buy.
 *
 * `track` asks /me once a second while the answer is "reserved", until "confirmed"
 * (the worker saved it) or 10 tries. "No purchase" or "confirmed" needs just one call.
 *
 * Each call gets a run number. A newer call or signing out changes the number, and an older loop
 * with an old number stops. So a slow answer for a previous user never shows up.
 */
export function useOrderStatus() {
  const [status, setStatus] = useState<OrderStatus>(null);
  const [watching, setWatching] = useState(false);
  const run = useRef(0);

  // Leaving the page stops any waiting loop.
  useEffect(() => {
    const current = run;
    return () => {
      current.current++;
    };
  }, []);

  const reset = useCallback(() => {
    run.current++;
    setStatus(null);
    setWatching(false);
  }, []);

  /** Gives 'SESSION_EXPIRED' when /me says 401, so the page can sign the user out. */
  const track = useCallback(async (token: string, assumeReserved = false) => {
    const id = ++run.current;
    // After a 201 we know it's reserved. Show that before /me answers.
    if (assumeReserved) setStatus('reserved');
    setWatching(true);
    try {
      for (let check = 1; check <= ORDER_MAX_CHECKS; check++) {
        const answer = await getMyPurchase(token);
        if (id !== run.current) return;
        if (answer === 'SESSION_EXPIRED') return 'SESSION_EXPIRED' as const;
        if (answer !== 'UNKNOWN') {
          // The server says no purchase, so don't show "reserved".
          if (!answer.purchased) {
            setStatus(null);
            return;
          }
          setStatus(answer.status);
          if (answer.status === 'confirmed') return;
        }
        // Still reserved, or /me failed (503): wait and ask again.
        if (check < ORDER_MAX_CHECKS) await sleep(ORDER_POLL_MS);
        if (id !== run.current) return;
      }
    } finally {
      if (id === run.current) setWatching(false);
    }
  }, []);

  return { status, watching, track, reset };
}
