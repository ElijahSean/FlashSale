/** The one sale and its one product (rule 12: the product comes from config). */
export interface SaleConfig {
  /** Milliseconds. Stored as numbers so the Lua script can compare them with Redis TIME. */
  startsAt: number;
  endsAt: number;
  initialStock: number;
  productName: string;
  /** Just text to show, like "$99.00". There are no payments. */
  productPrice: string;
  /** Optional. Empty string when not set. */
  productImageUrl: string;
}

// A date and time with a timezone. Without the zone, each machine would read a different time.
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Checks the sale settings from .env. Throws one error listing every problem.
 *
 * It takes a lookup function instead of reading process.env, so tests can pass any values.
 * Runs at startup, so a bad .env stops the API with a clear message.
 */
export function parseSaleConfig(get: (key: string) => string | undefined): SaleConfig {
  const errors: string[] = [];

  const startsAt = parseIso(get('SALE_STARTS_AT'), 'SALE_STARTS_AT', errors);
  const endsAt = parseIso(get('SALE_ENDS_AT'), 'SALE_ENDS_AT', errors);
  if (startsAt !== undefined && endsAt !== undefined && endsAt <= startsAt) {
    errors.push('SALE_ENDS_AT must be after SALE_STARTS_AT');
  }

  // Digits only: rejects "10.5", "1e3", "-5" and "abc".
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
