# UI design

Design reference for requirement 06. Source canvas (Claude artifact, owner only):
https://claude.ai/artifact/BmvjY9SSdUXjX422VcB48s

The two `.dc.html` files are the canvas source. They are a design reference, not app code:
read them for layout, spacing, copy and states, then build the real UI in React + Tailwind.

- `purchase-page.dc.html`: desktop (1280 wide), interactive. Its script shows every state and message.
- `purchase-page-mobile.dc.html`: mobile (390 wide), signed in, just bought, order confirming.
- `first-load-skeleton.dc.html`: desktop first load, grey placeholder blocks while `/api/sale` loads.

In the interactive canvas, the Tweaks panel switches sale status, stock, forced errors (429, 503, 401) and "already owned" (a returning buyer).

## Theme (from bookipi.com)

| Token | Hex | Use |
| --- | --- | --- |
| `primary` | `#095AE9` | Buy button, progress bar, links, success accent |
| `primary-dark` | `#0848C0` | Hover, success title |
| `ink` | `#0B192D` | Body text, Sign in button |
| `navy` | `#07112A` | Header bar |
| `line` | `#D1DAE5` | Card and input borders |
| `muted` | `#5B6573` | Secondary text |
| `bg` | `#F6F8FC` | Page background |
| `amber` | `#FFAE10` | "Live now" dot |

Fonts: Hanken Grotesk (400 to 800) for everything, JetBrains Mono 600 for the countdown.
Shapes: buttons `rounded-full` (pill), cards `rounded-2xl` with a 1px `line` border, inputs `rounded-xl`, height 52px.

## Layout (desktop)

- Navy header (72px): bolt mark + "Flash Sale" on the left; when signed in, "Signed in as <user>" + Sign out on the right.
- Two columns, 40px gap, 48px padding:
  - **Left, product card:** image area, "Limited edition" eyebrow, product name (36px, 800), price (28px, 700), "Limit 1 per person". Values come from `GET /api/sale` `product`.
  - **Right, two cards:**
    1. Status: status pill + "Synced to server time"; countdown label + large mono countdown; "N of M left" with a progress bar.
    2. Action: sign-in form when signed out (label "Username or email", input, Sign in button, helper text) or the Buy button when signed in (64px tall, pill); result panel below; order status row (shown automatically, no button).

Mobile stacks the same content in one column: compact product card, status card, action card.

## Status pill

| Status | Label | Background | Text | Dot |
| --- | --- | --- | --- | --- |
| upcoming | Upcoming | `#E8F0FE` | `#0848C0` | `#095AE9` |
| active | Live now | `#FFF4DB` | `#6B4200` | `#FFAE10` |
| sold_out | Sold out | `#FDECE7` | `#9A2A12` | `#E0552F` |
| ended | Ended | `#EEF1F5` | `#4C525C` | `#99A0AB` |

Countdown label: "Starts in" (upcoming), "Ends in" (active, sold out), "Sale closed" (ended, shows 00:00:00).

## Buy button

Enabled only when signed in, sale active, stock > 0, no request pending, not yet purchased. Enabled: `primary` background, white text.
Disabled labels: "Buying…" (pending), "Purchased", "Opens soon", "Sale ended", "Sold out".

## Result messages

| API result | Tone | Title | Body |
| --- | --- | --- | --- |
| 201 SUCCESS | success (blue) | You got one! | Your unit is reserved. Confirmation takes a few seconds. |
| 409 ALREADY_PURCHASED | warn (amber) | You already have one | It is one per person. Your order status is shown below. |
| 410 SOLD_OUT | warn | Sold out | All units are gone. Thanks for joining the sale. |
| 403 NOT_STARTED | neutral | Not open yet | The sale has not started. Try again when the countdown ends. |
| 403 ENDED | neutral | Sale ended | The sale window has closed. |
| 429 | error (red) | Slow down | Too many attempts. Wait a moment and try again. |
| 503 | error | Please try again | Your attempt did not go through. Nothing was reserved. |
| 401 | neutral | Session expired | Please sign in again to continue. (return to sign-in) |

Tone colors (background / border / title): success `#EAF1FE / #095AE9 / #0848C0`, warn `#FFF6E0 / #FFAE10 / #6B4200`,
neutral `#F1F4F8 / #99A0AB / #0B192D`, error `#FDECEC / #D93A3A / #8F1D1D`. The result area is `aria-live="polite"`.

## Order status (automatic, no button)

Uses `GET /api/purchases/me`. There is no "Check my purchase" button.

- **After sign-in:** call `/me` once. If the user already bought, show the status row and set the Buy button to "Purchased".
- **After a successful buy (201):** show "**Reserved.** Confirming your order…" with a small spinner, poll `/me` about once a second, and switch to "**Confirmed.** Your order is saved." with a check icon. Stop polling when confirmed, or after about 10 seconds.
- **After a timeout or network error on buy:** call `/me` once to find out whether the purchase went through.
- Hidden when the user has no purchase. The row is `aria-live="polite"`.

## Loading states

| Where | Treatment |
| --- | --- |
| Buy button pending | Spinner inside the button + "Buying…", button disabled (stops double clicks) |
| Sign in pending | Spinner inside the button + "Signing in…", button disabled |
| Order reserved, confirming | Small blue spinner next to the status text |
| First page load | Skeleton blocks in the card shapes (`first-load-skeleton.dc.html`), not a spinner |

Never a full-screen spinner, and no spinner on the 2-second status poll (update quietly).
Spinner: 16 to 20px ring, 2 to 2.5px border, light track + solid top (`primary` on light, white on dark), 0.8s linear spin.
Respect `prefers-reduced-motion`: no spin or pulse. Tailwind: `size-5 animate-spin rounded-full border-2 border-[#C9D3E3] border-t-primary motion-reduce:animate-none`.
