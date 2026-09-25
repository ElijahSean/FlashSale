import { describe, expect, it } from 'vitest';
import { clockOffset, countdownFor, formatCountdown, secondsUntil } from './clock';

const SERVER_NOW = Date.parse('2026-10-01T10:00:00Z');
const FIVE_MIN = 5 * 60_000;

describe('clockOffset', () => {
  it('is about zero when both clocks agree', () => {
    // Request took 200 ms; the server stamped the midpoint.
    expect(
      clockOffset(new Date(SERVER_NOW).toISOString(), SERVER_NOW - 100, SERVER_NOW + 100),
    ).toBe(0);
  });

  it('measures a browser clock that is 5 minutes fast', () => {
    const browserNow = SERVER_NOW + FIVE_MIN;
    const offset = clockOffset(
      new Date(SERVER_NOW).toISOString(),
      browserNow - 50,
      browserNow + 50,
    );
    expect(offset).toBe(-FIVE_MIN);
  });
});

describe('secondsUntil', () => {
  it('gives the same answer whatever the browser clock says, once the offset is applied', () => {
    const target = SERVER_NOW + 90_000; // 90 s from real server time
    for (const skew of [-FIVE_MIN, 0, FIVE_MIN]) {
      const browserNow = SERVER_NOW + skew;
      expect(secondsUntil(target, browserNow, -skew)).toBe(90);
    }
  });

  it('would be 5 minutes wrong without the offset (why the offset exists)', () => {
    expect(secondsUntil(SERVER_NOW + 90_000, SERVER_NOW - FIVE_MIN, 0)).toBe(390);
  });

  it('rounds up and never goes below zero', () => {
    expect(secondsUntil(SERVER_NOW + 1, SERVER_NOW, 0)).toBe(1);
    expect(secondsUntil(SERVER_NOW - 10_000, SERVER_NOW, 0)).toBe(0);
  });
});

describe('formatCountdown', () => {
  it('pads hours, minutes and seconds', () => {
    expect(formatCountdown(0)).toBe('00:00:00');
    expect(formatCountdown(3725)).toBe('01:02:05');
  });

  it('adds days past 24 hours', () => {
    expect(formatCountdown(2 * 86_400 + 4 * 3600 + 10 * 60 + 5)).toBe('2d 04:10:05');
  });
});

describe('countdownFor', () => {
  const sale = {
    startsAt: new Date(SERVER_NOW + 60_000).toISOString(),
    endsAt: new Date(SERVER_NOW + 3_600_000).toISOString(),
  };

  it('counts to the start while upcoming', () => {
    expect(countdownFor({ ...sale, status: 'upcoming' }, SERVER_NOW, 0)).toEqual({
      label: 'Starts in',
      text: '00:01:00',
    });
  });

  it('counts to the end while active or sold out', () => {
    for (const status of ['active', 'sold_out'] as const) {
      expect(countdownFor({ ...sale, status }, SERVER_NOW, 0)).toEqual({
        label: 'Ends in',
        text: '01:00:00',
      });
    }
  });

  it('shows zeros once ended', () => {
    expect(countdownFor({ ...sale, status: 'ended' }, SERVER_NOW, 0)).toEqual({
      label: 'Sale closed',
      text: '00:00:00',
    });
  });
});
