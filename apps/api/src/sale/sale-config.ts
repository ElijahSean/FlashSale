/** The one sale and its one product (design rule 12: product is configuration, not data). */
export interface SaleConfig {
  /** Epoch ms. Stored as numbers in Redis so the Lua script (03) can compare them to TIME. */
  startsAt: number;
  endsAt: number;
  initialStock: number;
  productName: string;
  /** Display string only, for example "$99.00". There are no payments. */
  productPrice: string;
  /** Optional. Empty string when not set. */
  productImageUrl: string;
}

// ISO 8601 with a date, a time and an explicit timezone. Without the zone, "2026-10-01T10:00"
// would mean a different instant on each machine that parses it.
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Turns raw env values into a checked SaleConfig, or throws one error listing every problem.
 *
 * Pure on purpose: it takes a lookup function instead of reading process.env or Redis, so the
 * unit tests can feed it any values. The API calls it at startup, so a bad .env stops the
 * process with a clear message instead of running a broken sale.
 */
export function parseSaleConfig(get: (key: string) => string | undefined): SaleConfig {
  const errors: string[] = [];

  const startsAt = parseIso(get('SALE_STARTS_AT'), 'SALE_STARTS_AT', errors);
  const endsAt = parseIso(get('SALE_ENDS_AT'), 'SALE_ENDS_AT', errors);
  if (startsAt !== undefined && endsAt !== undefined && endsAt <= startsAt) {
    errors.push('SALE_ENDS_AT must be after SALE_STARTS_AT');
  }

  // Digits only, so "10.5", "1e3", "-5" and "abc" are all rejected before the number check.
  const rawStock = get('SALE_STOCK')?.trim() ?? '';
  const initialStock = Number(rawStock);
  if (!/^\d+$/.test(rawStock) || initialStock <= 0 || !Number.isSafeInteger(initialStock)) {
    errors.push(`SALE_STOCK must be a positive whole number, got "${rawStock}"`);
  }

  const productName = get('PRODUCT_NAME')?.trim() ?? '';
  if (!productName) errors.push('PRODUCT_NAME is required');

  const productPrice = get('PRODUCT_PRICE')?.trim() ?? '';
  if (!productPrice) errors.push('PRODUCT_PRICE is required');

  if (errors.length > 0) {
    throw new Error(`Invalid sale config:\n- ${errors.join('\n- ')}`);
  }

  return {
    startsAt: startsAt!,
    endsAt: endsAt!,
    initialStock,
    productName,
    productPrice,
    productImageUrl: get('PRODUCT_IMAGE_URL')?.trim() ?? '',
  };
}

function parseIso(raw: string | undefined, name: string, errors: string[]): number | undefined {
  const value = raw?.trim() ?? '';
  const ms = Date.parse(value);
  if (!ISO_WITH_ZONE.test(value) || Number.isNaN(ms)) {
    errors.push(`${name} must be an ISO 8601 date with a timezone, got "${value}"`);
    return undefined;
  }
  return ms;
}
