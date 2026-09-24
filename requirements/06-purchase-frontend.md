# Purchase frontend

## Problem and goal

The brief requires a simple React page to see the sale status, identify yourself, click Buy Now, and get clear feedback.

## Scope

**In scope**

- Vite + React + TypeScript + Tailwind app in `apps/web`
- Status banner: status label, countdown to start or end (corrected with `serverTime`), stock left; polls `/api/sale` every 2 s
- Sign-in: username or email, calls `/auth/demo-login`, token kept in memory; shows "Signed in as ..." and Sign out
- Buy Now: enabled only when signed in, sale active, and no request in flight
- Result panel with one message per outcome
- Automatic order status from `/api/purchases/me` (no button): checked after sign-in; polled about once a second after a successful buy until confirmed (stop after ~10 s); checked once after a buy timeout or network error
- Loading states: spinner in Buy and Sign in buttons while pending, spinner on "Reserved, confirming", skeleton on first load; respect reduced motion
- Typed API client with base URL from env

**Out of scope**

- Routing, multiple pages
- Persisting the token across reloads
- Design polish beyond clean Tailwind defaults

## Acceptance criteria

- [ ] Product name, price and image come from `GET /api/sale` (no hard-coded product)
- [ ] Status banner shows the correct label for upcoming, active, sold out and ended
- [ ] Countdown uses the server clock offset (a client clock 5 min off still shows the right countdown)
- [ ] Buy Now is disabled when signed out, when the sale is not active, and while a request is pending
- [ ] Each outcome shows a distinct message: success, already purchased, sold out, not started, ended, rate limited, try again (503), session expired (401, returns to sign-in)
- [ ] After sign-in, a returning buyer sees their order status and a disabled "Purchased" button without clicking anything
- [ ] After a successful buy, status shows "Reserved" with a spinner, then changes to "Confirmed" on its own once the worker saves the order; polling stops after that
- [ ] While a buy or sign-in request is pending, the button shows a spinner and is disabled
- [ ] First load shows skeleton blocks, not an empty page or a full-screen spinner
- [ ] With reduced motion enabled, spinners and skeleton pulse do not animate
- [ ] Double-clicking Buy Now sends one request
- [ ] Layout works at 375 px width

## Context and constraints

- Design reference: `docs/design/` (README with tokens, layout, states and messages, plus the canvas source files). Match its layout and states.
- Tailwind theme (from bookipi.com): `primary #095AE9`, `primary-dark #0848C0`, `ink #0B192D`, `navy #07112A`, `line #D1DAE5`, `muted #5B6573`, `bg #F6F8FC`, `amber #FFAE10`; pill buttons (`rounded-full`), cards `rounded-2xl`; font Hanken Grotesk (Google Fonts), JetBrains Mono for the countdown
- Talks to the API through nginx in the full stack, directly in dev (Vite proxy)
- Files: `apps/web/src/*`

## Test expectations

- Vitest + React Testing Library: button states, each outcome message, countdown offset logic (pure function)
- Manual: full flow in the browser against the running stack

## Notes for planning

- Keep API calls in one small module so components stay simple to explain.
