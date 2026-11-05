# Phase 2 design: PostgreSQL/Prisma → MongoDB + Mongoose

**Status:** proposed, for owner approval before any Phase 2 code. **Written:** 6 Nov 2026 (branch `phase-2a-mongodb-design`).
**Implements:** D-001 (MongoDB), D-002 (Mongoose via `@nestjs/mongoose`); exit criteria in `CLAUDE.md` §12.6 and `docs/audit-and-roadmap.md` Phase 2.

**Markers:** **[V]** verified by reading the cited file on this branch. **[A]** assumption or recommendation not yet verified by running anything.

---

## 0. Scope and constraints

- Port only. No new features, no API changes visible to the frontend except id format (UUID → 24-hex ObjectId string). **[V]** the client treats ids as opaque strings (no UUID checks in `client/src`).
- Every dev and test workflow runs without Docker (D-004). Tests use `mongodb-memory-server` (replica set). Dev uses Atlas M0.
- Package names stay the same. `@amp/database` keeps its name and gets new contents.
- Version note **[V]**: `server/api/package.json` uses NestJS `^11`. D-007 and the audit say "NestJS 10"; the docs should be corrected in 2d.

## 1. Collection map (31 Prisma models)

Common to every collection: `_id: ObjectId`, explicit `collection` name, `timestamps` where Prisma had `createdAt`/`updatedAt`, `versionKey: false`, and nullable fields declared with `default: null` so JSON responses keep the same keys (`deletedAt: null` etc.). Enums become `String` with an `enum` validator holding the same values. Foreign keys become `ObjectId` references. Free-form Json becomes `Mixed`, always validated by the existing Zod schema before writing. Small, stable Json shapes become typed subdocuments.

| # | Prisma model | Collection | Field and type changes |
|---|---|---|---|
| 1 | User | `users` | none beyond ids |
| 2 | Session | `sessions` | `familyId` stays a UUID **string** (made by `randomUUID()` in `auth.service.ts`, not a foreign key) |
| 3 | PasswordResetToken | `passwordResetTokens` | — |
| 4 | EmailVerificationToken | `emailVerificationTokens` | — |
| 5 | Organization | `organizations` | — |
| 6 | Membership | `memberships` | — |
| 7 | Invitation | `invitations` | — |
| 8 | Brand | `brands` | `colors`, `fonts` → `[String]`; `guidelines` → `Mixed` (Zod `record`) |
| 9 | Product | `products` | `price`, `salePrice` `Decimal(12,2)` → **`priceMinor`, `salePriceMinor` Int** (hundredths) + `currency`; `features` → `[String]`; `attributes` → `Mixed` (record of primitives); `analysis` → `Mixed` (`productAnalysisSchema` + `confirmedAt/By`, `sourceJobId`) |
| 10 | ProductImage | `productImages` | — |
| 11 | Campaign | `campaigns` | `platforms` → `[String enum]`; `offerDetails`, `strategy` → `Mixed` (`marketingStrategySchema`) |
| 12 | PromptTemplate | `promptTemplates` | global (not tenant data) |
| 13 | AIJob | `aiJobs` | `inputData`, `outputData` → `Mixed`, Zod-validated per `jobType` |
| 14 | ContentAsset | `contentAssets` | `contentData` → `Mixed` (`channelContentSchema`); `previousId` → ObjectId |
| 15 | Design | `designs` | `editorState` → `Mixed` |
| 16 | MediaAsset | `mediaAssets` | — |
| 17 | MarketingKit | `marketingKits` | `items` → typed subdocs `[{ type: 'content'\|'design', id: ObjectId, platform }]`, capped by validator |
| 18 | SocialAccount | `socialAccounts` | token ciphertext fields `select: false` |
| 19 | OAuthState | `oauthStates` | — |
| 20 | PublishingJob | `publishingJobs` | — |
| 21 | PublishingLog | `publishingLogs` | **adds `organizationId`** (tenant rule §12.6); `responseData` → `Mixed` |
| 22 | Plan | `plans` | `entitlements` → typed subdoc `{ seats, brands, products, connectedAccounts }` (keys from `seed.ts`) |
| 23 | CreditCost | `creditCosts` | — |
| 24 | Subscription | `subscriptions` | — |
| 25 | CreditAccount | `creditAccounts` | `organizationId` was the PK → unique field |
| 26 | CreditTransaction | `creditTransactions` | append-only |
| 27 | CreditReservation | `creditReservations` | `referenceId` stays a string (holds an AIJob id or a test ref such as `ref-1`) |
| 28 | WebhookEvent | `webhookEvents` | `payload` → `Mixed` |
| 29 | BulkImportBatch | `bulkImportBatches` | — |
| 30 | BulkImportRow | `bulkImportRows` | **adds `organizationId`**; `rawData` → `Map<string,string>`; `errors` → `[{ field, message }]` |
| 31 | AuditLog | `auditLogs` | `metadata` → `Mixed` |

