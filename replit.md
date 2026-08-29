# FISL PLATFORM

FISL is a paid AI-skills learning community with lessons, progress, discussion, and manually verified Revolut membership access.

## Run & Operate

- Use the configured `artifacts/api-server: API Server` and `artifacts/fisl-platform: web` workflows for local development.
- `pnpm run typecheck` — full typecheck across all packages
- `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/fisl-platform run build` — build the production web artifact
- `pnpm --filter @workspace/api-server run build` — build the API server
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, and `VITE_CLERK_PUBLISHABLE_KEY`
- Owner provisioning: configure at least one trusted `FISL_ADMIN_CLERK_USER_ID` or `FISL_ADMIN_EMAIL` before launch; startup reconciles stored admin roles to this allowlist.
- Merchant config: `REVOLUT_MONTHLY_LINK` enables the £5 monthly checkout; `APP_ORIGINS` can add comma-separated cross-origin web hosts.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Auth: Clerk
- Web: React 19, Vite, Wouter, TanStack Query
- Validation: Zod 4, `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/fisl-platform/` — production member and admin web app
- `artifacts/api-server/src/routes/fisl.ts` — FISL API behavior and authorization
- `artifacts/api-server/src/lib/seed.ts` — deterministic initial course and lesson seed
- `lib/db/src/schema/fisl.ts` — Drizzle schema
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/api-client-react/` and `lib/api-zod/` — generated clients and validators

## Architecture decisions

- Revolut payment links are checkout only; members submit a reference and an admin must approve it before access starts.
- Active access is derived from an unexpired subscription, not only from a cached member status.
- Admin access is explicitly provisioned with `FISL_ADMIN_CLERK_USER_ID` or `FISL_ADMIN_EMAIL`; ordinary signups always start unpaid.
- Video playback remains unavailable until a protected provider is connected; public stream URLs are never returned.
- OpenAPI is authoritative: regenerate both the React client and server Zod validators after contract changes.

## Product

- Public FISL marketing and Clerk account flows
- Member dashboard, 10-lesson AI pathway, progress, lesson comments, and discussions
- £5 monthly GBP Revolut membership confirmation
- Admin metrics, payment review queue, and lesson publishing controls

## User preferences

- Bold, energetic technology-community positioning without emojis.
- Subscription prices and revenue are presented in British pounds.

## Gotchas

- Run API code generation before frontend/server typechecks when changing `openapi.yaml`.
- The root recursive build includes the design mockup artifact, whose Vite config requires workflow-injected `PORT`; build FISL directly for production checks.
- Do not expose a stored video provider URL from lesson responses; use an entitlement-checked signed handoff when video is connected.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
