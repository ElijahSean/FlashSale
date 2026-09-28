import type { SaleStatus } from './api';

/**
 * How far the browser clock is off from the server clock, in ms (server minus browser).
 *
 * The server stamped `serverTime` somewhere during our request. We guess the middle of it.
 * If a laptop clock is 5 minutes off, the offset is about 5 minutes, and the countdown corrects it.
 *
 * Display only. The Lua script decides purchases with Redis's clock (rule 9),
 * so a wrong offset can never let anyone buy early.
 */
export function clockOffset(serverTimeIso: string, sentAtMs: number, receivedAtMs: number) {
  const midpoint = (sentAtMs + receivedAtMs) / 2;
  return Date.parse(serverTimeIso) - midpoint;
}

/** Whole seconds from "server now" until `targetMs`, never below 0. */
export function secondsUntil(targetMs: number, browserNowMs: number, offsetMs: number) {
  const serverNow = browserNowMs + offsetMs;
  // Round up, so 00:00:00 shows only when the time has really come.
  return Math.max(0, Math.ceil((targetMs - serverNow) / 1000));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 00:12:05, or 2d 04:10:05 if more than a day. */
export function formatCountdown(totalSeconds: number) {
  const days = Math.floor(totalSeconds / 86_400);
  const h = Math.floor((totalSeconds % 86_400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const clock = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

/** What the countdown shows: time to the start, then time to the end. */
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
