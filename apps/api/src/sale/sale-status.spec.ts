import { computeStatus } from './sale-status';

describe('computeStatus', () => {
  const window = { startsAt: 1_000, endsAt: 2_000 };

  it('is upcoming before the start', () => {
    expect(computeStatus(window, 10, 999)).toBe('upcoming');
  });

  it('is active at the exact start instant', () => {
    expect(computeStatus(window, 10, 1_000)).toBe('active');
  });

  it('is active between start and end with stock left', () => {
    expect(computeStatus(window, 1, 1_500)).toBe('active');
  });

  it('is sold out between start and end with no stock', () => {
    expect(computeStatus(window, 0, 1_500)).toBe('sold_out');
  });

  it('is active one millisecond before the end', () => {
    expect(computeStatus(window, 10, 1_999)).toBe('active');
  });

  it('is ended at the exact end instant', () => {
    expect(computeStatus(window, 10, 2_000)).toBe('ended');
  });

  it('is ended, not sold out, after the end with no stock', () => {
    expect(computeStatus(window, 0, 5_000)).toBe('ended');
  });
});
