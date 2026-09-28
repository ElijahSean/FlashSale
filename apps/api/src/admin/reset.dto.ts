import { IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';

const DAY_SECONDS = 86_400;

/**
 * Optional settings for a test run. Empty body: back to the .env stock and window.
 *
 * The window is "starts in 20 s, lasts 10 s", not two times, so the script can use
 * Redis's clock (rule 9).
 */
export class ResetDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  stock?: number;

  // Negative means "started N seconds ago". Send both window fields or neither.
  @ValidateIf(
    (dto: ResetDto) => dto.startsInSeconds !== undefined || dto.durationSeconds !== undefined,
  )
  @IsInt()
  @Min(-DAY_SECONDS)
  @Max(DAY_SECONDS)
  startsInSeconds?: number;

  @ValidateIf(
    (dto: ResetDto) => dto.startsInSeconds !== undefined || dto.durationSeconds !== undefined,
  )
  @IsInt()
  @Min(1)
  @Max(DAY_SECONDS)
  durationSeconds?: number;
}
