import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthedRequest, AuthGuard } from './auth.guard';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const jwt = new JwtService({ secret: SECRET });
const guard = new AuthGuard(jwt);

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** Runs the guard on a fake request with this Authorization header. */
async function check(authorization?: string) {
  const req = { headers: { authorization } } as unknown as AuthedRequest;
  const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as ExecutionContext;
  const allowed = await guard.canActivate(ctx);
  return { allowed, req };
}

describe('AuthGuard (rule 8: identity comes from the token)', () => {
  it('lets a valid token through and sets req.user.id from its sub', async () => {
    const token = jwt.sign({ sub: 'alice' }, { expiresIn: '30m' });
    const { allowed, req } = await check(`Bearer ${token}`);
    expect(allowed).toBe(true);
    expect(req.user).toEqual({ id: 'alice' });
  });

  it('rejects a request without a token', async () => {
    await expect(check(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a header that is not "Bearer <token>"', async () => {
    const token = jwt.sign({ sub: 'alice' });
    await expect(check(token)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(check(`Basic ${token}`)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a tampered token (payload changed, signature kept)', async () => {
    const [header, , signature] = jwt.sign({ sub: 'alice' }).split('.');
    const forged = `${header}.${b64url({ sub: 'bob' })}.${signature}`;
    await expect(check(`Bearer ${forged}`)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    const token = jwt.sign({ sub: 'alice', exp: Math.floor(Date.now() / 1000) - 10 });
    await expect(check(`Bearer ${token}`)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token signed with another secret', async () => {
    const other = new JwtService({ secret: 'another-secret-that-is-also-32-characters' });
    const token = other.sign({ sub: 'alice' });
    await expect(check(`Bearer ${token}`)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unsigned token ("alg": "none")', async () => {
    const token = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub: 'alice' })}.`;
    await expect(check(`Bearer ${token}`)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a validly signed token without a usable sub', async () => {
    await expect(check(`Bearer ${jwt.sign({ name: 'alice' })}`)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(check(`Bearer ${jwt.sign({ sub: '' })}`)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
