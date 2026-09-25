import type { BuyOutcome } from '../api';
import { MESSAGES, TONE_CLASSES } from '../messages';

export function ResultPanel({ outcome }: { outcome: BuyOutcome | null }) {
  const message = outcome && MESSAGES[outcome];
  const tone = message && TONE_CLASSES[message.tone];
  // The live region is always in the page, so screen readers announce the message when it appears.
  return (
    <div aria-live="polite">
      {message && tone && (
        <div
          data-testid="result"
          className={`flex items-start gap-3.5 rounded-xl border px-4 py-3.5 md:px-4.5 md:py-4 ${tone.box}`}
        >
          <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${tone.dot}`} />
          <div className="flex flex-col gap-1">
            <span className={`text-base font-extrabold md:text-[17px] ${tone.title}`}>
              {message.title}
            </span>
            <span className="text-sm leading-snug text-[#33404F] md:text-[15px]">
              {message.body}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
