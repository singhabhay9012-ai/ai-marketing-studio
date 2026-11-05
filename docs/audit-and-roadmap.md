# AI Marketing Studio: Repository Audit and Implementation Roadmap

**Audited:** 5 November 2026
**Standard:** `CLAUDE.md` + `.claude/rules/*.md` from *AI-Marketing-Studio-Claude-Instructions.zip* (treated as mandatory)
**Repository:** local repo `ai-marketing-platform`, branch `main`, 3 commits, clean working tree, **no Git remote yet** (GitHub repo `singhabhay9012-ai/ai-marketing-studio` exists, empty)
**Changes made during the audit:** none. Nothing was modified, deleted, restructured or pushed.
**Updated 5 Nov 2026:** Owner decisions: **keep React + Next.js for the frontend** and **keep NestJS (Node.js) for the backend** (both override the pack). Only the database port to MongoDB + Mongoose remains. **Backend hosting: AWS** (owner decision). The pack's `CLAUDE.md`, `rules/frontend.md`, `rules/backend.md` and `rules/deployment.md` need small wording changes (§4.5).

---

## 1. Executive summary

The repository is a **well-built Phase 1 foundation**. With the frontend (Next.js) and backend (NestJS) kept by owner decision, **the only stack change left is the database.**

- **What's strong:** authentication with rotating refresh tokens, organisation isolation enforced by the backend, input validation, credit accounting that can't double-charge, an AI provider abstraction with validated outputs, background jobs, 33 passing API tests and a CI pipeline. Most of this logic carries over to any stack.
- **What conflicts:** the standard requires **MongoDB + Mongoose**; the repo uses **PostgreSQL + Prisma**. Frontend (Next.js / React) and backend (NestJS / Node.js) stay as they are by owner decision.
- **What's missing:** client workspaces, the 8-role permission model, super-admin, most product modules (campaigns onward), frontend tests, end-to-end tests, ESLint, secret scanning, request IDs, deployment configuration.
- **What's broken or risky now:** 5 high-severity dependency vulnerabilities (the CI audit step doesn't fail the build), `pnpm lint` only runs the TypeScript compiler, emails are logged but never sent, and API docs are exposed in production.

**Recommendation:** port the database to MongoDB + Mongoose inside the existing NestJS backend, as one test-protected phase that keeps all existing behaviour and tests green, before building new features. Section 4 gives the reasoning; Section 6 gives the roadmap.

---

## 2. Verification performed

| Check | Result | Notes |
|---|---|---|
| `pnpm install --frozen-lockfile` | ✅ Pass | |
| `pnpm typecheck` (11 tasks) | ✅ Pass | |
| `pnpm lint` | ⚠️ Passes, but checks nothing extra | Every package's `lint` script is `tsc --noEmit` (or `prisma validate`); no ESLint |
| `pnpm test`: 33 API end-to-end tests (Jest + Supertest, real PostgreSQL) + 6 validation unit tests | ✅ 39/39 pass | Run 4 Nov on PostgreSQL 16 + Redis 7 |
| `pnpm build` (web, api, worker, packages) | ✅ Pass | |
| `pnpm audit --prod` | ❌ 11 vulnerabilities (5 high, 6 moderate) | Run 5 Nov; details in §3.6 |
| Secret scan of tracked files (API keys, private keys, DB passwords) | ✅ None found | Pattern scan only; no dedicated scanner configured |
| Frontend in a browser, OpenAI with a real key, S3/R2 storage, Docker images | ⏭️ Not run | No key or browser test harness available |

**Status key:** ✅ Complete · 🟡 Partial · ❌ Missing · 🔴 Broken / risk · 🔁 Conflicts with mandatory stack

---

## 3. Gap analysis by area

### 3.1 Technology stack (`CLAUDE.md` §3)

