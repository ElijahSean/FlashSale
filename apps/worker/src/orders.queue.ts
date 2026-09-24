// The contract with the API. A copy, not an import, so the worker builds and ships on its own.
// The contract test in order-worker.int.spec.ts fails if these drift from the API's values
// (apps/api/src/purchase/order-queue.ts and apps/api/src/sale/sale.keys.ts).
export const ORDERS_QUEUE = 'orders';
export const BUYERS_KEY = 'sale:buyers';

export interface OrderJob {
  userId: string;
}
