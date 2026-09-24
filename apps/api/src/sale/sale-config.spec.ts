import { parseSaleConfig } from './sale-config';

const valid: Record<string, string> = {
  SALE_STARTS_AT: '2026-10-01T10:00:00Z',
  SALE_ENDS_AT: '2026-10-01T11:00:00Z',
  SALE_STOCK: '100',
  PRODUCT_NAME: 'Sneaker',
  PRODUCT_PRICE: '$99.00',
  PRODUCT_IMAGE_URL: '/images/product.jpg',
};

const parse = (overrides: Record<string, string | undefined>) =>
  parseSaleConfig((key) => ({ ...valid, ...overrides })[key]);

describe('parseSaleConfig', () => {
  it('parses a valid config into epoch ms and numbers', () => {
    expect(parse({})).toEqual({
      startsAt: Date.parse('2026-10-01T10:00:00Z'),
      endsAt: Date.parse('2026-10-01T11:00:00Z'),
      initialStock: 100,
      productName: 'Sneaker',
      productPrice: '$99.00',
      productImageUrl: '/images/product.jpg',
    });
  });

  it('treats the image URL as optional', () => {
    expect(parse({ PRODUCT_IMAGE_URL: undefined }).productImageUrl).toBe('');
  });

  it('rejects an end before the start', () => {
    expect(() => parse({ SALE_ENDS_AT: '2026-10-01T09:00:00Z' })).toThrow(
      'SALE_ENDS_AT must be after SALE_STARTS_AT',
    );
  });

  it('rejects an end equal to the start (empty window)', () => {
    expect(() => parse({ SALE_ENDS_AT: valid.SALE_STARTS_AT })).toThrow(
      'SALE_ENDS_AT must be after SALE_STARTS_AT',
    );
  });

  it.each(['0', '-5', '10.5', '1e3', 'abc', ''])('rejects stock "%s"', (stock) => {
    expect(() => parse({ SALE_STOCK: stock })).toThrow(
      'SALE_STOCK must be a positive whole number',
    );
  });

  it('rejects a missing product name', () => {
    expect(() => parse({ PRODUCT_NAME: undefined })).toThrow('PRODUCT_NAME is required');
  });

  it('rejects a blank product name', () => {
    expect(() => parse({ PRODUCT_NAME: '   ' })).toThrow('PRODUCT_NAME is required');
  });

  it('rejects a missing price', () => {
    expect(() => parse({ PRODUCT_PRICE: undefined })).toThrow('PRODUCT_PRICE is required');
  });

  it('rejects a date without a timezone', () => {
    expect(() => parse({ SALE_STARTS_AT: '2026-10-01T10:00:00' })).toThrow(
      'SALE_STARTS_AT must be an ISO 8601 date with a timezone',
    );
  });

  it('rejects a date that is not a date', () => {
    expect(() => parse({ SALE_ENDS_AT: 'tomorrow' })).toThrow('SALE_ENDS_AT must be an ISO 8601');
  });

  it('lists every problem in one error', () => {
    expect(() => parse({ SALE_STOCK: '0', PRODUCT_NAME: '' })).toThrow(
      /SALE_STOCK[\s\S]*PRODUCT_NAME/,
    );
  });
});
