import { createHash, timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';

// Same as JWT_SECRET: shorter tokens can be guessed.
const MIN_TOKEN_LENGTH = 32;

/**
 * Only lets through requests with the header `X-Admin-Token: <ADMIN_TOKEN>`.
 * Not a user token: a buyer's token must never open this.
 *
 * Why timingSafeEqual: `===` stops at the first wrong character, so its speed hints at how
 * much of a guess was right. Hashing makes both sides the same length, and timingSafeEqual
 * always compares everything.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(config: ConfigService) {
    const token = config.get<string>('ADMIN_TOKEN') ?? '';
    // Admin on with a weak or missing token: the API won't start.
    if (token.length < MIN_TOKEN_LENGTH) {
      throw new Error(
        `ENABLE_ADMIN=true needs ADMIN_TOKEN of at least ${MIN_TOKEN_LENGTH} characters. See .env.example.`,
      );
    }
    this.expected = sha256(token);
  }

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<FastifyRequest>().headers['x-admin-token'];
    if (typeof header !== 'string' || !timingSafeEqual(sha256(header), this.expected)) {
      throw new UnauthorizedException('Invalid admin token');
    }
    return true;
  }
}

const sha256 = (value: string) => createHash('sha256').update(value).digest();
