# Sale and product config, and status endpoint

## Problem and goal

The sale needs one predefined product (name, price, image), a configurable window and stock, stored in Redis so every API replica agrees, and a public endpoint that tells users whether the sale is upcoming, active, ended or sold out.

## Scope

**In scope**

- Env config: `SALE_STARTS_AT`, `SALE_ENDS_AT` (ISO), `SALE_STOCK`, `PRODUCT_NAME`, `PRODUCT_PRICE` (display string), `PRODUCT_IMAGE_URL`
- Seeding on startup: write `sale:config` and `sale:stock` only if they don't exist (no reset on restart)
- `SaleModule` with `GET /api/sale`
- Response: `{ product: { name, price, imageUrl }, status, startsAt, endsAt, stockRemaining, serverTime }`
- ~1 s in-memory cache of the status response

**Out of scope**

- Changing sale times or product at runtime (admin endpoint)
- Adding or editing products, a product table, multiple products
- Payments (price is display only)
- Purchasing

## Acceptance criteria

- [ ] On first boot, `sale:config` and `sale:stock` are written from env; on a second boot with existing keys, they are not overwritten
- [ ] Startup fails with a clear error if `SALE_ENDS_AT` is before `SALE_STARTS_AT`, `SALE_STOCK` is not a positive integer, or `PRODUCT_NAME` is missing
- [ ] `GET /api/sale` returns the product name, price and image URL from config
- [ ] Before start: `status = "upcoming"`
- [ ] Between start and end with stock > 0: `status = "active"`
- [ ] Between start and end with stock = 0: `status = "sold_out"`
- [ ] After end: `status = "ended"`
- [ ] `serverTime` is the API's current time in ISO format
- [ ] 1,000 requests within one second cause at most ~1 Redis read per replica (cache works)
- [ ] Endpoint is public (no token needed)

## Context and constraints

- Design rules: 7 (the 1 s cache is the only allowed in-memory state), 9 (status uses the API clock; purchases use Redis `TIME`)
- Status logic should be a pure function so it can be unit tested without Redis

## Test expectations

- Unit: pure status function for all four states and exact boundary times
- Unit: config validation errors
- Integration (Testcontainers Redis): seeding does not overwrite existing keys

## Notes for planning

- Product is configuration, not data: the brief has one predefined product. If multiple products were needed, move to a `Product` table + seed script and prefix Redis keys by product ID.
- Status here is informational. The Lua script is the real authority on whether a purchase is allowed.
