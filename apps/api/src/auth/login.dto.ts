import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

/**
 * Body of POST /api/auth/demo-login.
 *
 * Rule 10: the userId is cleaned (trimmed, lowercased) here and nowhere else.
 * " Eli@X.com " and "eli@x.com" must be one buyer, or someone could buy twice by changing case.
 *
 * Cleaning runs before the checks, so "   " becomes "" and fails. Non-strings are left alone,
 * so @IsString rejects them.
 */
export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  // 254 is the longest valid email.
  @Length(1, 254)
  userId!: string;
}