| Layer | Mandatory | Current | Status | Porting effort |
|---|---|---|---|---|
| Frontend | React + TypeScript (pack: Vite) | Next.js 15 (React 19) + TypeScript + Tailwind | ✅ | **Kept by owner decision.** Next.js is React; update the pack's rules to name Next.js (§4.5). |
| Backend | Node.js + TypeScript (pack: Express) | NestJS 10 (runs on Express) + TypeScript | ✅ | **Kept by owner decision.** NestJS is a Node.js framework built on Express; update the pack's rules to name NestJS (§4.5). |
| Database | MongoDB + Mongoose | PostgreSQL 16 + Prisma 6 (31 models, 1 SQL migration) | 🔁 | **Medium–high.** All queries rewritten (NestJS has official Mongoose support, `@nestjs/mongoose`); the credit ledger's row lock (`SELECT … FOR UPDATE`) replaced by atomic conditional updates in transactions; `Decimal` prices become integer paise. |
| Workers | Node.js workers, Redis + BullMQ | Node.js worker with BullMQ (3 queues) | ✅ | Keep; switch its database access. |
| Source control | GitHub | Local Git, no remote | 🟡 | Add remote and push (waiting on your go-ahead). |
| Frontend hosting | Vercel | Not configured (Dockerfile targets Next.js) | ❌ | Vercel supports Next.js natively; configure in Phase 6. |
| Backend hosting | Node.js-compatible host | Docker targets for api/worker | 🟡 | **AWS chosen** (owner decision); set up in Phase 6. |
| Database hosting | MongoDB Atlas | Neon project created 4 Nov (unused); Docker Postgres locally | 🔁 | Atlas cluster needed. Keep Neon until the database port lands, because Phases 0–1 still run on PostgreSQL (see §6). |

### 3.2 Repository structure

The requested target layout is `client/` + `server/` at the root. Current layout:

```
apps/web        → Next.js frontend
apps/api        → NestJS API
apps/worker     → BullMQ worker
packages/database, ai, validation, shared-types, config
infra/docker    → docker-compose (Postgres, Redis, MinIO) + Dockerfile
docs/           → handover, OpenAPI, blueprint, assessment, decisions
```

| Item | Status | Notes |
|---|---|---|
| `client/` and `server/` folders | ❌ | Target structure in §5. |
| Shared validation between frontend and backend | ✅ | `packages/validation` (Zod) is used by both. The target tree has no shared folder, so this needs a decision (§4.4). |
| `CLAUDE.md` at the root | 🟡 | The repo has a project-specific `CLAUDE.md` (written 5 Nov). The new pack has a different, generic one. They should be merged, not overwritten (§4.3). |
| `.claude/rules/` | ❌ | Not yet installed. |
| `README.md` | 🟡 | Accurate for the current stack; needs updating after the restructure and the database port. |

### 3.3 Frontend (`rules/frontend.md`)

| Requirement | Status | Finding |
|---|---|---|
| React + TypeScript | ✅ | Next.js 15 / React 19, kept by owner decision. |
| Reusable components; logic outside large presentation components | 🟡 | Shared `components/ui.tsx` and `lib/api.ts`, `lib/auth.tsx`, `lib/use-api.ts`. Some pages (product detail, ~370 lines) mix data logic and layout. |
| Typed API contracts and centralised API client with auth-expiry handling | ✅ | `lib/api.ts` with shared types; refresh on 401. |
| Every control performs its stated action; no fake buttons | 🟡 | Five nav items (Campaigns, Creative studio, Marketing kits, Publishing, Analytics) go to clearly labelled "coming soon" pages. They're honest but are placeholders the rule asks not to ship. |
| Loading, empty, error, success, disabled, validation states | 🟡 | Present on auth, brands, products and the AI workflow; not audited exhaustively. |
| Client and server validation | ✅ | Same Zod schemas on both sides. |
| Responsive layout | 🟡 | Mobile menu and responsive grid exist; not tested on devices. |
| WCAG 2.2 AA | 🟡 | Labels and `aria-expanded` are used; no accessibility audit or automated checks. |
| Performance (route loading, images, bundle) | 🟡 | Not measured. One raw `<img>` with lint suppression. |
| No secrets in browser code | ✅ | Only `NEXT_PUBLIC_API_URL` is public. Access tokens are held in memory. |
| Private pages not indexable; public pages have metadata | ❌ | No `robots` rules or `noindex` on dashboard pages; no sitemap or canonical URLs. Next.js supports these directly (`robots.ts`, `sitemap.ts`, per-route `metadata`). |
| Security headers | 🟡 | Set in `next.config.mjs` (X-Frame-Options, nosniff, Referrer-Policy); no Content-Security-Policy. |
| Component and journey tests | ❌ | No frontend tests at all. |

