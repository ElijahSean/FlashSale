import type { OrderStatus } from '../useOrderStatus';
import { Spinner } from './Spinner';

/**
 * reserved: the Redis gate gave this user a unit and the order is queued.
 * confirmed: the worker saved it in Postgres. Both come from GET /api/purchases/me.
 */
export function OrderStatusRow({ status, watching }: { status: OrderStatus; watching: boolean }) {
  return (
    <div aria-live="polite">
      {status && (
        <div
          data-testid="order-status"
          className="flex items-center gap-3 border-t border-[#E6ECF5] pt-4 text-sm text-[#33404F] md:text-[15px]"
        >
          {status === 'confirmed' ? <CheckIcon /> : watching && <Spinner className="size-4.5" />}
          {status === 'confirmed' ? (
            <span>
              <strong className="text-ink">Confirmed.</strong> Your order is saved.
            </span>
          ) : (
            <span>
              <strong className="text-ink">Reserved.</strong>{' '}
              {/* Polling gave up after ~10 s: the unit is safe in Redis, the save is just slow. */}
              {watching
                ? 'Confirming your order…'
                : 'Your unit is held. The order will be saved shortly.'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#095AE9"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
