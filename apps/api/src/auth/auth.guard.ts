import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { FastifyRequest } from 'fastify';

/** A request that passed AuthGuard. The only place a protected route learns who the user is. */
export type AuthedRequest = FastifyRequest & { user: { id: string } };

/**
 * Only this algorithm is accepted. A JWT's header names the algorithm it was signed with, and a
 * forged token can claim "none" (no signature) or a different one. Pinning the list means the
 * server decides how tokens are checked, never the token itself.
 */
export const JWT_ALGORITHM = 'HS256';

/**
 * Protects a route: no valid token, no entry (401).
 *
 * How it works. At demo login the API signs a token (a JWT) that says "sub = eli@x.com, expires at
 * T". The signature is an HMAC of the token's content made with JWT_SECRET, which only the server
 * knows. Here the guard recomputes that HMAC. If anyone changed the content (say, the sub to
 * another user) the signatures no longer match and the token is refused. An expired token is
 * refused too. No database lookup is needed, which keeps every API replica stateless (rule 7).
 *
 * Rule 8: the guard puts the token's sub on req.user.id, and protected routes read the user only
 * from there, never from the body.
 *
 * This is the seam for real auth later: swap the verification here, and every route stays as it is.
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
      // Checks the signature and the expiry (exp). Throws on any problem.
      ({ sub } = await this.jwt.verifyAsync<{ sub?: unknown }>(token, {
        algorithms: [JWT_ALGORITHM],
      }));
    } catch {
      // One message for every reason, so a caller learns nothing about why it failed.
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (typeof sub !== 'string' || sub === '') {
      throw new UnauthorizedException('Invalid or expired token');
    }

    req.user = { id: sub };
    return true;
  }
}

/** "Bearer <token>" to "<token>". Anything else counts as no token. */
function bearerToken(header: string | undefined): string | undefined {
  const [scheme, token] = header?.split(' ') ?? [];
  return scheme === 'Bearer' && token ? token : undefined;
}