### 3.4 Backend (`rules/backend.md`)

| Requirement | Status | Finding |
|---|---|---|
| Node.js + TypeScript | ✅ | NestJS 10 on Express, kept by owner decision. |
| Separation: routes, controllers, services, models, validators, middleware | ✅ | Clean modules per domain. Several modules define their controller inside the module file (`brands`, `products`, `content`, `ai`, `billing`); `brands`, `content`, `ai` and `billing` also keep the service there. |
| Server-side validation of params, query, body, files | ✅ | Zod pipes with unknown fields rejected; UUID checks; magic-byte checks on uploads. |
| Authentication and authorisation on every protected route | ✅ | Global `JwtAuthGuard` + `TenantGuard` with `@RequireRole`; membership is checked in the database. |
| Tenant scoping; never trust browser-supplied tenant IDs | ✅ | Org ID from header/route is verified against membership; services filter by `tenant.organizationId`. **Workspace/client level missing** (§3.9). |
| Consistent responses; central error handling; no leaked internals | 🟡 | Nest's default handler plus a Prisma error filter (to be replaced by a MongoDB error filter); no stack traces leak. Response shapes aren't fully uniform (Nest defaults vs custom). |
| Rate limits, size limits, CORS, headers, timeouts | 🟡 | Throttler (global + stricter on auth), body limits (1 MB JSON, 5 MB CSV, 12 MB upload), CORS allowlist, Helmet. **No request/server timeouts.** |
| Webhook signatures and idempotency | 🟡 | `WebhookEvent` table exists; no webhook endpoints yet. AI jobs are idempotent (queue `jobId` = AI job ID). |
| Transactions for multi-record changes | ✅ | Credit ledger, invitations, token rotation use transactions. |
| Long-running work queued with a trackable status | ✅ | AI jobs go to BullMQ with status, progress, attempts, cancel endpoint. CSV import still runs inside the request (5 MB cap). |
| Structured logs with request/correlation IDs; no secrets in logs | 🟡 | Worker logs JSON. API uses Nest's text logger. **No request IDs.** No secrets found in log calls. |
| API documentation | 🟡 | Swagger + `docs/api/openapi.json`. 🔴 **Swagger is served in production too.** |
| Startup validation of environment variables | ✅ | Zod `env()` fails fast; production check on the storage secret. |

### 3.5 Database (`rules/database.md`)

| Requirement | Status | Finding |
|---|---|---|
| MongoDB + Mongoose | 🔁 | PostgreSQL + Prisma. |
| Explicit schemas, types, timestamps, tenant fields | ✅ | Every org-owned table carries `organizationId`; timestamps throughout. Carries over to Mongoose schemas. |
| Indexes on real query patterns; unique indexes for invariants | ✅ | Composite indexes and unique constraints (membership per user+org, slugs per org). |
| Tenant scoping on every query | ✅ | In services; no repository helper enforces it centrally (needed with MongoDB). |
| Pagination and bounded results | 🟡 | Products and AI jobs are paginated; brands, members and invitations aren't. |
| No unbounded arrays | ✅ | Relational model; needs care in the Mongo design. |
| Atomic updates and idempotency for credits | ✅ | Reserve → settle/release keyed by AI job ID, row-locked, reconcilable, tested under concurrent overdraw. Must be redesigned for MongoDB. |
| NoSQL injection protection | n/a now | Becomes mandatory with MongoDB (Zod-parse first, reject `$` keys, never pass raw request objects). |
| Repeatable, reversible migrations | 🟡 | Prisma migrations (forward only). Mongo needs versioned migration scripts. |
| Retention, export, deletion, backup and tested restore | ❌ | Not documented or implemented. |

### 3.6 Security (`rules/security.md`)

