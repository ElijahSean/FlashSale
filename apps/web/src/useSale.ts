import { useEffect, useState } from 'react';
import { getSale, type Sale } from './api';

export const SALE_POLL_MS = 2_000;

/**
 * The sale, refreshed every 2 s, plus a clock that ticks every second for the countdown.
 *
 * The next poll is scheduled only after the previous one finishes, so a slow API never has two
 * of our requests in flight. A failed poll keeps the last good data on screen (quietly, no
 * spinner) and just tries again; `failing` lets the page say so.
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
