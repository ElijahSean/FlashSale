import { HttpStatus } from '@nestjs/common';
import type { PurchaseResult } from './purchase.service';

export interface PurchaseResponseBody {
  statusCode: number;
  result: PurchaseResult;
  message: string;
}

// The table from docs/design-rules.md. It must list every result, so a new result
// in purchase.lua won't compile until it gets an HTTP status here.
const RESPONSES: Record<PurchaseResult, { status: number; message: string }> = {
  // Not "confirmed": /me says that once the order is saved in Postgres.
  SUCCESS: { status: HttpStatus.CREATED, message: 'Purchase successful' },
  ALREADY_PURCHASED: { status: HttpStatus.CONFLICT, message: 'You already bought this item' },
  SOLD_OUT: { status: HttpStatus.GONE, message: 'Sold out' },
  NOT_STARTED: { status: HttpStatus.FORBIDDEN, message: 'The sale has not started yet' },
  ENDED: { status: HttpStatus.FORBIDDEN, message: 'The sale has ended' },
};

/**
 * Turns the gate's answer into an HTTP status and body. The body includes `result`
 * because two results share 403, and the web app shows a different message for each.
 */
export function purchaseResponse(result: PurchaseResult) {
  const { status, message } = RESPONSES[result];
  const body: PurchaseResponseBody = { statusCode: status, result, message };
  return { status, body };
}
