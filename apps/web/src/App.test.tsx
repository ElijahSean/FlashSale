import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sale } from './api';
import App from './App';
import { MESSAGES } from './messages';

const SERVER_NOW = Date.parse('2026-10-01T10:00:00Z');

function saleBody(overrides: Partial<Sale> = {}): Sale {
  return {
    product: { name: 'Test Sneaker', price: '$99.00', imageUrl: '/images/product.svg' },
    status: 'active',
    startsAt: new Date(SERVER_NOW - 60_000).toISOString(),
    endsAt: new Date(SERVER_NOW + 3_600_000).toISOString(),
    initialStock: 100,
    stockRemaining: 42,
    serverTime: new Date(SERVER_NOW).toISOString(),
    ...overrides,
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Answer = () => Response | Promise<Response>;

/**
 * A fake API behind fetch. Each route is a function the test can swap. `me` answers from a list,
 * one per call, repeating the last one, so a test can script "reserved, reserved, confirmed".
 */
function fakeApi() {
  const api = {
    sale: (() => json(200, saleBody())) as Answer,
    login: (() => json(200, { accessToken: 'tok', userId: 'eli@example.com' })) as Answer,
    buy: (() => json(201, { statusCode: 201, result: 'SUCCESS', message: '' })) as Answer,
    me: [{ purchased: false }] as unknown[],
    calls: { buy: 0, me: 0 },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/sale') return api.sale();
      if (url === '/api/auth/demo-login') return api.login();
      if (url === '/api/purchases' && init?.method === 'POST') {
        api.calls.buy++;
        return api.buy();
      }
      if (url === '/api/purchases/me') {
        const answer = api.me[Math.min(api.calls.me, api.me.length - 1)];
        api.calls.me++;
        return typeof answer === 'function' ? (answer as Answer)() : json(200, answer);
      }
      throw new Error(`unexpected ${url}`);
    }),
  );
  return api;
}

