# CLAUDE.md — AI Marketing Studio

AI-powered marketing operations platform for small businesses and marketing agencies (multi-tenant SaaS, TechSynergia).
It is not a content generator: it plans, creates, manages, automates, publishes and analyses marketing.

## Read first

- `docs/blueprint.md`: the Revised Development Blueprint, the source of truth for scope (modules 1–19, phases 1–9, acceptance scenarios).
- `docs/assessment.md`: what is built, what is partial, what is missing.
- `docs/decisions.md`: architecture decisions. Don't reverse one without asking; add new ones there.
- `docs/handover.md`: request flow, auth model, roles, credits, AI pipeline, gotchas.

## Current priorities (in order)

1. **Migrate PostgreSQL/Prisma → MongoDB/Mongoose** (decision D-001). Branch `migrate-mongodb`. See "MongoDB migration" below.
2. **Phase 1.5: foundation revision.** Client workspaces (Organisation → Workspace), permission-based roles (the 8 blueprint roles),
   super-admin foundation, Service entity and extended brand profile, real email provider, XLSX import.
3. **Complete Phase 2** (brand-level analysis, personas, content pillars, DB-stored prompts), then Phase 3 onwards.

Don't start the next item until the current one meets its acceptance criteria. Don't add new PostgreSQL/Prisma code.

## Stack

- Monorepo: pnpm 10 + Turbo, Node 22+, TypeScript everywhere.
- `apps/web`: Next.js 15 (React) + Tailwind. `apps/api`: NestJS REST at `/api/v1`. `apps/worker`: BullMQ consumers.
- Database: **MongoDB Atlas** via **Mongoose** (target; Prisma/PostgreSQL code remains until the migration lands).
- `packages/database`: models, connection, credit ledger. `packages/ai`: provider interface, prompts, pipeline.
- `packages/validation`: shared Zod schemas + platform spec registry. `packages/shared-types`.
- Redis (BullMQ queues), S3/R2/local storage via `StorageProvider`.

## Environments

- Developers work on **Windows and macOS**. The Windows laptop has **no Docker** (its hypervisor is disabled; see `docs/decisions.md` D-004).
  Every dev and test workflow must run without Docker.
- Dev database: MongoDB Atlas (free M0 cluster for development). Connection string in `.env` as `MONGODB_URI`.
- Tests: `mongodb-memory-server` in **replica-set mode** (transactions need a replica set). No Docker or Atlas needed.
- Redis: Upstash (`rediss://…`) on Windows; local Redis or Docker on macOS.
- Give commands in both PowerShell and bash when they differ (e.g. `Copy-Item` vs `cp`).

## Commands

```bash
pnpm install
pnpm dev                          # web :3000 · api :4000 · worker
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm db:seed                      # demo login demo@example.com / Password123!
```

Run the API with the Nest CLI, not tsx/esbuild (decorator metadata). Update this section when the migration changes scripts.

## Git and GitHub workflow

1. Never commit or push to `main`. One branch per task: `migrate-mongodb`, `phase-1.5-workspaces`, `fix-credit-release`.
2. Commit in small, logical steps with clear messages. Push the branch when the task is complete and tested.
3. Open a pull request with `gh pr create` using `.github/pull_request_template.md`. Include: summary, testing performed,
   outstanding issues, any mocked or incomplete integrations.
4. **Never merge PRs, deploy, or change production data.** The owner reviews and merges.
5. Pull `main` before starting new work; the owner switches between Windows and Mac.

## Definition of done

A feature is done only when all of these work: frontend connected to a real API, backend, database models and indexes,
server-side permissions, validation, error handling, and tests (unit, API, permission and failure cases where relevant).
`typecheck`, `lint`, `test` and `build` must all pass. UI alone is never "done". Mock data only in clearly marked dev/demo code.

## Architecture rules

