import { IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';

const DAY_SECONDS = 86_400;

/**
 * Optional overrides for a test run. Empty body: back to the .env values (stock and window).
 *
 * The window is relative ("starts in 20 s, lasts 10 s") rather than two timestamps, so the start
 * can be computed from Redis TIME inside the script (rule 9). The k6 scripts never send a clock.
 */
export class ResetDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  stock?: number;

  // Negative means "started N seconds ago". Given together with durationSeconds, or not at all.
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