| Requirement | Status | Finding |
|---|---|---|
| Password hashing | ✅ | bcrypt, cost 12; dummy hash on unknown emails to prevent timing-based account discovery. |
| Token lifecycle, rotation, revocation | ✅ | 15-minute access JWT; refresh token hashed, rotated, reuse detection revokes the token family; logout / logout-all; password reset revokes all sessions. |
| Reset/verification protected against enumeration and abuse | ✅ | Generic responses; strict rate limits (5–10/min). |
| Least-privilege RBAC on the server | 🟡 | 5-level ladder enforced server-side; the blueprint's 8 configurable roles are missing. |
| MFA for sensitive admin actions | ❌ | None; no admin area yet. |
| OWASP: injection, XSS, CSRF, SSRF, IDOR, traversal | 🟡 | IDOR covered by tenant-scoped queries + tests; CSRF mitigated (Bearer header + `SameSite=Strict` refresh cookie scoped to `/auth`); no Content-Security-Policy; SSRF not yet relevant (no URL fetching). |
| Restrictive CORS, headers, rate and size limits, timeouts | 🟡 | All present except timeouts (§3.4). |
| Generic safe errors | ✅ | |
| Cross-tenant access-denial tests for every major resource | 🟡 | 9 tenancy tests cover orgs, brands, products, members. AI jobs and content are covered in other suites; uploads/images only partly. |
| Secrets in env/secret manager; `.env` never committed | ✅ | `.env` gitignored; `.env.example` uses placeholders. |
| OAuth tokens encrypted at rest | 🟡 | `TOKEN_ENCRYPTION_KEY` defined; no social integrations yet to use it. |
| Upload validation (size, type, content, safe names, access control) | ✅ | Size limits, magic bytes, generated keys, signed expiring URLs. No malware scanning. |
| Prompt-injection defence | ✅ | User content wrapped in `<untrusted>` tags with an instruction to treat it as data; outputs schema-validated. |
| Audit of important actions | ✅ | `AuditService` records 25 operation types; best effort (never blocks the request). |
| Dependency vulnerabilities | 🔴 | 5 high: `postcss` (2), `zod` (memory exhaustion), `multer` (denial of service, via `@nestjs/platform-express`), `deepmerge-ts`. 6 moderate: `postcss`, `csv-parse`, `js-yaml`, `glob`, `minimatch`. CI's audit step uses `continue-on-error`, so it never fails. |

### 3.7 AI integration (`rules/ai-integration.md`)

| Requirement | Status | Finding |
|---|---|---|
| Provider-independent interface | ✅ | `AiProvider` with mock and OpenAI implementations; selected by `AI_PROVIDER`. |
| Credentials server-side only | ✅ | |
| Central model config, prompt templates/versions, timeouts, retries, rate limits | 🟡 | Prompts versioned in code; 60 s timeout; 3 attempts with exponential backoff. `PromptTemplate` table unused; no per-workspace AI rate limits. |
| Track provider, model, workspace, user, task, tokens, cost, status, errors | 🟡 | Job stores provider, model, prompt version, user, org, status, error, credits. **Token usage is returned by the provider but not saved; no estimated cost.** |
| Validate structured output before saving | ✅ | Zod schemas; invalid JSON is retried. |
| Treat output as untrusted; no executing generated actions | ✅ | Output is only stored and displayed. |
| Authorised workspace/brand context only | ✅ | Context loaded with tenant filter. |
| Distinguish facts, assumptions and suggestions | ✅ | Analysis includes assumptions and items needing confirmation; human confirmation is required before strategy/content; keyword ideas labelled `ai-suggestion`. |
| Cancellation, retries, clear job status | ✅ | |
| No double-deduction on retries | ✅ | Tested. |
| Usage limits and cost controls | 🟡 | Credit balance caps usage; no daily/per-user limits. |
| Explicit authorisation for external side effects | ✅ | No publishing or messaging exists yet. |
| Real provider tested | ❌ | OpenAI provider written but never run with a real key. |

### 3.8 Testing (`rules/testing.md`)

| Layer / gate | Status | Finding |
|---|---|---|
| Unit tests | 🟡 | 6 validation tests only. No service or component unit tests. `packages/ai` has a test script but no tests. |
| Integration (routes + database + auth) | ✅ | 33 Jest + Supertest tests over real HTTP and PostgreSQL: auth (12), tenancy (9), AI + credits (8), products (5). |
| End-to-end (browser) | ❌ | No Playwright. |
| Security / tenant isolation | 🟡 | Strong for orgs/brands/products/AI; gaps listed in §3.6. |
| Type checking | ✅ | |
| Linting | 🔴 | `lint` = `tsc --noEmit`; no ESLint rules run anywhere. |
| Dependency and secret scanning | 🔴 | Audit non-blocking; no secret scanning. |
| Coverage (80% overall, 90% critical) | ❌ | Not measured; no coverage configuration. |
| Frontend production build / backend build | ✅ | |

