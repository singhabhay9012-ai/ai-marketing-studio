# AI Marketing Platform

An AI-powered marketing workspace that turns product photos and basic business details into channel-ready marketing — strategy, copy, SEO content and (soon) creatives and publishing.

This repository implements the **foundational milestone** from the production blueprint (§15 Sprint 1 and §19 "Immediate Next Milestone"), plus the AI job pipeline and credit ledger running end-to-end on a mock provider, so the paid-AI integration can be switched on once tenant-isolation tests pass (as the blueprint requires).

## What works today

| Area | Status |
|---|---|
| Monorepo (pnpm + Turbo), shared TS config, CI (typecheck · lint · test · build · audit) | ✅ |
| PostgreSQL schema v1.1 (31 tables, all blueprint entities + production extensions), migration, seed | ✅ |
| Auth: register, login, **rotating refresh tokens with reuse detection**, logout / logout-all, forgot/reset password, email verification | ✅ |
| Organisations, memberships, invitations, 5-level RBAC with "can only grant below your own role" | ✅ |
| Tenant isolation enforced by a global guard + org-scoped queries (tested) | ✅ |
| Brands (colours, fonts, voice, guidelines) and products (CRUD, search, archive) | ✅ |
| Signed upload/download via storage adapter (local driver + S3/R2/MinIO driver), magic-byte checks | ✅ |
| Bulk CSV import with per-row validation and error report | ✅ |
| AI pipeline: analysis → **human confirmation** → strategy → per-channel content, structured + validated output, versioned prompts | ✅ (mock provider; OpenAI provider written, needs key) |
| Credit ledger: reserve → settle / release, idempotent, row-locked, reconcilable | ✅ |
| Platform specification registry (9 channels) with text-limit quality checks | ✅ (values need re-verifying before launch) |
| Content versioning (edit creates v2, regeneration keeps approved work) | ✅ |
| Web app: auth flows, dashboard, brands, products, product AI workflow, team & credits settings | ✅ |
| Swagger at `/api/docs`, OpenAPI export for Postman | ✅ |
| Campaigns UI, creative studio, marketing kits/ZIP, Razorpay, publishing, analytics | Roadmap (Sprints 4–7 and later) |

## Quick start

Prerequisites: Node 22 and pnpm 10. Docker is **optional** and never required: the Windows development laptop can't run it (decision D-004 in `docs/decisions.md`).

Until roadmap phase 2 (the MongoDB port) is merged, the app runs on PostgreSQL with Prisma.

Generate each JWT secret (works in PowerShell and bash):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

### Windows (PowerShell, no Docker)

Uses hosted services: PostgreSQL on Neon (project `ai-marketing-studio`) and Redis on Upstash.

```powershell
pnpm install
Copy-Item .env.example .env
# Edit .env: DATABASE_URL = Neon direct (non-pooled) connection string with sslmode=require
# (Prisma migrations can fail through the pooler), REDIS_URL = Upstash rediss:// URL,
# STORAGE_DRIVER=local, and the JWT secrets.
Copy-Item .env packages/database/.env   # Prisma CLI reads DATABASE_URL from here
pnpm db:deploy                          # stop here if migrations fail
pnpm db:seed                            # dev only, never production. Demo login: demo@example.com / Password123!
pnpm build
pnpm dev                                # web :3000 · api :4000 · worker
```

### macOS (bash)

Use local Postgres and Redis (Homebrew), the same Neon/Upstash setup as Windows, or Docker. The `DATABASE_URL` in `.env.example` matches the Docker setup. With Homebrew Postgres, either create the same role and database or edit `DATABASE_URL` to match yours:

```bash
createuser -h localhost --createdb -P marketing_admin    # prompts for the password you put in DATABASE_URL
createdb -h localhost -U marketing_admin marketing_platform
```

```bash
pnpm install
cp .env.example .env              # then set DATABASE_URL, REDIS_URL and the JWT secrets
pnpm services:up                  # optional, Docker only: Postgres 16, Redis 7, MinIO
cp .env packages/database/.env    # Prisma CLI reads DATABASE_URL from here
pnpm db:deploy && pnpm db:seed    # seed is dev only, never production. Demo login: demo@example.com / Password123!
pnpm build
pnpm dev                          # web :3000 · api :4000 · worker
```

