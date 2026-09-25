import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { LoginDto } from './login.dto';

/**
 * Demo login: no password. Whoever types a name gets a token for it. That is the brief (a demo of
 * the sale, not of accounts). Real sign-in would replace this route and AuthGuard only.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly jwt: JwtService) {}

  // Per-IP limit only: there is no user yet. It stops one address minting tokens in bulk.
  @UseGuards(RateLimitGuard)
  @Post('demo-login')
  @HttpCode(HttpStatus.OK) // nothing is created on the server, so 200 rather than POST's 201
  async login(@Body() { userId }: LoginDto) {
    // userId is already trimmed and lowercased by LoginDto (rule 10). Expiry and algorithm come
    // from AuthModule's signOptions.
    const accessToken = await this.jwt.signAsync({ sub: userId });
    return { accessToken, userId };
  }
}
