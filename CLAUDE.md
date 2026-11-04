# CLAUDE.md — AI Marketing Studio

AI-powered marketing operations platform for small businesses and marketing agencies (multi-tenant SaaS).
This is not a content generator: it plans, creates, manages, automates, publishes and analyses marketing.

Source of truth for scope: the Revised Development Blueprint (phases 1–9, modules 1–19).
Current state and gaps: `docs/handover.md` and the latest assessment. Update both when you finish work.

## Stack

- Monorepo: pnpm 10 + Turbo, Node 22, TypeScript everywhere
- `apps/web` Next.js 15 + Tailwind · `apps/api` NestJS REST (`/api/v1`) · `apps/worker` BullMQ consumers
- `packages/database` Prisma + PostgreSQL 16 · `packages/ai` provider interface, prompts, pipeline
- `packages/validation` shared Zod schemas + platform spec registry · `packages/shared-types`
- Redis 7 (queues), S3/R2/MinIO storage via `StorageProvider`

## Commands

```bash
pnpm install
pnpm services:up                 # Postgres, Redis, MinIO (Docker)
pnpm db:migrate                  # create a migration (review the SQL before committing)
pnpm db:deploy && pnpm db:seed   # apply migrations; demo login demo@example.com / Password123!
pnpm dev                         # web :3000 · api :4000 · worker
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Tests need the `marketing_platform_test` database (see README). Run the API with the Nest CLI, not tsx/esbuild.

## Workflow rules

1. Inspect the existing code before changing it. Don't recreate working components.
2. One branch per feature or fix (`phase-1.5-workspaces`, `fix-credit-release`). Never commit directly to `main`.
3. After each completed, tested change: commit with a clear message and push the branch. Open a PR using the template.
4. Never deploy to production, merge to `main`, or change production data without explicit approval.
5. Don't move to the next blueprint phase until the current phase meets its acceptance criteria.
6. Report incomplete or mocked integrations honestly in the PR description and `docs/handover.md`.

## Definition of done

A feature is done only when all of these work: frontend connected to a real API, backend, database migration,
server-side permissions, validation, error handling, and tests (unit/API/permission/failure where relevant),
and `typecheck`, `lint`, `test` and `build` all pass. UI alone is never "done". Mock data only in clearly
marked dev/demo code.

## Architecture conventions

- **Tenancy:** every org-owned route uses `@RequireRole(...)`; the guard resolves the org from `x-organization-id`
  and exposes it via `@Tenant()`. Services always filter by `tenant.organizationId`. Never take an org id from a
  request body. Every new tenant-owned table needs an isolation test. (Workspace scoping is being added in Phase 1.5.)
- **Validation:** one Zod schema per input in `packages/validation`, shared by web and API. Unknown fields rejected.
- **Vendors behind interfaces:** `AiProvider`, `StorageProvider`, `MailService`; add new ones the same way
  (`ImageProvider`, `PaymentProvider`, social integrations). Never couple to one provider.
- **Long-running work goes to BullMQ** with job status, retry count, error details and idempotency keys.
- **Credits:** reserve → settle/release through `packages/database/src/credits.ts`. Never deduct directly.
- **Prices, plan limits and credit costs are data** (`Plan`, `CreditCost`), never constants.
- **Schema changes only through Prisma migrations.**
- **Audit log** every important create/modify/approve/publish action via `AuditService`.
- Structured JSON logs; no `console.log` debugging left behind.

## AI and marketing rules (apply to prompts and generated output)

- Use stored brand/product context. Never invent product specs, prices, certifications, testimonials or claims.
- Structured output validated with Zod; record provider, model, prompt version, tokens and cost on `AIJob`.
  Bump the prompt `version` on every prompt change.
- Label assumptions and AI suggestions; never present AI keyword ideas as search-volume data or estimates as
  measured analytics.
- Content must be platform-specific; check limits in `packages/validation/src/platform-specs.ts`
  (values still need verifying against current platform docs).
- Publishing, ad spend and outbound customer messages require explicit permission/approval. Never publish
  content awaiting approval. Don't claim an external action succeeded without the platform's confirmation.

## Security

- Never hardcode or commit secrets; `.env` is gitignored, keep `.env.example` updated with new variable names.
- Encrypt OAuth/social tokens at rest (`TOKEN_ENCRYPTION_KEY`). Never send tokens or private media to the browser.
- Signed URLs for private files; validate uploads (type, size, magic bytes).
- `THROTTLE_DISABLED` is for tests only.