- **Tenancy:** every tenant-owned document stores `organizationId` (and `workspaceId` after Phase 1.5). The org comes from the
  `x-organization-id` header via `TenantGuard` and `@Tenant()`, never from a request body. All queries go through tenant-scoped
  repository helpers that always add the tenant filter. Every new collection needs a cross-tenant isolation test.
- **Validation:** one Zod schema per API input in `packages/validation`, shared by web and API. Unknown fields rejected.
  Mongoose schemas also enforce types, required fields and enums (`strict: true`).
- **Vendors behind interfaces:** `AiProvider`, `StorageProvider`, `MailService`; new ones the same way (`ImageProvider`,
  `PaymentProvider`, social integrations).
- **Long-running work goes to BullMQ** with job status, retry count, error details and idempotency keys.
- **Credits:** reserve → settle/release only through `packages/database` credit functions. Never change balances directly.
- **Prices, plan limits and credit costs are data** (`Plan`, `CreditCost` collections), never constants.
- **Audit log** every important create/modify/approve/publish action via `AuditService`.
- Structured JSON logs; no leftover `console.log` debugging.

## MongoDB rules

- IDs: Mongo `ObjectId`; expose as strings in the API. Validate incoming IDs before querying.
- Indexes: compound indexes start with `organizationId`. Declare unique constraints (e.g. membership per user+org, slug per
  org) as unique indexes. Indexes live in the model files; sync them in a script, not on every app start in production.
- Money: integer minor units (paise/cents) plus a `currency` field. No floating-point money.
- Relationships: store references by id; embed only small, bounded data owned by the parent. No unbounded arrays.
  Check that referenced documents exist and belong to the same tenant in the service layer (MongoDB doesn't enforce it).
- Multi-document changes that must stay consistent (credits, invitations, approvals) use transactions (`session.withTransaction`).
- Credit reservation: an atomic conditional update (`findOneAndUpdate` with `balance - reserved >= amount` in the filter)
  inside a transaction. Never read-then-write.
- Soft delete with `deletedAt` where the current schema does; filter it in repository helpers.
- Schema changes: write a versioned migration script in `packages/database/migrations/` for any change to existing data.

## MongoDB migration (priority 1), acceptance criteria

- All existing behaviour preserved: auth and token rotation, invitations and roles, tenant isolation, brands, products and images,
  CSV import, AI job lifecycle, content versioning, credit reserve/settle/release including concurrent overdraw attempts.
- All 33 existing API e2e tests ported and passing on `mongodb-memory-server`; no test deleted to make the suite pass.
- Seed script works; CI uses MongoDB (memory server or a `mongo` service) instead of Postgres.
- Prisma, `schema.prisma`, SQL migrations and `DATABASE_URL` removed; `.env.example`, README, `docs/handover.md` updated.
- Raise anything that can't be preserved before working around it.

## AI and marketing rules (prompts and generated output)

- Use stored brand/product context. Never invent product specs, prices, certifications, testimonials or claims.
- Structured output validated with Zod; record provider, model, prompt version, tokens and cost on each AI job.
  Bump the prompt `version` on every prompt change.
- Label assumptions and AI suggestions. Never present AI keyword ideas as search-volume data, or estimates as measured analytics.
- Content must be platform-specific; check `packages/validation/src/platform-specs.ts` (values still need verifying).
- Publishing, ad spend and outbound customer messages require explicit permission/approval. Never publish content awaiting
  approval. Don't claim an external action succeeded without the platform's confirmation.

## Security

- Never hardcode or commit secrets. `.env` is gitignored; keep `.env.example` updated with new variable names (no values).
- Encrypt OAuth/social tokens at rest (`TOKEN_ENCRYPTION_KEY`). Never send tokens or private media to the browser.
- Signed URLs for private files; validate uploads (type, size, magic bytes).
- Guard against NoSQL injection: never pass raw request objects into queries; Zod-parse first and reject `$`-prefixed keys.
- `THROTTLE_DISABLED` is for tests only.