**Embedding: none of the 31 models is embedded.** The only embedded data is the value objects in the table (arrays and Json fields). Candidates I considered and rejected:

| Candidate | Why it stays a collection |
|---|---|
| ProductImage in Product | Has its own id in API routes, globally unique `storageKey`; REJECTED rows aren't capped (only non-rejected ≤ 12, `products.service.ts`) |
| BulkImportRow in Batch | Up to 1,000 rows with raw data; Phase 3 moves import to the queue with per-row updates |
| PublishingLog in PublishingJob | One entry per attempt or webhook, so it can grow without limit |
| CreditAccount in Organization | Frequently written document; keeps credit write conflicts off the org document |
| Membership in User/Org | Queried from both sides (`listForUser`, `listMembers`) |

**Unused today [V]:** Design, MediaAsset, MarketingKit, SocialAccount, OAuthState, PublishingJob, PublishingLog and WebhookEvent aren't used by any service (schema only). Recommendation: define their schemas and indexes anyway so the design isn't lost when `schema.prisma` is deleted. They have no services and no tests.

## 2. Indexes

T = tenant collection, so the compound index starts with `organizationId`. Partial unique indexes are needed where Prisma had a nullable `@unique`: PostgreSQL allows many NULLs, but a MongoDB unique index would treat every missing value as one duplicate.

