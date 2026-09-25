import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

/**
 * Body of POST /api/auth/demo-login.
 *
 * Rule 10: the userId is normalized here and nowhere else. " Eli@X.com " and "eli@x.com" must be
 * the same buyer, or one person could buy twice by changing case. Everything after login uses the
 * token's value, which is already normalized.
 *
 * The transform runs before the checks, so "   " becomes "" and fails the length check. Anything
 * that is not a string is left as it is, so @IsString rejects it instead of it being converted.
 */
export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  // 254 is the longest valid email address, so any real username or email fits.
  @Length(1, 254)
  userId!: string;
}
