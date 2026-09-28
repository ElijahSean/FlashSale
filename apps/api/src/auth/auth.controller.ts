import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { LoginDto } from './login.dto';

/**
 * Demo login: no password. Type a name, get a token. The brief asks for a sale, not accounts.
 * Real login would replace only this route and AuthGuard.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly jwt: JwtService) {}

  // IP limit only (no user yet). Stops one machine making tokens in bulk.
  @UseGuards(RateLimitGuard)
  @Post('demo-login')
  @HttpCode(HttpStatus.OK) // nothing is created on the server, so 200 rather than POST's 201
  async login(@Body() { userId }: LoginDto) {
    // userId is already cleaned by LoginDto (rule 10). Expiry and algorithm are set in AuthModule.
    const accessToken = await this.jwt.signAsync({ sub: userId });
    return { accessToken, userId };
  }
}