| Collection | Unique | Query / TTL |
|---|---|---|
| users | `{email}` | — |
| sessions | `{tokenHash}` | `{userId}`, `{familyId}`; TTL on `expiresAt` with a grace period (Q4) |
| passwordResetTokens, emailVerificationTokens | `{tokenHash}` | `{userId}`; TTL `expiresAt` (expired and missing tokens already give the same 400 message **[V]**) |
| organizations | `{slug}` | — |
| memberships (T) | `{organizationId, userId}` | `{userId, createdAt}` |
| invitations (T) | `{tokenHash}` | `{organizationId, status, createdAt}`, `{organizationId, email, status}`, `{email}`; **no TTL** (expired invitations are marked EXPIRED and get their own message) |
| brands (T) | — | `{organizationId, deletedAt, createdAt}` |
| products (T) | `{organizationId, slug}`; `{organizationId, sku}` **partial `sku: {$type:'string'}`** | `{organizationId, status, updatedAt}`, `{organizationId, brandId}` |
| productImages (T) | `{storageKey}` | `{organizationId, productId, status, position}` |
| campaigns (T) | — | `{organizationId, productId}` |
| promptTemplates | `{key, version}` | — |
| aiJobs (T) | — | `{organizationId, status}`, `{organizationId, createdAt}`, `{organizationId, productId, createdAt}` |
| contentAssets (T) | — | `{organizationId, productId, campaignId, platform, status}`, `{organizationId, platform, createdAt}` |
| designs, marketingKits, mediaAssets (T) | `mediaAssets {storageKey}` | `{organizationId, productId}` / `{organizationId, campaignId}` / `{organizationId, designId}` |
| socialAccounts (T) | `{organizationId, platform, externalAccountId}` | — |
| oauthStates | `{state}` | TTL `expiresAt` |
| publishingJobs (T) | `{idempotencyKey}` | `{organizationId, status}`, `{scheduledAt}` partial `status: 'SCHEDULED'` (scheduler scan, system scope) |
| publishingLogs (T) | — | `{organizationId, publishingJobId, createdAt}` |
| plans | `{code, effectiveFrom}` | — |
| creditCosts | `{jobType, effectiveFrom}` | — |
| subscriptions (T) | `{providerReference}` **partial (string)** | `{organizationId, status, startsAt}` |
| creditAccounts (T) | `{organizationId}` | — |
| creditTransactions (T) | `{idempotencyKey}` (global, as today) | `{organizationId, createdAt}`, `{organizationId, type}` |
| creditReservations (T) | `{referenceId}` (global, as today) | `{organizationId, status}` |
| webhookEvents | `{provider, eventId}` | — |
| bulkImportBatches (T) | — | `{organizationId, createdAt}` |
| bulkImportRows (T) | `{organizationId, batchId, rowNumber}` (same as Prisma's `{batchId,rowNumber}`, since batchId is globally unique) | — |
| auditLogs (T, nullable org) | — | `{organizationId, createdAt}` |

`autoIndex` is on in development and test and off in production. In production, indexes are created by migration `0001` (§7).

## 3. Tenancy and injection

**Repository helper** (`@amp/database`, used by every tenant-owned service):

```ts
class TenantRepo<T> {
  find(t: TenantContext, filter: TenantFilter<T>, opts?)   // → { ...filter, organizationId: t.organizationId }
  findById(t, id) / exists / count / updateById(t, id, update) / deleteById(t, id)
  create(t, data)                                           // organizationId always set from t
}
type TenantFilter<T> = Omit<FilterQuery<T>, 'organizationId'>;
```

- `organizationId` is applied **last**, so a caller's filter can't override it. Updates strip `organizationId` from `$set`. An update or delete that matches nothing returns `null`, and the service throws 404, as `findFirst` + 404 does today.
- **Second layer:** a Mongoose plugin on tenant schemas with `pre` hooks for find, update, delete, count and aggregate (checking the first `$match`). It throws if the filter has no `organizationId`, unless the query passes `{ systemScope: true }`. That option is only for the worker and credit service, where scope comes from a trusted job or reservation document. Lint rule: `@InjectModel` of tenant models is allowed only in repository files.
- `TenantGuard` keeps its behaviour. Only the id regex changes (UUID → `/^[0-9a-f]{24}$/i`) and the Prisma relation filter becomes two lookups: membership `{userId, organizationId}`, then organisation `{_id, deletedAt: null}`.

**Injection:**

| Control | Where |
|---|---|
| Zod-parse every body, param and query before querying | `ZodPipe` (`server/api/src/common/zod.ts`). Add Zod query schemas for list endpoints, which today read `q.brandId`, `q.productId`, `q.search` and `q.status` raw **[V]** |
| Reject `$`-prefixed keys at any depth (and `.` in free-form record keys) | in `ZodPipe` before parse; also on `guidelines`/`attributes` records |
| ObjectId params | `ParseObjectIdPipe` replaces every `ParseUUIDPipe` (5 controller files: ai, brands, content, products, organizations **[V]**); shared `objectIdSchema` replaces `z.string().uuid()` in `shared/validation` (6 uses **[V]**) |
| Search | `$regex` built from an **escaped** string, `i` flag, max 200 characters (today: Prisma `contains`, case-insensitive) |
| Express 5 query parser | "simple" by default, so no nested objects; arrays are still possible, and Zod rejects them **[A: confirm `query parser` isn't overridden]** |

`mongoose.set('sanitizeFilter', true)` was considered and rejected: it would also wrap our own operators (`$in`, `$ne`) unless every one is marked `trusted()`. Use `strictQuery: true`.

**Same-tenant reference checks (what foreign keys used to enforce):**

| Write | Reference | Check (existing **[V]** unless noted) |
|---|---|---|
| Product create/update, CSV import | `brandId` | `brands.get(t, brandId)` |
| Image request/confirm | `productId` | `products.get(t, …)`, image filter includes org + product |
| AI job | `productId`, `campaignId` | `ensureProduct`, `ensureCampaign` (org + product) |
| Content asset, campaign strategy (worker) | from the job document | filter by `job.organizationId` (not the queue payload) |
| Reservation | `referenceId` | org mismatch throws (`credits.ts`) |
| Membership/invitation | user from JWT, org from invitation | unchanged |

**Cascades [V]:** the only hard deletes are `membership.delete` and `productImage.delete`. Organisations and brands are soft-deleted, and products are archived. No current flow depends on a database cascade. Future hard deletes must cascade in the service, with a test.

## 4. Transactions and the credit ledger

MongoDB transactions need a **replica set**. Atlas M0 is one, and `mongodb-memory-server` runs as `MongoMemoryReplSet`. Use `connection.transaction(fn)` (Mongoose; retries `TransientTransactionError`) with `readConcern: 'snapshot'`, `writeConcern: 'majority'`. Never send mail, write audit logs or enqueue jobs inside a transaction callback, because it can run more than once.

**Every `$transaction` today [V] and its replacement:**

| Place | Today | MongoDB |
|---|---|---|
| `credits.ts` reserve, settle, release, grant, reconcile | interactive, `FOR UPDATE` | session transaction + conditional updates (below) |
| `organizations.create` | org + OWNER membership + credit account + subscription + grant | one session transaction (plan lookup stays outside) |
| `organizations.acceptInvitation` | membership upsert + invitation ACCEPTED | transaction: `updateOne($setOnInsert, upsert)` + invitation update filtered on `status: 'PENDING'` |
| `auth.resetPassword` | user + token used + revoke sessions | transaction; token claim filtered on `usedAt: null` |
| `auth.verifyEmail` | user + token used | transaction; same claim |
| `content.edit` | archive old + create version | transaction |
| `products.list`, `ai.listJobs` | batched read (find + count) | `Promise.all(find, countDocuments)`; no transaction (counts may differ by one under concurrent writes; acceptable) |
| `seed.ts` | account + seed grant | transaction |

Not a transaction today: refresh-token rotation uses a conditional `updateMany` (`rotatedAt: null, revokedAt: null`). It ports to `updateOne` with the same filter and a `modifiedCount === 1` check. (The audit's "token rotation uses transactions" is inaccurate.)

**Credit ledger** (same exported functions, `db` handle instead of `PrismaClient`):

| Function | Inside one transaction |
|---|---|
| `reserve(org, ref, n)` | 1) reservation `{referenceId}` exists → org check, return it (idempotent). 2) `ensureAccount` = `updateOne({organizationId}, {$setOnInsert:{balance:0,reserved:0}}, {upsert})`. 3) `findOneAndUpdate({ organizationId, $expr: { $gte: [{ $subtract: ['$balance','$reserved'] }, n] } }, { $inc: { reserved: n } })`. 4) `null` → read account → throw `InsufficientCreditsError(available, n)`. 5) insert reservation (unique `referenceId`) |
| `settle(ref, used)` | load reservation; not RESERVED → return (idempotent). Claim `{_id, status:'RESERVED'}` → SETTLED, `settledAmount = min(used ?? amount, amount)`. `$inc {reserved: -amount, balance: -charge}` → `balanceAfter` from the returned doc. If charge > 0, insert DEBIT with `idempotencyKey: settle:<ref>` |
| `release(ref)` | claim RESERVED → RELEASED, `settledAmount: 0`; `$inc {reserved: -amount}` |
| `grant(org, n, key)` | existing `idempotencyKey` → return it. `ensureAccount`; `$inc {balance: n}` with filter `balance >= -n` when n < 0; insert transaction. E11000 on the key → return the existing entry |
| `reconcile(org)` | aggregate the ledger sum and RESERVED holds (snapshot), compare, `$set` on drift |
| `getCreditSummary` | plain read |

