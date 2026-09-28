// Redis key names in one place, so every part uses the same ones. See docs/design-rules.md.
export const SALE_KEYS = {
  config: 'sale:config',
  stock: 'sale:stock',
  buyers: 'sale:buyers',
} as const;
