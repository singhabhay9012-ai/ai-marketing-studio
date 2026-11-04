# Developer handover notes

## Request flow

```
Browser (Next.js) ──HTTPS──▶ NestJS API ── ThrottlerGuard → JwtAuthGuard → TenantGuard → controller → service
                                   │ Prisma ▶ PostgreSQL
                                   │ BullMQ ▶ Redis ──▶ worker ▶ @amp/ai pipeline ▶ AiProvider
                                   │ StorageProvider ▶ local disk | S3 / R2 / MinIO (signed URLs)
```

## Auth model

- Access token: JWT, 15 min, `typ: access`, sent as `Authorization: Bearer`. Held in memory by the web app.
- Refresh token: random 48 bytes, stored **hashed** in `Session`, sent as an httpOnly `SameSite=Strict` cookie scoped to `/api/v1/auth` (or in the body for non-browser clients).
- Each refresh rotates the token. Presenting a rotated token revokes the whole token family (theft detection). Password reset revokes all sessions.
- Login uses a dummy bcrypt comparison for unknown emails, so response timing doesn't reveal which accounts exist.
- The cookie needs web and API on the same registrable domain (e.g. `app.example.com` and `api.example.com`).

## Roles

`OWNER > ADMIN > MANAGER > EDITOR > VIEWER`. You can only grant or manage roles strictly below your own; the owner can grant ADMIN. Ownership can't be invited, and the owner can't be removed.

| Action | Minimum role |
|---|---|
| Read anything in the org | VIEWER |
| Create/edit products, upload images, run AI | EDITOR |
| Create/edit brands, archive products | MANAGER |
| Delete brands, invite, manage members, rename org | ADMIN |
| Delete organisation | OWNER |

## Credits

`available = balance − reserved`. `reserveCredits` locks the `CreditAccount` row (`SELECT … FOR UPDATE`) and creates a `CreditReservation` keyed by the AIJob id. Then either `settleCredits` (writes an immutable DEBIT to `CreditTransaction`) or `releaseCredits` runs. All three are idempotent. `reconcileCredits` rebuilds the cached balance from the ledger. Run it on a schedule and alert on drift.

## AI pipeline

`POST /ai/product-analysis` → job QUEUED + credits held → worker runs `processAiJob` → output validated with Zod → COMPLETED + settled. The user reviews it in the UI and confirms via `POST /ai/product-analysis/:jobId/confirm`. Content generation is refused until a confirmed analysis exists. Retryable provider errors (429/5xx/timeouts/invalid JSON) back off up to 3 attempts while credits stay held. A final failure marks the job FAILED and releases the credits.

To use OpenAI, set `AI_PROVIDER=openai` and `OPENAI_API_KEY`. Vision input needs `STORAGE_DRIVER=s3`, because providers can't reach local files. Prompts live in `packages/ai/src/prompts.ts`; bump `version` on every change.

## Known gaps and next steps (in roadmap order)

1. **Sprint 3 polish:** move prompt templates fully to the `PromptTemplate` table, add per-workspace job quotas and timeouts, and add an evaluation set for the analysis prompt.
2. **Sprint 4 — Campaigns:** CRUD endpoints for `Campaign` (the schema and strategy jobs already support it) and the `/campaigns` UI.
3. **Sprint 5 — Creative studio:** an `ImageProvider` interface, a Fabric.js editor storing `Design.editorState`, and server-side rendering to `MediaAsset`.
4. **Sprint 6 — Marketing kits:** an `exports` queue processor that builds ZIPs (add a ZIP library such as `archiver` then; it was removed in phase 0 because it was unused and v7 pulled in vulnerable `glob`/`minimatch`, and v8 is ESM-only) and returns signed URLs that expire.
5. **Sprint 7 — Bulk & billing:** move large imports to the `bulk-import` queue, add image URL mapping, a `PaymentProvider` interface with Razorpay checkout, verified webhooks (`WebhookEvent` table already exists) and monthly credit grants.
6. **Hardening:** PostgreSQL RLS as defence in depth, a real email provider, upload malware scanning, Sentry/OTel, backups with a tested restore, and a load test.
7. **Platform specs:** every `verifiedAt` in `packages/validation/src/platform-specs.ts` is `null`. Verify against current platform documentation before launch.

## Gotchas

- Nest's dependency injection needs decorator metadata, so run the API with the Nest CLI (`pnpm --filter @amp/api dev`), not `tsx`/esbuild.
- Tests set `THROTTLE_DISABLED=true`. The rate-limit test switches it off to prove limits work. Never set it in a deployed environment; it's also ignored unless `NODE_ENV=test`.
- `pnpm db:migrate` creates migrations. Review the generated SQL before committing. Use `pnpm db:deploy` in staging and production.
