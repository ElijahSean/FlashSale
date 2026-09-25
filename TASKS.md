# FlashSale tasks

One row per requirement file. Status: `todo`, `doing`, `done`. Keep it current: it is the only
place that answers "where are we". Deadline: **Sep 30**.

| ID | Requirement | Depends | Status |
|---|---|---|---|
| 01 | Project setup and local infrastructure (Docker Compose: Redis, Postgres) | | done |
| 02 | Sale and product config, status endpoint | 01 | done |
| 03 | Atomic purchase gate (Lua script) | 02 | done |
| 04 | Order queue and worker | 03 | done |
| 05 | Demo login, AuthGuard and purchase endpoints | 03, 04 | done |
| 06 | Purchase frontend | 05 | todo |
| 07 | Full stack in Docker and stress tests | 06 | todo |
| S | Submission: README final, repo public, email link (manual) | 07 | todo |
