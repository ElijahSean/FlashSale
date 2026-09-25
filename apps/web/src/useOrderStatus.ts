import { useCallback, useEffect, useRef, useState } from 'react';
import { getMyPurchase } from './api';

export type OrderStatus = 'reserved' | 'confirmed' | null;

export const ORDER_POLL_MS = 1_000;
// About 10 s in total. The worker normally saves an order well inside one second; past this the
// row stays "Reserved" without a spinner instead of polling forever.
export const ORDER_MAX_CHECKS = 10;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The signed-in user's order, from GET /api/purchases/me. There is no "check" button: the page
 * calls `track` after sign-in, after a buy, and after a buy whose outcome is unknown.
 *
 * `track` asks /me, and keeps asking once a second while the answer is "reserved", until it says
 * "confirmed" (the worker saved the order) or 10 checks have passed. When the answer is "no
 * purchase" or "confirmed", one call is all it makes.
 *
 * Every call gets a run number. Signing out or starting a newer check bumps the number, and an
 * older loop that wakes up with a stale number stops without touching the screen. Without this,
 * a slow answer for the previous user could show up after they signed out.
 */
export function useOrderStatus() {
  const [status, setStatus] = useState<OrderStatus>(null);
  const [watching, setWatching] = useState(false);
  const run = useRef(0);

  // Leaving the page cancels any loop still sleeping.
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

  /** Resolves to 'SESSION_EXPIRED' when /me answers 401, so the caller can sign the user out. */
  const track = useCallback(async (token: string, assumeReserved = false) => {
    const id = ++run.current;
    // After a 201 we already know the unit is reserved; show it before the first /me answer.
    if (assumeReserved) setStatus('reserved');
    setWatching(true);
    try {
      for (let check = 1; check <= ORDER_MAX_CHECKS; check++) {
        const answer = await getMyPurchase(token);
        if (id !== run.current) return;
        if (answer === 'SESSION_EXPIRED') return 'SESSION_EXPIRED' as const;
        if (answer !== 'UNKNOWN') {
          // Never assume reserved for someone the server says has no purchase.
          if (!answer.purchased) {
            setStatus(null);
            return;
          }
          setStatus(answer.status);
          if (answer.status === 'confirmed') return;
        }
        // Still reserved, or /me could not answer (503): wait and ask again.
        if (check < ORDER_MAX_CHECKS) await sleep(ORDER_POLL_MS);
        if (id !== run.current) return;
      }
    } finally {
      if (id === run.current) setWatching(false);
    }
  }, []);

  return { status, watching, track, reset };
}
