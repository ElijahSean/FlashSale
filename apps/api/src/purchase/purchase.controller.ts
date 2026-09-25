import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { purchaseResponse } from './purchase-result';
import { PurchaseStatusService } from './purchase-status.service';
import { PurchaseService } from './purchase.service';

/**
 * Guards run in the order listed: AuthGuard first (401, and it sets req.user), then the rate limit,
 * which needs req.user for the per-user count (429). Only then does a route run.
 */
@Controller('purchases')
@UseGuards(AuthGuard, RateLimitGuard)
export class PurchaseController {
  constructor(
    private readonly purchases: PurchaseService,
    private readonly status: PurchaseStatusService,
  ) {}

  /**
   * No body is read on purpose (rule 8): the buyer is req.user.id from the token. A userId sent in
   * the body is never looked at.
   *
   * purchase(), not attempt(): it also queues the order and gives the unit back if that fails
   * (rules 5 and 6). Redis trouble surfaces as a 503 thrown from inside it (rule 4).
   */
  @Post()
  async buy(@Req() req: AuthedRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const { status, body } = purchaseResponse(await this.purchases.purchase(req.user.id));
    // The status depends on the result, so it is set here. passthrough keeps Nest sending the body.
    reply.status(status);
    return body;
  }

  @Get('me')
  me(@Req() req: AuthedRequest) {
    return this.status.forUser(req.user.id);
  }
}
