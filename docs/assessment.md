# AI Marketing Studio — Codebase Assessment vs Revised Blueprint

Assessed: 4 Nov 2026 · Updated: 5 Nov 2026 · Blueprint: `docs/blueprint.md`

> **Update, 5 Nov 2026:** The database is moving from PostgreSQL/Prisma to MongoDB/Mongoose (`docs/decisions.md` D-001, D-002).
> That migration now comes **before** Phase 1.5. Table names below refer to the current Prisma schema; each becomes a
> MongoDB collection.

## 1. Verification performed

Ran on a clean environment (Node 22, pnpm 10, PostgreSQL 16, Redis 7):

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | Pass |
| Prisma migrate deploy (`init_v1_1`) | Pass |
| `pnpm typecheck` (11 tasks) | Pass |
| `pnpm lint` | Pass |
| `pnpm test`: 33 API e2e tests over real HTTP + Postgres, plus validation tests | 33/33 pass |
| `pnpm build` (web, api, worker, packages) | Pass |

Not verified: OpenAI provider with a real key, S3/R2 storage driver, Docker images, UI flows in a browser.

## 2. What exists and works

- Monorepo: Next.js 15 web, NestJS API, BullMQ worker, shared packages (database, ai, validation, shared-types), CI workflow.
- Auth: register, login, rotating refresh tokens with reuse detection, logout/logout-all, password reset, email verification.
- Organisations, memberships, invitations, 5-level role hierarchy (OWNER > ADMIN > MANAGER > EDITOR > VIEWER), tenant guard on every org route (tested).
- Brands (colours, fonts, voice, audience, guidelines) and products (CRUD, search, archive, images with signed uploads, CSV bulk import with row-level errors).
- AI pipeline: product analysis → human confirmation → strategy → per-channel content; Zod-validated structured output; versioned prompts (in code); mock + OpenAI providers behind an interface.
- Credit ledger: reserve → settle/release, idempotent, row-locked, reconcilable.
- Content versioning (edits create new versions; approved work survives regeneration).
- Platform spec registry for 9 channels (all `verifiedAt` still null).
- Audit log writes on 25 operations.

## 3. Phase-by-phase status

| Phase | Status | Notes |
|---|---|---|
| 1 SaaS Foundation | **Mostly done, with structural gaps** | See §4; the revised blueprint changed the tenancy and role model |
| 2 AI Marketing Intelligence | **Partial** | Product-level analysis/strategy/content work on the mock provider. Missing: business/brand-level analysis, personas, content pillars, seasonal suggestions, prompts in DB (`PromptTemplate` unused) |
| 3 Content & Creative Studio | **Content backend partial; creative not started** | `Design`, `MediaAsset`, `MarketingKit` exist; no image provider, Fabric.js editor, templates or exports |
| 4 Campaigns & Social | **Schema only** | `Campaign`, `SocialAccount`, `OAuthState`, `PublishingJob/Log` exist; no campaign API/UI, no OAuth integrations |
| 5 Calendar & Approvals | Not started | No Approval/ApprovalComment/Calendar entities |
| 6 Workflow Automation | Not started | No Workflow* entities, no engine |
| 7 Engagement & Leads | Not started | No Conversation/Message/Lead entities |
| 8 Analytics & Reporting | Not started | No AnalyticsSnapshot/Report entities |
| 9 Advanced SaaS | Not started | Razorpay: `Plan`, `Subscription`, `WebhookEvent` only |

UI: 9 nav items (5 are "coming soon" placeholders) vs 16 in the blueprint.

## 4. Phase 1 gaps introduced by the revised blueprint

1. **No Workspace layer.** Blueprint: Organisation → client Workspaces, with data isolated per workspace. Today everything is scoped only by `organizationId`, so an agency would need one organisation per client. That breaks the consolidated agency dashboard, per-client credit tracking and client-viewer access.
2. **Role model is a fixed hierarchy.** Blueprint lists 8 roles (Super Admin, Owner, Admin, Marketing Manager, Content Creator, Designer, Approver, Client Viewer) with *configurable* permissions. Approver and Client Viewer don't fit a linear ladder. Needs Role/Permission entities and permission-based guards.
3. **No platform super-admin foundation** (Module 19). Admin access must be separate from workspace roles.
4. **Business/brand data incomplete.** No `Service` entity. Brand lacks website URL, location, contact details, target markets, preferred languages, competitors, industry/category.
5. **Email is a logging stub.** Verification, password reset and invitation emails are not actually sent.
6. **Excel import not wired.** CSV works end to end; XLSX is only referenced in the validation package.

## 5. Blueprint §8 entities not yet present

Workspace, Role, Permission, Service, BrandGuideline (currently inline, acceptable), CampaignObjective, MarketingStrategy, AudiencePersona, DesignTemplate, SocialPermission, SocialPost, MarketingCalendar, Approval, ApprovalComment, Workflow, WorkflowVersion, WorkflowTrigger, WorkflowCondition, WorkflowAction, WorkflowExecution, WorkflowExecutionLog, Conversation, Message, Lead, LeadActivity, AnalyticsSnapshot, Report, Integration, AIProvider, Invoice, Notification, SupportTicket.

## 6. Plan

**Step 0: MongoDB migration** (branch `migrate-mongodb`). Port the 31 Prisma models to Mongoose, rewrite the service layer
and the credit ledger, port all 33 tests to `mongodb-memory-server`, switch CI, remove Prisma. Acceptance criteria are in `CLAUDE.md`.

**Step 1: Phase 1.5, foundation revision:**

1. Add `Workspace` (organisation-owned; type BUSINESS or CLIENT); scope brand/product/campaign/content/AI/credit data by `workspaceId` + `organizationId`; move existing data into a default workspace per org.
2. Replace the role ladder with Role/Permission collections seeded with the 8 blueprint roles; guards check permissions; keep "can't grant above your own permissions".
3. Super-admin flag/role and a minimal admin API (orgs, users, jobs, credits).
4. `Service` entity; extend Brand profile fields.
5. Real email provider behind `MailService` (e.g. Resend/SES/SMTP).
6. XLSX import.
7. Extend tests: cross-workspace isolation, client-viewer read-only, approver-only actions.

**Step 2:** complete Phase 2 (brand-level analysis, personas, content pillars, DB-stored prompts, real-provider test), then Phases 3 and 4.

## 7. Outstanding risks

- Platform specs unverified against current platform documentation.
- No malware scanning, Sentry/OTel, backups or load test yet. (PostgreSQL RLS is no longer an option after D-001; tenant isolation relies on repository helpers and tests.)
- OpenAI vision path requires S3 storage; not exercised.
- Production needs a paid MongoDB Atlas tier; the free M0 cluster is for development only.