The upsert in step 2 is kept separate from the conditional update in step 3 on purpose. If step 3 had `upsert`, a failed balance filter would insert a second account document.

**Why the overdraw test still proves no overdraft** (`ai-credits.e2e.spec.ts`, 10 concurrent reservations of 3 against 20 credits, expects 6 succeed and 4 fail with `InsufficientCreditsError`):

1. The balance check and the increment are one atomic document update. A reservation that would make `balance − reserved < 0` matches no document.
2. Every reservation writes the same `creditAccounts` document, so two concurrent transactions conflict. The loser aborts with a transient write conflict and `connection.transaction` retries it against the committed state.
3. `InsufficientCreditsError` is not transient, so it aborts the transaction and reaches the caller unchanged. The test's `instanceof` assertion holds.
4. Reconcile also writes the account document, so it can't interleave with a reservation either.

## 5. API compatibility

| Concern | Design |
|---|---|
| Ids | `_id` → `id` (hex string) in one schema-level `toJSON`/`toObject` transform. References are serialised as strings. Responses go through this transform; `.lean()` only for internal reads |
| Relation includes and `_count` | Rebuilt explicitly with a second batched query (`$in`) or `$lookup`. Kept exactly: products list `brand {id,name}` + first UPLOADED image; product detail all UPLOADED images; brands `_count.products` (all statuses; used by `client/src/app/(app)/brands/page.tsx` **[V]**); org `_count {memberships, brands, products}` (includes soft-deleted and archived, as Prisma counts today) |
| Nullable keys | `default: null` keeps `deletedAt: null`, `price: null` etc. present |
| Price format | **Keep the current API format** (a decimal string, or `null`) and convert at the boundary with a shared `money.ts` using integer arithmetic only. The API accepts a number (`moneySchema`) → `Math.round(n*100)`. The API returns a string: **[V]** `products.e2e.spec.ts` expects `price: '1999'`, `salePrice: '1499'` (no trailing `.00`). **[A]** fractional output such as `'24.5'` (decimal.js style); record it on `main` before 2c and pin it in a test. The pipeline's `ProductContext.price` uses the same formatter |
| Sort order | Content list sorts by `platform` asc: PostgreSQL sorts enums by **declaration order**, MongoDB sorts strings alphabetically. Use `$indexOfArray(PLATFORMS, '$platform')` so the order is unchanged. Add `_id` as a tie-breaker on `updatedAt`/`createdAt` sorts |
| Errors | New `MongoExceptionFilter` replaces `PrismaExceptionFilter`: code **11000 → 409** `A record with this <keyPattern fields> already exists` (field names only, never `keyValue`); **CastError / invalid ObjectId → 400** `Invalid id`; `DocumentNotFoundError` → 404; anything else → 500 logged. P2025/P2003 paths become explicit `null` checks → 404, as today. The CSV import catch maps 11000 to `'Duplicate product'` |
| Health | `GET /api/v1/health` keeps `{ status, checks: { database, redis } }`; database = `readyState === 1` and `admin().ping()` with a short `maxTimeMS` |
| OpenAPI | `docs/api/openapi.json` regenerated (id formats change from uuid to ObjectId pattern) |
| Env | `DATABASE_URL` → `MONGODB_URI` (Zod: `mongodb://` or `mongodb+srv://`), in API, worker, seed and Playwright. The URI is never logged |