### 3.9 Product functionality vs `CLAUDE.md` §6 (14 core areas)

| # | Area | Status | Notes |
|---|---|---|---|
| 1 | Auth, users, organisations, **workspaces** | 🟡 | Auth and orgs complete; **no client workspaces**. |
| 2 | Brands, products, **services**, business intelligence | 🟡 | Brands and products complete; no Service entity; brand profile missing website, location, contacts, markets, languages, competitors. |
| 3 | AI strategy and planning | 🟡 | Product-level analysis → strategy works (mock provider); no brand-level analysis, personas or content pillars. |
| 4 | AI content studio | 🟡 | Per-channel content with versioning; no standalone studio UI. |
| 5 | AI creative studio (editable designs) | ❌ | Schema only. |
| 6 | Campaign management | ❌ | Schema only. |
| 7 | Social connections and publishing | ❌ | Schema only. |
| 8 | Calendar and scheduling | ❌ | |
| 9 | Workflow automation | ❌ | |
| 10 | Collaboration, comments, approvals | ❌ | |
| 11 | Engagement and leads | ❌ | |
| 12 | Analytics and reporting | ❌ | |
| 13 | Plans, subscriptions, billing, credits | 🟡 | Plans, credit costs and ledger complete; no Razorpay. |
| 14 | Platform administration and monitoring | ❌ | Health endpoint only; no super-admin. |

Other gaps: 🔴 email is a logging stub, so verification, reset and invitation emails are never sent. Excel import not wired (CSV works). Platform text limits for 9 channels are unverified (`verifiedAt: null`).

### 3.10 GitHub and CI (`rules/deployment.md`)

| Requirement | Status | Finding |
|---|---|---|
| Configured remote and branch strategy | ❌ | No remote. Branch strategy (feature branch → PR → owner merges) is defined in the current `CLAUDE.md` and `docs/decisions.md`. |
| GitHub Actions checks | 🟡 | Typecheck, "lint", tests on Postgres + Redis services, build, audit. Lint is a no-op and audit can't fail (§3.8). |
| Secret scanning | ❌ | |
| Branch protection on `main` | ❌ | Configure once pushed. |
| PR template and CODEOWNERS | ✅ | Present. |

### 3.11 Deployment (`rules/deployment.md`)

| Requirement | Status | Finding |
|---|---|---|
| Frontend on Vercel | ❌ | Not configured. |
| Backend and worker on worker-compatible hosting | 🟡 | Dockerfile targets exist; AWS chosen, not yet configured. |
| MongoDB Atlas | ❌ | No cluster yet. |
| Separate dev / preview / production environments | ❌ | Only local configuration exists. |
| `.env.example` with placeholders; startup validation | ✅ | Will need MongoDB variables. |
| Post-deployment verification | ❌ | Health endpoint exists (`/api/v1/health`) to build on. |
| Backups and restore testing | ❌ | |

---

## 4. Key decisions (resolved; see §8)

### 4.1 The stack conflict

The standard says the stack is mandatory **and** says *"Do not migrate a working project just to match a preferred structure."* You've resolved this by keeping Next.js and NestJS. The database port still applies (D-001), and it should happen now: the codebase is small, and every later phase multiplies the cost.

**How to keep the port safe:**
- Do it in its own pull request, with all existing tests passing.
- Don't change behaviour or add features during the port.
- Keep the existing API (URLs, request and response shapes), so the frontend needs no changes. IDs change from UUIDs to MongoDB ObjectIds; the frontend treats them as plain strings already.

### 4.2 Database port inside NestJS

- Use `@nestjs/mongoose` (official NestJS integration for Mongoose). Each module gets its schema files; services switch from the Prisma client to injected Mongoose models.
- Guards (`JwtAuthGuard`, `TenantGuard`), Zod validation pipes, throttling and the Supertest tests stay as they are; only data access changes.
- The 33 API tests act as the safety net: same URLs, same responses, now on MongoDB.

**Consequence for your setup:** until the port lands, the app still needs PostgreSQL. On the Windows laptop (no Docker), the **Neon project created on 4 Nov is useful until then**, and gets deleted afterwards. `docs/decisions.md` D-005 should be updated to say that.

