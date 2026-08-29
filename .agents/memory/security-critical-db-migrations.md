---
name: Security-critical database migrations
description: Why database invariants that enforce security must be versioned and applied before the API accepts traffic.
---

Security-critical uniqueness and integrity constraints must ship as versioned migrations that run before seed logic and before the API starts listening. A schema declaration plus a development `drizzle-kit push` is not a production deployment guarantee.

**Why:** A security review found that payment replay prevention depended on indexes present in development but absent from the normal release startup path. Without deployment-time DDL, concurrent requests could bypass the application-level pre-checks.

**How to apply:** Whenever authorization, replay prevention, or race safety relies on a database constraint, add a fail-closed migration, run it during startup/deployment, and verify the resulting database object—not just the TypeScript schema.