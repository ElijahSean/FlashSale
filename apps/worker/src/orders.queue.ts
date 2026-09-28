// Names shared with the API. Copied, not imported, so the worker builds on its own.
// A test fails if they ever differ from the API's.
export const ORDERS_QUEUE = 'orders';
export const BUYERS_KEY = 'sale:buyers';

export interface OrderJob {
  userId: string;
}
