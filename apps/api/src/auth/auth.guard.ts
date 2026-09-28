import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { FastifyRequest } from 'fastify';

/** A request that passed AuthGuard. req.user is the only place a route learns who the user is. */
export type AuthedRequest = FastifyRequest & { user: { id: string } };

/**
 * The only algorithm we accept. A token names its own algorithm, and a fake one could say "none"
 * (no signature). Fixing it here means the server decides how to check, not the token.
 */
export const JWT_ALGORITHM = 'HS256';

/**
 * Protects a route: no valid token, 401.
 *
 * How it works:
 * - At login the API signs a token (JWT) saying "user = eli@x.com, expires at T".
 * - The signature is made with JWT_SECRET, which only the server knows.
 * - Here we check the signature again. If anyone edited the token, it no longer matches: 401.
 * - Expired tokens get 401 too.
 * - No database lookup, so every API copy can check tokens on its own (rule 7).
 *
 * Rule 8: the user id goes on req.user.id. Routes read it from there, never from the body.
 *
 * For real login later, only this check changes. The routes stay the same.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = bearerToken(req.headers.authorization);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let sub: unknown;
    try {
      // Checks signature and expiry. Throws on any problem.
      ({ sub } = await this.jwt.verifyAsync<{ sub?: unknown }>(token, {
        algorithms: [JWT_ALGORITHM],
      }));
    } catch {
      // Same message for every reason, so an attacker learns nothing.
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (typeof sub !== 'string' || sub === '') {
      throw new UnauthorizedException('Invalid or expired token');
    }

    req.user = { id: sub };
    return true;
  }
}

/** "Bearer abc" gives "abc". Anything else means no token. */
function bearerToken(header: string | undefined): string | undefined {
  const [scheme, token] = header?.split(' ') ?? [];
  return scheme === 'Bearer' && token ? token : undefined;
}
