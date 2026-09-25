import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthGuard, JWT_ALGORITHM } from './auth.guard';

// Short on purpose: the token is only needed for the sale, and there are no refresh tokens.
const TOKEN_TTL_SECONDS = 30 * 60;
// An HMAC key shorter than this is guessable by brute force.
const MIN_SECRET_LENGTH = 32;

/** Rule 11: the secret comes from env. Missing or too short stops the API at startup. */
function readJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET');
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters. See .env.example.`,
    );
  }
  return secret;
}

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: readJwtSecret(config),
        signOptions: { algorithm: JWT_ALGORITHM, expiresIn: TOKEN_TTL_SECONDS },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthGuard],
  // Other modules protect their routes with AuthGuard, which needs JwtService.
  exports: [AuthGuard, JwtModule],
})
export class AuthModule {}