## 6. Testing

**Counts [V] (from the spec files): 35 API e2e tests** (auth 11, tenancy 9, ai-credits 8, products 5, docs 2) + 5 db-guard unit + 16 pipeline + 13 `ai.test.ts` + 6 validation. All are ported and **none deleted**. Test names and assertions stay the same; only the database calls change (`prisma.x.findUniqueOrThrow` → model lookups; `processAiJob(prisma…)` → `processAiJob(store…)`).

| Item | Design |
|---|---|
| Database | Jest `globalSetup` starts `MongoMemoryReplSet` (1 node, wiredTiger, MongoDB version pinned to match Atlas) and sets `MONGODB_URI` to `…/marketing_platform_test?replicaSet=…`; `globalTeardown` stops it. If `MONGODB_URI` is already set (local mongod on macOS), that is used instead. No Docker; works on Windows |
| Binary | Downloaded once to the cache on first run (needs internet; CI caches it). `MONGOMS_SYSTEM_BINARY` for offline machines |
| `_test` guard | `db-guard.ts` stays: it checks `MONGODB_URI`'s path (works for `mongodb://` and `mongodb+srv://`; unparseable multi-host URIs fail closed). The second check uses `connection.db.databaseName`, which also catches a `dbName` override. The 5 guard tests are kept, with MongoDB example URIs |
| `resetDb` | Guard, then `deleteMany({})` on every registered model (**not** `dropDatabase`, which would drop the unique indexes the 409 tests rely on). Indexes are built once per run (`createIndexes`), then plan and credit costs are re-inserted as today |
| Pipeline fake | `processAiJob` depends on a small `PipelineStore` interface (get/claim job, load product context, archive drafts, create asset, progress, cancel check, complete/requeue/fail, settle/release). The Mongoose implementation lives in `@amp/database`; `pipeline.test.ts` fakes the interface instead of mimicking Prisma. Same 16 tests and assertions. This also keeps `@amp/ai` free of Mongoose |
| CI (`.github/workflows/ci.yml`) | Remove the `postgres` service, `db:generate` and `db:deploy`. Add a mongodb-binaries cache, `pnpm db:migrate --dry-run` + `db:migrate` against a memory server (schema gate). Playwright: a background step starts the memory replica set (script `pnpm db:memory`, also usable in a second terminal on Windows) and exports `MONGODB_URI`; the `playwright.config.ts` guard switches to `MONGODB_URI` |
| Additions (allowed) | Credit-ledger tests in `@amp/database` (2b), a tenant-plugin test (unscoped query throws), and response-shape tests for `id`, `_count` and price format |