- App: http://localhost:3000
- API docs: http://localhost:4000/api/docs (served only when `NODE_ENV` is not `production`)
- Health: http://localhost:4000/api/v1/health

The API and worker load the root `.env` automatically (Node's `--env-file-if-exists`); in deployed environments, real environment variables are used instead.

### Running tests

Tests use a separate database, `marketing_platform_test`. **The test suite deletes and rewrites data.** The test setup renames a database called exactly `marketing_platform` to `marketing_platform_test`, and then **refuses to run unless the database name ends in `_test`** (checked again against the connected database right before tables are wiped). The error names the database only, never the connection string.

On Windows, create a separate Neon branch or database named `marketing_platform_test`, then:

```powershell
$env:DATABASE_URL = "<Neon direct connection string for marketing_platform_test>"
pnpm db:deploy    # stop here if migrations fail
pnpm test
```

With a local Postgres (macOS):

```bash
createdb -h localhost -U marketing_admin marketing_platform_test
DATABASE_URL=postgresql://marketing_admin:local_dev_password@localhost:5432/marketing_platform_test pnpm db:deploy
pnpm test
```

What `pnpm test` runs:

- `apps/api`: 35 end-to-end tests over real HTTP and Postgres, plus 5 unit tests for the test-database guard.
- `apps/web`: 36 Vitest + React Testing Library tests (API client, login, register, products list, `useApi`). No database needed.
- `packages/ai`: 29 unit tests (mock provider, prompts, job pipeline credits with an in-memory fake). Fails if no tests are found.
- `packages/validation`: 6 unit tests.

#### End-to-end smoke test (Playwright)

Registers a user, creates a brand and a product, and checks the product is listed, against the **built** API and web app. It refuses to start unless `DATABASE_URL` is set in your shell and names a `*_test` database; it never falls back to `.env`. Redis must be reachable (`REDIS_URL`), and the web app must have been built with `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`. Stop `pnpm dev` first: the test starts its own servers on ports 4000 and 3000 and fails rather than reuse a running one, which could be connected to your development database.

```powershell
$env:DATABASE_URL = "<Neon direct connection string for marketing_platform_test>"
pnpm build
pnpm exec playwright install chromium   # first time only
pnpm test:e2e
```

```bash
export DATABASE_URL=postgresql://marketing_admin:local_dev_password@localhost:5432/marketing_platform_test
pnpm build
pnpm exec playwright install chromium   # first time only
pnpm test:e2e
```

CI runs all of the above on every pull request; the Playwright report is uploaded when it fails.

The API suite covers auth and token rotation, cross-tenant access, role hierarchy, invitations, signed uploads, bulk import, AI job lifecycle, and credit reserve/settle/release including retry, failure, cancellation and concurrent overdraw attempts.

## Layout

```
apps/
  api/        NestJS REST API (/api/v1)
  worker/     BullMQ consumers (ai-analysis, ai-content, image-generation)
  web/        Next.js 15 app
packages/
  database/   Prisma schema, migrations, seed, credit ledger
  ai/         Provider interface, mock + OpenAI providers, prompts, job pipeline
  validation/ Zod schemas shared by web and API, platform spec registry
  shared-types/
  config/     Base tsconfig
infra/docker/ docker-compose (local services) and multi-target Dockerfile
docs/         Architecture, API (openapi.json), handover notes
```

## Key conventions

- **Every org-owned route** uses `@RequireRole(...)`; the guard resolves the organisation from `x-organization-id` (or `:organizationId`), checks membership in the database, and exposes it via `@Tenant()`. Services always filter by `tenant.organizationId`. Never take an organisation id from a request body.
- **Validation** is a single Zod schema per input, used by both the web form and the API. Unknown fields are rejected.
- **Vendors are behind interfaces**: `StorageProvider`, `AiProvider`, `MailService`. Swap by config (`STORAGE_DRIVER`, `AI_PROVIDER`).
- **Prices, plan limits and credit costs are data** (`Plan`, `CreditCost` tables with `effectiveFrom`), never constants.
- **AI output is structured and validated** before storage; prompt version, provider and model are recorded on each `AIJob`. Keyword ideas are labelled `ai-suggestion`, never presented as search-volume data.

See `docs/handover.md` for decisions, known gaps and next steps.