let api: ReturnType<typeof fakeApi>;
beforeEach(() => {
  api = fakeApi();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Never settles: holds a request "in flight" for as long as the test needs. */
const pending = () => new Promise<Response>(() => {});

async function signIn(user = userEvent.setup()) {
  render(<App />);
  await user.type(await screen.findByLabelText('Username or email'), 'eli@example.com');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('button', { name: /buy now|purchased|opens soon|sale ended|sold out/i });
  return user;
}

describe('first load', () => {
  it('shows skeleton blocks, not an empty page or a spinner, until the sale arrives', () => {
    api.sale = pending;
    render(<App />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('spinner')).toBeNull();
    // Reduced motion: the pulse is switched off by the motion-reduce variant.
    for (const pulsing of skeleton.querySelectorAll('.animate-pulse')) {
      expect(pulsing).toHaveClass('motion-reduce:animate-none');
    }
  });

  it('shows name, price and image from GET /api/sale', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Test Sneaker' })).toBeInTheDocument();
    expect(screen.getByText('$99.00')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Test Sneaker' })).toHaveAttribute(
      'src',
      '/images/product.svg',
    );
    expect(screen.getByText('42 of 100 left')).toBeInTheDocument();
  });
});

describe('status banner', () => {
  it.each([
    ['upcoming', 'Upcoming', 'Starts in'],
    ['active', 'Live now', 'Ends in'],
    ['sold_out', 'Sold out', 'Ends in'],
    ['ended', 'Ended', 'Sale closed'],
  ] as const)('%s shows "%s" and "%s"', async (status, label, countdownLabel) => {
    api.sale = () => json(200, saleBody({ status }));
    render(<App />);
    expect(await screen.findByText(label, { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(countdownLabel)).toBeInTheDocument();
  });

  it('counts down to the real end even when the browser clock is 5 minutes fast', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(SERVER_NOW + 5 * 60_000);
    render(<App />);
    // Sale ends 1 h after server time. Without the offset this would read 00:55:00.
    expect((await screen.findByTestId('countdown')).textContent).toMatch(/^(01:00:00|00:59:59)$/);
  });
});

describe('sign in', () => {
  it('shows a spinner and disables the button while pending', async () => {
    api.login = pending;
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('Username or email'), 'eli');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    const button = screen.getByRole('button', { name: 'Signing in…' });
    expect(button).toBeDisabled();
    expect(within(button).getByTestId('spinner')).toHaveClass('motion-reduce:animate-none');
  });

  it('asks for a name before calling the API', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a username or email.');
  });

  it('shows the userId the API normalized, with Sign out', async () => {
    await signIn();
    expect(screen.getAllByText('eli@example.com').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});

describe('buy button', () => {
  it('is not offered while signed out (the sign-in form is shown instead)', async () => {
    render(<App />);
    await screen.findByLabelText('Username or email');
    expect(screen.queryByRole('button', { name: /buy/i })).toBeNull();
  });

  it.each([
    ['upcoming', 'Opens soon'],
    ['ended', 'Sale ended'],
    ['sold_out', 'Sold out'],
  ] as const)('is disabled when the sale is %s ("%s")', async (status, label) => {
    api.sale = () => json(200, saleBody({ status, stockRemaining: status === 'sold_out' ? 0 : 5 }));
    await signIn();
    expect(screen.getByRole('button', { name: label })).toBeDisabled();
  });

  it('shows a spinner and is disabled while the buy is pending', async () => {
    api.buy = pending;
    const user = await signIn();
    await user.click(screen.getByRole('button', { name: 'Buy now' }));
    const button = screen.getByRole('button', { name: 'Buying…' });
    expect(button).toBeDisabled();
    expect(within(button).getByTestId('spinner')).toHaveClass('motion-reduce:animate-none');
  });

  it('sends one request on a double click', async () => {
    // Like the real API: once the buy succeeds, /me says reserved (the gate wrote sale:buyers).
    api.me = [{ purchased: false }, { purchased: true, status: 'reserved' }];
    const user = await signIn();
    await user.dblClick(screen.getByRole('button', { name: 'Buy now' }));
    await screen.findByText(MESSAGES.SUCCESS.title);
    expect(api.calls.buy).toBe(1);
  });

  it('sends one request even when both clicks land before the button redraws as disabled', async () => {
    api.buy = pending;
    await signIn();
    const button = screen.getByRole('button', { name: 'Buy now' });
    // Inside one act() React holds the redraw, so the second click still finds an enabled button.
    // Only the ref in App.handleBuy can stop it.
    act(() => {
      button.click();
      button.click();
    });
    expect(api.calls.buy).toBe(1);
  });
});

describe('outcome messages', () => {
  it.each([
    ['SUCCESS', () => json(201, { result: 'SUCCESS' })],
    ['ALREADY_PURCHASED', () => json(409, { result: 'ALREADY_PURCHASED' })],
    ['SOLD_OUT', () => json(410, { result: 'SOLD_OUT' })],
    ['NOT_STARTED', () => json(403, { result: 'NOT_STARTED' })],
    ['ENDED', () => json(403, { result: 'ENDED' })],
    ['RATE_LIMITED', () => json(429, { statusCode: 429 })],
    ['UNAVAILABLE', () => json(503, { statusCode: 503 })],
    ['NETWORK', () => Promise.reject(new TypeError('Failed to fetch'))],
  ] as const)('%s shows its own message', async (outcome, answer) => {
    api.buy = answer;
    const user = await signIn();
    await user.click(screen.getByRole('button', { name: 'Buy now' }));
    const result = await screen.findByTestId('result');
    expect(result).toHaveTextContent(MESSAGES[outcome].title);
    expect(result).toHaveTextContent(MESSAGES[outcome].body);
  });

  it('every outcome has a different title', () => {
    const titles = Object.values(MESSAGES).map((m) => m.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('401 shows "Session expired" and returns to sign-in', async () => {
    api.buy = () => json(401, { statusCode: 401 });
    const user = await signIn();
    await user.click(screen.getByRole('button', { name: 'Buy now' }));
    expect(await screen.findByText(MESSAGES.SESSION_EXPIRED.title)).toBeInTheDocument();
    expect(screen.getByLabelText('Username or email')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('after a 503 it asks /me once, so a unit that was reserved anyway still shows', async () => {
    api.buy = () => json(503, { statusCode: 503 });
    api.me = [{ purchased: false }, { purchased: true, status: 'confirmed' }];
    const user = await signIn();
    await user.click(screen.getByRole('button', { name: 'Buy now' }));
    expect(await screen.findByText('Confirmed.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Purchased' })).toBeDisabled();
  });
});

describe('order status (no button)', () => {
  it('a returning buyer sees their order and "Purchased" right after sign-in', async () => {
    api.me = [{ purchased: true, status: 'confirmed' }];
    await signIn();
    expect(await screen.findByText('Confirmed.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Purchased' })).toBeDisabled();
  });

  it('goes from Reserved (spinner) to Confirmed on its own, then stops polling', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.me = [
      { purchased: false }, // the check after sign-in
      { purchased: true, status: 'reserved' },
      { purchased: true, status: 'reserved' },
      { purchased: true, status: 'confirmed' },
    ];
    const user = await signIn(userEvent.setup({ advanceTimers: vi.advanceTimersByTime }));
    await user.click(screen.getByRole('button', { name: 'Buy now' }));

    const row = await screen.findByTestId('order-status');
    expect(row).toHaveTextContent('Reserved. Confirming your order…');
    expect(within(row).getByTestId('spinner')).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(2_000));
    await waitFor(() => expect(row).toHaveTextContent('Confirmed. Your order is saved.'));
    expect(within(row).queryByTestId('spinner')).toBeNull();

    const callsWhenConfirmed = api.calls.me;
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(api.calls.me).toBe(callsWhenConfirmed);
  });

  it('gives up after about 10 s and drops the spinner if the order is never saved', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.me = [{ purchased: false }, { purchased: true, status: 'reserved' }];
    const user = await signIn(userEvent.setup({ advanceTimers: vi.advanceTimersByTime }));
    await user.click(screen.getByRole('button', { name: 'Buy now' }));
    await screen.findByText('Confirming your order…', { exact: false });

    await act(() => vi.advanceTimersByTimeAsync(12_000));
    const row = screen.getByTestId('order-status');
    await waitFor(() => expect(row).toHaveTextContent('The order will be saved shortly.'));
    expect(within(row).queryByTestId('spinner')).toBeNull();
    const calls = api.calls.me;
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(api.calls.me).toBe(calls);
  });
});
