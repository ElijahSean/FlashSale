# LEARNINGS.md

Read at the start of every scan and plan. Appended to at the end of every loop, success or not.
Keep entries short: this file doubles as interview material ("what surprised you?").

Entry format:

```
## <date> · <requirement ID and title>
- Approach that worked: <one line>
- Surprises / root causes: <bug, why, fix>
- Watch-outs for next time: <what to check first>
```

Never put real secrets or personal data in here. Use placeholders.

---

## 2026-09-24 · 01 Project setup and local infrastructure
- Approach that worked: hand-written NestJS files (no `nest new`), Compose with data stores private by default and an override that publishes them on 127.0.0.1 for dev.
- Surprises / root causes: NestJS 12 is ESM-only and broke Jest under CommonJS; pinned 11. npm `latest` for Prisma is an 8.x RC; pinned 7.10, which needs `prisma.config.ts`, the `pg` driver adapter, and loads no `.env` by itself. TypeScript 6 rejects `moduleResolution: node`; use `node16`. Prisma's `@default(uuid())` is client-side, so a raw `INSERT ... ON CONFLICT` would have no id; moved it to Postgres `gen_random_uuid()`.
- Watch-outs for next time: ioredis buffers commands while disconnected unless `enableOfflineQueue: false`, which would silently break fail closed (rule 4). The worker in 04 must generate its Prisma client from `apps/api/prisma/schema.prisma`, not a copy.
