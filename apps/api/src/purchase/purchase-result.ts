import { HttpStatus } from '@nestjs/common';
import type { PurchaseResult } from './purchase.service';

export interface PurchaseResponseBody {
  statusCode: number;
  result: PurchaseResult;
  message: string;
}

// The table in docs/design-rules.md, as code. A Record over every result means a new result in
// purchase.lua does not compile until it gets an HTTP answer here.
const RESPONSES: Record<PurchaseResult, { status: number; message: string }> = {
  // Not "confirmed": that word is kept for /me once the order is saved in Postgres.
  SUCCESS: { status: HttpStatus.CREATED, message: 'Purchase successful' },
  ALREADY_PURCHASED: { status: HttpStatus.CONFLICT, message: 'You already bought this item' },
  SOLD_OUT: { status: HttpStatus.GONE, message: 'Sold out' },
  NOT_STARTED: { status: HttpStatus.FORBIDDEN, message: 'The sale has not started yet' },
  ENDED: { status: HttpStatus.FORBIDDEN, message: 'The sale has ended' },
};

/**
 * Turns the gate's answer into the HTTP status and body. The body always carries `result`,
 * because two results share 403 and the web app (06) shows a different message for each.
 */
export function purchaseResponse(result: PurchaseResult) {
  const { status, message } = RESPONSES[result];
  const body: PurchaseResponseBody = { statusCode: status, result, message };
  return { status, body };
}
