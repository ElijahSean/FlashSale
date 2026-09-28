import type { BuyOutcome } from './api';

export type Tone = 'success' | 'warn' | 'neutral' | 'error';

// Colors from the design. Full class names, because Tailwind only includes classes it finds written out.
export const TONE_CLASSES: Record<Tone, { box: string; title: string; dot: string }> = {
  success: { box: 'bg-[#EAF1FE] border-primary', title: 'text-primary-dark', dot: 'bg-primary' },
  warn: { box: 'bg-[#FFF6E0] border-amber', title: 'text-[#6B4200]', dot: 'bg-amber' },
  neutral: { box: 'bg-[#F1F4F8] border-[#99A0AB]', title: 'text-ink', dot: 'bg-[#99A0AB]' },
  error: { box: 'bg-[#FDECEC] border-[#D93A3A]', title: 'text-[#8F1D1D]', dot: 'bg-[#D93A3A]' },
};

/**
 * One message per outcome. It must list every outcome, so a new one won't compile
 * until it has a message here.
 */
export const MESSAGES: Record<BuyOutcome, { tone: Tone; title: string; body: string }> = {
  SUCCESS: {
    tone: 'success',
    title: 'You got one!',
    body: 'Your unit is reserved. Confirmation takes a few seconds.',
  },
  ALREADY_PURCHASED: {
    tone: 'warn',
    title: 'You already have one',
    body: 'It is one per person. Your order status is shown below.',
  },
  SOLD_OUT: {
    tone: 'warn',
    title: 'Sold out',
    body: 'All units are gone. Thanks for joining the sale.',
  },
  NOT_STARTED: {
    tone: 'neutral',
    title: 'Not open yet',
    body: 'The sale has not started. Try again when the countdown ends.',
  },
  ENDED: { tone: 'neutral', title: 'Sale ended', body: 'The sale window has closed.' },
  RATE_LIMITED: {
    tone: 'error',
    title: 'Slow down',
    body: 'Too many attempts. Wait a moment and try again.',
  },
  // We don't say "nothing was reserved": a timed-out call may still have worked.
  // The page asks /me after, so a reserved unit still shows up.
  UNAVAILABLE: {
    tone: 'error',
    title: 'Please try again',
    body: 'Your attempt did not go through. Please try again.',
  },
  SESSION_EXPIRED: {
    tone: 'neutral',
    title: 'Session expired',
    body: 'Please sign in again to continue.',
  },
  NETWORK: {
    tone: 'error',
    title: 'Connection problem',
    body: 'We could not confirm your attempt. If it went through, your order status appears below.',
  },
};

export const LOGIN_ERRORS = {
  EMPTY: 'Enter a username or email.',
  TOO_LONG: 'That is too long. Use up to 254 characters.',
  INVALID: 'Enter a username or email of up to 254 characters.',
  RATE_LIMITED: 'Too many attempts. Wait a moment and try again.',
  UNAVAILABLE: 'Sign-in is unavailable right now. Please try again.',
} as const;
