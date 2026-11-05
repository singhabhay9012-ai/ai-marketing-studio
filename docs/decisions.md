# Architecture decisions

Newest last. Each decision stays in force until a later entry replaces it. All approved by the owner on 5 Nov 2026.

## D-001: MongoDB as the primary database

**Decision:** Replace PostgreSQL with MongoDB (Atlas). Done in roadmap phase 2, before new features.

**Consequences:**
- Data layer, seed, tests and CI are rewritten; acceptance criteria in `CLAUDE.md` §12.6.
- MongoDB doesn't enforce relationships, so tenant and reference checks live in services and need tests.
- Credits move from `SELECT … FOR UPDATE` to atomic conditional updates inside transactions (needs a replica set; Atlas provides one).
- Money is stored as integer minor units (paise).
- Production needs a paid Atlas tier; the free M0 cluster is for development only.

## D-002: Mongoose via `@nestjs/mongoose`

**Decision:** Use Mongoose through NestJS's official integration, not Prisma.

**Context:** Prisma ORM v7 has no MongoDB connector; MongoDB users are held on v6 and Prisma's successor support is in early access. Mongoose avoids a second library migration later.

## D-003: Git workflow

**Decision:** Claude Code works on feature branches, commits, pushes and opens pull requests. It never merges or deploys. The owner reviews and merges into `main`.

## D-004: No Docker on the Windows development laptop

**Context:** On the ASUS laptop (AMD Ryzen 5 3550H), enabling the Windows hypervisor stops Windows from booting; it is disabled with `bcdedit /set {default} hypervisorlaunchtype off` (documented in SOP-DEV-001).

**Decision:** Every dev and test workflow must work without Docker. Docker stays optional on macOS and in CI.

## D-005: Neon PostgreSQL until the MongoDB port

**Decision:** Keep the Neon project `ai-marketing-studio` (ID `ancient-tooth-53331895`, Singapore, PostgreSQL 16) as the PostgreSQL database for Windows development until phase 2 is merged. Delete it afterwards. (Replaces the earlier note that it was unused.)

## D-006: Frontend stays on React + Next.js

**Decision:** Keep Next.js 15 (React 19). This overrides the instruction pack's "React + Vite"; the pack's `CLAUDE.md` and `.claude/rules/frontend.md` / `deployment.md` were edited to say Next.js. Keep the API in NestJS, not in Next.js API routes.

## D-007: Backend stays on NestJS

**Decision:** Keep NestJS 10 (Node.js, on Express). This overrides the pack's "Express"; `CLAUDE.md` and `.claude/rules/backend.md` / `deployment.md` were edited to say NestJS.

## D-008: Repository layout `client/` + `server/` + `shared/`

**Decision:** Move to `client/` (Next.js), `server/` (NestJS API + BullMQ worker) and `shared/` (Zod schemas, shared types, platform specs used by both). Done in roadmap phase 1, moving code without behaviour changes.

## D-009: Hosting

**Decision:** Frontend on Vercel. Backend on AWS in `ap-south-1` (Mumbai): ECS on Fargate for the API (behind an Application Load Balancer) and the worker, ECR for images, ElastiCache for Redis, S3 for files, SES for email, Secrets Manager, CloudWatch. MongoDB Atlas on AWS in the same region. Deploys from GitHub Actions with OIDC credentials; production deploys need owner approval.

## D-010: Engineering standards

**Decision:** Adopt the AI Marketing Studio instruction pack (`CLAUDE.md` + `.claude/rules/*`) as mandatory, with the edits in D-006, D-007 and D-009 and the project specifics in `CLAUDE.md` §12.

## D-011: Repository temporarily public

**Context:** The GitHub repository `singhabhay9012-ai/ai-marketing-studio` is on a free personal account. It is temporarily **public** so that branch protection on `main` is available.

**Decision:** Keep it public only until the account is upgraded to **GitHub Pro**. Then switch the repository back to **private** and keep the existing `main` branch protection (pull request required, `checks` status check required and up to date, linear history, no force-pushes or deletions, conversation resolution, enforced for admins).

**Consequences while public:**
- Everything committed, including history, is world-readable. Secrets must never be committed (Gitleaks runs in CI); `.env` stays git-ignored.
- After switching to private, confirm the branch protection rules are still in place and that the Gitleaks step still runs (it is free for personal accounts).

## D-012: Zod 4

**Decision:** Use Zod 4 (`zod@^4.6.6`) for all shared and server-side validation, replacing Zod 3, which has no fix for GHSA-mrhx-c7xc-m3w5. JSON Schema for Swagger and AI structured outputs comes from Zod's built-in `z.toJSONSchema`, replacing `zod-to-json-schema`.

## D-013: Claude Code permission guardrails

**Context:** The Git rules (never merge, never push to `main`, never force-push, never read secrets) were written instructions only. Claude Code runs `gh` as the owner's account, so nothing technically stopped a `gh pr merge`.

**Decision:** `.claude/settings.json` denies `gh pr merge`, force-pushes, pushes to `main` and reading `.env` files, and allows the read-only Git commands and the quality-gate scripts so agents aren't blocked by prompts. Branch protection on GitHub stays the main safeguard; these rules are a second layer. They match command prefixes, so they don't catch every variant of a command.
