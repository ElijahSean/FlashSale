import { useEffect, useState } from 'react';
import { getSale, type Sale } from './api';

export const SALE_POLL_MS = 2_000;

/**
 * The sale, refreshed every 2 s, plus a 1 s tick for the countdown.
 *
 * The next refresh starts only after the last one finishes, so we never have two in flight.
 * If one fails, the last good data stays on screen and we try again. `failing` tells the page.
 */
export function useSale() {
  const [data, setData] = useState<{ sale: Sale; offsetMs: number } | null>(null);
  const [failing, setFailing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await getSale();
        if (stopped) return;
        setData(next);
        setFailing(false);
      } catch {
        if (stopped) return;
        setFailing(true);
      }
      timer = setTimeout(poll, SALE_POLL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  return { sale: data?.sale ?? null, offsetMs: data?.offsetMs ?? 0, now, failing };
}