## 7. Migrations and seed

- **No data migration from PostgreSQL.** **[V]** There is no production or staging environment (audit §3.11: Vercel, AWS and Atlas not configured; Phase 6 not started). Neon is development-only and is deleted after Phase 2 (D-005). Development data is re-created with the seed. **[A]** The owner confirms nothing on Neon needs keeping (Q3).
- **Migration runner** (small, in-repo, no new dependency): `server/database/migrations/NNNN-name.ts` exporting `up`/`down`; applied versions recorded in a `_migrations` collection; `--dry-run` prints planned index and collection changes without writing; refuses `down` when `NODE_ENV=production` unless explicitly confirmed. `0001-init`: create collections and all indexes from §2.
- **Seed:** `seed.ts` ported one-for-one with upserts on the same natural keys (plan `code+effectiveFrom`, cost `jobType+effectiveFrom`, prompt `key+version`, user email, org slug, membership, product `organizationId+slug`). `price '2499.00'` → `priceMinor: 249900`. It still refuses `NODE_ENV=production` and stays idempotent. Run with `tsx` (no decorators).

## 8. Delivery plan

The main session creates each branch. Every PR ends with qa-testing, code-reviewer and security-engineer (§12.8).

| PR | Contents | Exit criteria | Agents |
|---|---|---|---|
| **2b** data layer | `@amp/database/mongo` alongside Prisma (not yet wired in): 31 schemas + §2 indexes, connection helper, `TenantRepo` + tenant plugin, `$`-key guard, `money.ts`, credit ledger on MongoDB, migration runner + `0001`, `db:memory` script, memory-server test harness | New ledger tests pass on Windows (no Docker) and in CI, incl. concurrent overdraw, idempotency, reconcile; plugin test passes; `0001` dry-run and up succeed; the existing Prisma suite is still green; no app behaviour change | database-engineer (lead), ai-ml-engineer (credit review), qa-testing |
| **2c** port and switch | Services, guards, `ParseObjectIdPipe`, shared `objectIdSchema`, `MongoExceptionFilter`, health, worker, `PipelineStore`, seed, all tests ported, CI and Playwright on MongoDB, OpenAPI regenerated | All 35 API e2e + 5 guard + 16 pipeline + 13 ai + 6 validation + client tests pass on MongoDB; Playwright smoke green; `pnpm db:seed` works against the memory server and Atlas dev; CI has no PostgreSQL | backend-developer (lead), ai-ml-engineer (pipeline), qa-testing (test port), devops-deployment (CI, Playwright), database-engineer (seed) |
| **2d** remove Prisma, docs | Delete Prisma dependencies, `schema.prisma`, the SQL migration, `PrismaService`, the Prisma filter and `DATABASE_URL`; root scripts (`db:migrate`, `db:seed`, `db:memory`); `.env.example`, README, `docs/handover.md`, `CLAUDE.md` §12.4, roadmap; ADRs D-016 onwards in `docs/decisions.md` | Search for `prisma`/`DATABASE_URL` finds only history docs; full quality gate green; §12.6 exit criteria all met | devops-deployment, documentation-agent |

