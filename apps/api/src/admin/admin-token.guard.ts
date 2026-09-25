import { createHash, timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';

// Same bar as JWT_SECRET: shorter tokens can be guessed by brute force.
const MIN_TOKEN_LENGTH = 32;

/**
 * Lets a request through only with the header `X-Admin-Token: <ADMIN_TOKEN>`. A separate header,
 * not a user JWT: an admin is not a buyer, and a buyer's token must never open this door.
 *
 * Why hashes and timingSafeEqual: a plain `===` stops at the first wrong character, so how long it
 * takes leaks how much of a guess was right. Hashing both sides gives two values of equal length,
 * and timingSafeEqual compares all of them, whatever the input.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(config: ConfigService) {
    const token = config.get<string>('ADMIN_TOKEN') ?? '';
    // Rule 11 and fail closed: admin on with a weak or missing token stops the API at startup.
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
