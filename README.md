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

Prerequisites: Node 22, pnpm 10, Docker.

```bash
pnpm install
cp .env.example .env              # then set JWT secrets: openssl rand -base64 48
pnpm services:up                  # Postgres 16, Redis 7, MinIO
cp .env packages/database/.env    # Prisma CLI reads DATABASE_URL from here
pnpm db:deploy && pnpm db:seed    # demo login: demo@example.com / Password123!
pnpm build
pnpm dev                          # web :3000 · api :4000 · worker
```

- App: http://localhost:3000
- API docs: http://localhost:4000/api/docs (served only when `NODE_ENV` is not `production`)
- Health: http://localhost:4000/api/v1/health

The API and worker load the root `.env` automatically (Node's `--env-file-if-exists`); in deployed environments, real environment variables are used instead.

### Running tests

Tests use a separate database, `marketing_platform_test`:

```bash
createdb -h localhost -U marketing_admin marketing_platform_test
DATABASE_URL=postgresql://marketing_admin:local_dev_password@localhost:5432/marketing_platform_test pnpm db:deploy
pnpm test
```

The API suite (33 end-to-end tests over real HTTP and Postgres) covers auth and token rotation, cross-tenant access, role hierarchy, invitations, signed uploads, bulk import, AI job lifecycle, and credit reserve/settle/release including retry, failure, cancellation and concurrent overdraw attempts.

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