### 4.3 Which `CLAUDE.md`

The pack's `CLAUDE.md` sets general standards. The repo's current `CLAUDE.md` holds project specifics: commands, priorities, MongoDB rules, the no-Docker constraint, acceptance criteria for the migration and the Git workflow. **Recommendation:** use the pack's `CLAUDE.md` as the base and add a short "Project specifics" section from the current one. Keep `.claude/rules/*` as provided, with `docs/decisions.md` recording any project-specific choices. Some items in the current `CLAUDE.md` (Mongoose over Prisma, D-002) already agree with the pack.

### 4.4 Shared code between client and server

The target tree has only `client/` and `server/`, but both currently share Zod schemas and types (`packages/validation`, `packages/shared-types`). Options:

| Option | Trade-off |
|---|---|
| **A. Add a small `shared/` workspace** (recommended) | One source of truth for validation; small deviation from the tree. |
| B. Keep schemas in `server/` and import them into `client/` | Matches the tree; couples the client build to server source. |
| C. Duplicate schemas | Matches the tree; front and back validation will drift apart. |

### 4.5 Frontend stays on Next.js, backend stays on NestJS (decided 5 Nov 2026)

Next.js is built on React and NestJS is built on Node.js and Express, so the spirit of the standard holds, but the pack names Vite and Express. Before installing the pack, change these lines so Claude Code doesn't try to "fix" either:

- `CLAUDE.md` §3: "Frontend: React.js with Next.js, TypeScript." and "Backend: Node.js with NestJS (on Express), TypeScript." In the next paragraph, replace "Express/Node.js" with "NestJS/Node.js".
- `rules/frontend.md` first bullet: "Use React with Next.js and TypeScript. Do not introduce another primary frontend framework." Read "public Vite environment variables" as `NEXT_PUBLIC_` variables.
- `rules/backend.md` title and first bullet: "Backend Rules — Node.js and NestJS" / "Use Node.js with NestJS and TypeScript. Do not replace the backend framework without explicit approval." Read "routes, controllers, services, middleware" as NestJS controllers, services, guards, pipes and interceptors.
- `rules/deployment.md`: "Next.js frontend: Vercel." and "Node.js/NestJS backend: a suitable Node.js hosting platform."

Record both as decisions in `docs/decisions.md`. Keep the API in NestJS, not in Next.js API routes.

---

## 5. Target structure

The requested structure, filled in with where existing code would go. Uses Option A (`shared/`), as approved.

```
AI-Marketing-Studio/
├── CLAUDE.md                     # pack CLAUDE.md + project specifics (§4.3)
├── .claude/
│   └── rules/
│       ├── frontend.md
│       ├── backend.md
│       ├── database.md
│       ├── security.md
│       ├── testing.md
│       ├── ai-integration.md
│       └── deployment.md
├── client/                       # React + Next.js + TypeScript (moved from apps/web)
│   ├── src/
│   │   ├── app/                  # Next.js routes, layouts, robots.ts, sitemap.ts
│   │   ├── components/           # shared UI
│   │   ├── features/             # per-module hooks, forms, views
│   │   └── lib/                  # API client, auth, utilities
│   ├── public/
│   ├── next.config.mjs           # security headers
│   └── package.json
├── server/                       # Node.js + NestJS + TypeScript (from apps/api + apps/worker + packages/database, ai)
│   ├── src/
│   │   ├── main.ts               # HTTP entry point
│   │   ├── bootstrap.ts          # app setup (shared by main.ts and tests)
│   │   ├── worker.ts             # BullMQ worker entry point (separate process)
│   │   ├── app.module.ts
│   │   ├── config/               # env validation
│   │   ├── common/               # guards, decorators, pipes, filters, interceptors (request ID, logging)
│   │   ├── modules/              # auth, organizations, brands, products, ai, content, billing, storage…
│   │   │   └── <module>/         # *.module.ts, *.controller.ts, *.service.ts, *.schema.ts (Mongoose)
│   │   ├── ai/                   # provider interface, OpenAI + mock, prompts, pipeline
│   │   ├── integrations/         # storage, mail, queue, later social/payments
│   │   └── migrations/           # versioned data migrations
│   ├── test/                     # Jest + Supertest suites
│   ├── nest-cli.json
│   └── package.json
├── shared/                       # Zod schemas, shared types, platform specs (Option A)
├── docs/                         # blueprint, assessment, decisions, handover, API, SOP
├── .github/                      # CI workflows, PR template, CODEOWNERS
├── .env.example
├── package.json                  # pnpm workspaces: client, server, shared
└── README.md
```

