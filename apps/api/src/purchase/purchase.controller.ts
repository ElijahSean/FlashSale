import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { purchaseResponse } from './purchase-result';
import { PurchaseStatusService } from './purchase-status.service';
import { PurchaseService } from './purchase.service';

/**
 * Guards run in order: AuthGuard first (401, sets req.user),
 * then the rate limit (429), which needs req.user to count per user.
 */
@Controller('purchases')
@UseGuards(AuthGuard, RateLimitGuard)
export class PurchaseController {
  constructor(
    private readonly purchases: PurchaseService,
    private readonly status: PurchaseStatusService,
  ) {}

  /**
   * No body is read (rule 8). The buyer is req.user.id from the token.
   *
   * purchase(), not attempt(): it also queues the order, and gives the unit back if that fails
   * (rules 5 and 6). Redis problems come out as 503 (rule 4).
   */
  @Post()
  async buy(@Req() req: AuthedRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const { status, body } = purchaseResponse(await this.purchases.purchase(req.user.id));
    // Status depends on the result. passthrough lets Nest still send the body.
    reply.status(status);
    return body;
  }

  @Get('me')
  me(@Req() req: AuthedRequest) {
    return this.status.forUser(req.user.id);
  }
}