Owner actions: create the Atlas M0 dev cluster before 2c is verified. Delete the Neon project after 2d is merged.

**Proposed ADRs (added to `docs/decisions.md` in 2d once approved):** D-016 collection map and no-embedding rule; D-017 tenant repository + plugin; D-018 credit ledger on conditional updates in snapshot transactions; D-019 money as hundredths with the API keeping decimal strings; D-020 ObjectId ids serialised as `id` strings; D-021 in-repo migration runner; D-022 `mongodb-memory-server` replica set for tests and CI.

## 9. Risks and open questions

**Risks**

| Risk | Mitigation |
|---|---|
| Subtle response-shape drift (missing keys, `_id`, `_count`, price string) | single serialiser, `default: null`, added shape tests |
| Nullable unique fields (`sku`, `providerReference`) | partial unique indexes (§2) |
| No foreign keys or cascades in MongoDB | reference checks in §3; plugin; tests for each future hard delete |
| Write-conflict retries add latency under contention | fine at current scale; monitor in Phase 6 |
| 2c is a large PR | mostly mechanical; same tests act as the oracle; split by module commits |
| Memory-server binary download blocked by network | cache and `MONGOMS_SYSTEM_BINARY` |
| `@nestjs/mongoose` / Mongoose peer versions | **[A]** check the peer range for NestJS 11 at install; pin |

**Questions for the owner**

1. Approve this design and the proposed ADRs (D-016 to D-022)?
2. Atlas M0 dev cluster: please create it (AWS, `ap-south-1` if M0 is offered there, otherwise the nearest region) and put `MONGODB_URI` in your local `.env` only, never in chat. Which MongoDB version does it run? Tests will pin the same one.
3. Confirm the Neon development data is disposable (no migration).
4. Sessions currently never get deleted. Add a TTL that deletes them **30 days after `expiresAt`** (keeps refresh-token reuse detection for a month after expiry), or defer TTL on sessions to Phase 3?
5. Money: keep a fixed scale of 2 decimals for every currency (current `Decimal(12,2)` behaviour, even though `currencySchema` accepts any 3-letter code), and handle true per-currency minor units later?
6. Ids change from UUID to 24-hex ObjectId. Is there any external consumer or bookmark relying on UUIDs? None is known, since nothing is deployed.
