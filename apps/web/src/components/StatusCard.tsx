import type { Sale, SaleStatus } from '../api';
import { countdownFor } from '../clock';

const PILLS: Record<SaleStatus, { label: string; pill: string; dot: string }> = {
  upcoming: { label: 'Upcoming', pill: 'bg-[#E8F0FE] text-primary-dark', dot: 'bg-primary' },
  active: { label: 'Live now', pill: 'bg-[#FFF4DB] text-[#6B4200]', dot: 'bg-amber' },
  sold_out: { label: 'Sold out', pill: 'bg-[#FDECE7] text-[#9A2A12]', dot: 'bg-[#E0552F]' },
  ended: { label: 'Ended', pill: 'bg-[#EEF1F5] text-[#4C525C]', dot: 'bg-[#99A0AB]' },
};

function stockHint(sale: Sale) {
  if (sale.status === 'upcoming' || sale.status === 'ended') return '';
  if (sale.stockRemaining === 0) return 'None left';
  return sale.stockRemaining <= 10 ? 'Almost gone' : 'Selling fast';
}

export function StatusCard({
  sale,
  now,
  offsetMs,
  failing,
}: {
  sale: Sale;
  now: number;
  offsetMs: number;
  failing: boolean;
}) {
  const pill = PILLS[sale.status];
  const countdown = countdownFor(sale, now, offsetMs);
  const pct = sale.initialStock > 0 ? (sale.stockRemaining / sale.initialStock) * 100 : 0;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 md:gap-5 md:px-8 md:py-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`inline-flex h-8 items-center gap-2 rounded-full px-3.5 text-sm font-bold ${pill.pill}`}
        >
          <span className={`size-2 rounded-full ${pill.dot}`} />
          {pill.label}
        </span>
        {/* The countdown is corrected by the server clock offset (clock.ts). */}
        <span className="text-sm text-muted">
          {failing ? 'Reconnecting…' : 'Synced to server time'}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-muted md:text-[15px]">{countdown.label}</span>
        <span
          data-testid="countdown"
          className="font-mono text-[42px] leading-none font-semibold tracking-tight tabular-nums md:text-[56px]"
        >
          {countdown.text}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex justify-between text-sm md:text-[15px]">
          <span className="font-semibold">
            {sale.stockRemaining} of {sale.initialStock} left
          </span>
          <span className="text-muted">{stockHint(sale)}</span>
        </div>
        <div
          role="progressbar"
          aria-label="Stock remaining"
          aria-valuemin={0}
          aria-valuemax={sale.initialStock}
          aria-valuenow={sale.stockRemaining}
          className="h-2 overflow-hidden rounded-full bg-[#E6ECF5] md:h-2.5"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
