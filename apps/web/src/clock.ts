import type { SaleStatus } from './api';

/**
 * How far the browser clock is from the server clock, in ms (server minus browser).
 *
 * The server stamped `serverTime` somewhere between when we sent the request and when the answer
 * came back. The midpoint is the best guess for "when", so half the round trip is taken off.
 * A laptop clock that is 5 minutes off gives an offset of about 5 minutes, and every countdown
 * adds it back, so the page counts down to the real start and end.
 *
 * Display only. Whether a purchase is allowed is decided by the Lua script with Redis TIME
 * (design rule 9), so a wrong offset can never let anyone buy early.
 */
export function clockOffset(serverTimeIso: string, sentAtMs: number, receivedAtMs: number) {
  const midpoint = (sentAtMs + receivedAtMs) / 2;
  return Date.parse(serverTimeIso) - midpoint;
}

/** Whole seconds from "server now" until `targetMs`, never below 0. */
export function secondsUntil(targetMs: number, browserNowMs: number, offsetMs: number) {
  const serverNow = browserNowMs + offsetMs;
  // Rounded up so the display reaches 00:00:00 only when the moment has really come.
  return Math.max(0, Math.ceil((targetMs - serverNow) / 1000));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 00:12:05, or 2d 04:10:05 past a day (the demo sale runs for months). */
export function formatCountdown(totalSeconds: number) {
  const days = Math.floor(totalSeconds / 86_400);
  const h = Math.floor((totalSeconds % 86_400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const clock = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

/** Label and target for the status card, per the design: count to the start, then to the end. */
export function countdownFor(
  sale: { status: SaleStatus; startsAt: string; endsAt: string },
  browserNowMs: number,
  offsetMs: number,
) {
  if (sale.status === 'ended') return { label: 'Sale closed', text: formatCountdown(0) };
  const upcoming = sale.status === 'upcoming';
  const target = Date.parse(upcoming ? sale.startsAt : sale.endsAt);
  return {
    label: upcoming ? 'Starts in' : 'Ends in',
    text: formatCountdown(secondsUntil(target, browserNowMs, offsetMs)),
  };
}
