import type { SaleStatus } from '../api';
import { Spinner } from './Spinner';

interface BuyState {
  status: SaleStatus;
  stockRemaining: number;
  pending: boolean;
  purchased: boolean;
}

/**
 * Enabled only when the sale is live, stock is left, nothing is pending and the user hasn't bought.
 * The Lua gate still decides (rule 3); this just avoids clicks that can only fail. Order matters: "Buying…" and "Purchased" win over the sale status.
 */
export function buyButtonState({ status, stockRemaining, pending, purchased }: BuyState) {
  if (pending) return { enabled: false, label: 'Buying…' };
  if (purchased) return { enabled: false, label: 'Purchased' };
  if (status === 'upcoming') return { enabled: false, label: 'Opens soon' };
  if (status === 'ended') return { enabled: false, label: 'Sale ended' };
  if (status === 'sold_out' || stockRemaining === 0) return { enabled: false, label: 'Sold out' };
  return { enabled: true, label: 'Buy now' };
}

export function BuyButton(props: BuyState & { onBuy: () => void }) {
  const { enabled, label } = buyButtonState(props);
  const look = enabled
    ? 'bg-primary text-white hover:bg-primary-dark'
    : props.purchased
      ? 'bg-[#EAF1FE] text-primary-dark cursor-not-allowed'
      : 'bg-[#E6ECF5] text-muted cursor-not-allowed';
  return (
    <button
      type="button"
      onClick={props.onBuy}
      disabled={!enabled}
      className={`flex h-14 items-center justify-center gap-3 rounded-full text-lg font-extrabold tracking-tight md:h-16 md:text-xl ${look}`}
    >
      {props.pending && <Spinner />}
      {label}
    </button>
  );
}
