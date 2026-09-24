// Redis key names in one place, so the seeder, the status endpoint and the purchase gate (03)
// cannot drift apart. The table in docs/design-rules.md describes each key.
export const SALE_KEYS = {
  config: 'sale:config',
  stock: 'sale:stock',
  buyers: 'sale:buyers',
} as const;