---

## 6. Phased implementation roadmap

Each phase is a separate branch and pull request. **Exit criteria** must pass before the next phase starts. "All existing tests" means every test in the suite at the time (on 5 Nov 2026: 35 API end-to-end tests, 6 validation tests, plus the Phase 1a additions), ported to MongoDB in Phase 2, with none deleted to make a suite pass.

### Phase 0: Governance and repository setup (no behaviour change)
- Install `.claude/rules/`; merge the two `CLAUDE.md` files (§4.3); apply the §4.5 edits to the pack's rules; record decisions §4.1–4.5 in `docs/decisions.md`.
- Push existing history to `ai-marketing-studio`; protect `main` (PR + passing CI required).
- **Fix the 5 high and 6 moderate vulnerabilities** by updating dependencies; make the CI audit blocking.
- Add ESLint (TypeScript rules) so `lint` really lints; add secret scanning (e.g. Gitleaks) to CI.
- Gate Swagger to non-production.

**Exit:** CI green with real lint, blocking audit and secret scan; all tests pass; repo on GitHub.

**Status: ✅ Done** (PR #1, merged 5 Nov 2026). `main` is protected (pull request and passing `checks` job required). Verified 5 Nov 2026: CI green on `main`, `pnpm audit --prod --audit-level moderate` reports no known vulnerabilities, Swagger gated by `isSwaggerEnabled()`.

### Phase 1: Restructure and frontend hardening (Next.js stays)
- Create `client/`, `server/`, `shared/`. Move code without changing behaviour (`apps/web` → `client/`; `apps/api` + `apps/worker` → `server/`).
- Add `robots.ts` and `noindex` metadata for app routes; Content-Security-Policy in `next.config.mjs`.
- Add Vitest + React Testing Library for key components, and a Playwright smoke test: register → login → create brand → create product.

**Exit:** all existing tests pass; client builds; Playwright smoke passes against a local API.

Delivered in three pull requests:

- **1a** test safety net (test-database guard, AI package unit tests, Vitest for the web app, Playwright smoke in CI): **✅ done** (PR #4, merged 5 Nov 2026).
- **1b** the move to `client/` + `server/` (`api`, `worker`, `database`, `ai`) + `shared/` (`validation`, `types`, `config`), package names unchanged: **✅ done** (PR #6, merged 5 Nov 2026).
- **1c** `robots.txt` disallowing everything, `noindex` metadata and `X-Robots-Tag` (no public pages exist yet), a per-request nonce Content-Security-Policy in `client/src/middleware.ts` (every page is now rendered per request), `Permissions-Policy`, and the Products/Brands load-error fix: in progress.

Follow-ups recorded during Phase 1 (planned for 1c or Phase 3):

- ~~**Bug:** the Products and Brands pages don't show an error when loading fails.~~ Fixed in 1c.
- **Low (security review, PR #4):** the test-database guard checks the database name only, not the host; consider refusing remote hosts unless `CI=true` or an explicit opt-in.
- **Low (security review, PR #4):** the Playwright failure artifact (7-day retention) contains a throwaway test user's tokens and traces; consider uploading without traces.
- **Low (security review, PR #4):** GitHub Actions are pinned to version tags, not commit SHAs; pin third-party actions (gitleaks) to SHAs.
- **Medium (security review, Phase 1b; existed before):** there is no `.dockerignore`, and the Dockerfile runs `COPY . .`, so a local build would bake the root `.env` into image layers. Add a `.dockerignore` (`.env`, `.env.*` except `.env.example`, `node_modules`, `.git`, `.storage`, Playwright output) before any local image build, and by Phase 6 at the latest.

### Phase 2: Database port to MongoDB + Mongoose (in NestJS)
- Add `@nestjs/mongoose`; design collections from the 31 Prisma models (references vs embedding, indexes starting with `organizationId`, unique indexes, integer paise for money).
- Tenant-scoped repository helpers; NoSQL-injection guards.
- Rebuild the credit ledger with atomic conditional updates inside transactions; keep the concurrent-overdraw tests.
- Tests on `mongodb-memory-server` (replica set) so they run on Windows without Docker; CI uses the same.
- Replace the Prisma error filter with a MongoDB one (duplicate key → 409, invalid ID → 400).
- Seed script; versioned migration scripts; remove Prisma, SQL migrations and `DATABASE_URL`.
- Create the Atlas development cluster; delete the Neon project after merge.

**Exit:** all tests pass on MongoDB; concurrency tests for credits pass; no Prisma left; README and handover updated.

### Phase 3: Security, AI and quality hardening
- Request IDs and structured JSON logging (e.g. `nestjs-pino`) across API and worker; request timeouts; move CSV import into the queue.
- Real email provider (verification, reset, invitations).
- Save token usage and estimated cost on AI jobs; per-workspace AI rate limits; move prompts to the database (`PromptTemplate`).
- Test the OpenAI provider with a real key in a non-production environment.
- Pagination on all list endpoints; Content-Security-Policy; upload malware scanning plan.
- Fill tenant-isolation test gaps (images, content, jobs, audit log); coverage reporting (target 80% / 90% critical).

**Exit:** coverage targets met or gaps documented; emails delivered in staging; real-provider AI test passes.

### Phase 4: Product foundation (blueprint Phase 1.5)
- Client workspaces (Organisation → Workspace) with data scoped by both IDs, and existing data moved into a default workspace.
- 8 blueprint roles with configurable permissions; permission-based NestJS guards.
- Super-admin foundation (separate from workspace roles; MFA for admin actions).
- Service entity; extended brand profile; Excel import.
- Replace "coming soon" placeholders with hidden or role-gated navigation until modules exist.

**Exit:** cross-workspace isolation tests; client-viewer read-only and approver-only tests pass.

### Phase 5: Blueprint feature phases
Complete AI Marketing Intelligence (brand analysis, personas, content pillars), then in order: Content & Creative Studio → Campaigns & Social → Calendar & Approvals → Workflow Automation → Engagement & Leads → Analytics & Reporting → Billing (Razorpay) and Admin. Each module is a full vertical slice (UI, API, models, permissions, tests) per `CLAUDE.md` §8.

### Phase 6: Deployment (can start after Phase 2, in parallel with 3–5)
- **Frontend:** Vercel project for `client/` (Next.js, native support) with preview deployments per PR.
- **API and worker (NestJS) on AWS**, region Mumbai (`ap-south-1`):
  - **ECS on Fargate** runs two services from the existing Dockerfile: the API (behind an Application Load Balancer with HTTPS) and the BullMQ worker (no public access). Images stored in ECR.
  - **ElastiCache for Redis** (BullMQ queues), **S3** for files (the existing `s3` storage driver), **SES** for email, **Secrets Manager** for keys, **CloudWatch** for logs and alarms.
  - Deploys from GitHub Actions using short-lived AWS credentials (OIDC), with production deploys gated on your approval.
- **Data:** MongoDB Atlas, hosted on AWS in the same region (paid tier for production).
- Separate development, staging and production configuration and databases; production deploys need your approval.
- Post-deploy checks: URL, commit, `/health`, database connectivity, login flow. Backups with a tested restore.

---

## 7. Immediate risks to address regardless of order

Open:

1. 🔴 **Emails aren't sent:** verification, password reset and invitations don't work for real users (Phase 3; earlier if anyone outside the team will log in).

Resolved in Phase 0 (PR #1):

- ✅ Dependency vulnerabilities fixed; the CI audit step now blocks.
- ✅ API documentation served only outside production.
- ✅ ESLint now lints for real.
- ✅ Code pushed to GitHub (`singhabhay9012-ai/ai-marketing-studio`).

---

## 8. Decisions (all approved 5 Nov 2026)

1. Database port inside NestJS with `@nestjs/mongoose` (§4.2): **approved**.
2. Shared code: **Option A, `shared/` folder**.
3. `CLAUDE.md`: **merged** (pack base + §12 project specifics).
4. Neon kept until Phase 2 is merged: **approved**.
5. Backend host: **AWS** (ECS Fargate in `ap-south-1`).
6. Pack wording edits (§4.5): **approved and applied**.

Recorded in `docs/decisions.md` (D-001 to D-010).
