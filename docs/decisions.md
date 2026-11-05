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

**Decision:** Claude Code works on feature branches, commits, pushes and opens pull requests. It never merges or deploys. The owner reviews and merges into `main`. (Merging partly replaced by D-014; it still never deploys.)

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

**Decision:** `.claude/settings.json` denies `gh pr merge`, common force-push and push-to-`main` command forms, and reading `.env` files with the Read tool. It allows read-only Git and `gh` commands and the quality-gate scripts so agents aren't blocked by prompts.

**Consequences:**
- These rules guard against accidents; they are not a security boundary. They match command prefixes, so other forms get through (for example `git push origin +main`, flags after the branch name, `gh api` merge calls, or reading `.env` with `cat` or `Get-Content` through the shell). Claude still follows the written rules in `CLAUDE.md` §12.5.
- GitHub branch protection on `main` is the real control. Checked 5 Nov 2026: pull request and up-to-date `checks` job required, force-pushes and deletion blocked, linear history, conversation resolution, enforced for admins, 0 approvals required (so the sole owner can merge).
- The allowed `pnpm` scripts run whatever `package.json` defines, so script changes in a pull request deserve review. Tests must use a dedicated test database (see README).
- If "require code owner review" is ever turned on, the sole code owner can't approve their own pull requests; add a second owner first.

## D-014: Claude may merge pull requests on explicit request

**Context:** Approved by the owner on 5 Nov 2026 ("Let Claude merge"), replacing the merge part of D-003.

**Decision:** The main Claude Code session may merge a pull request only when the owner explicitly asks in chat to merge that specific pull request. Before merging it confirms that the PR head is the verified commit, the required `checks` job passed and the merge state is clean, then runs `gh pr merge <number> --squash`. Subagents never merge. Claude still never deploys.

**Consequences:**
- `.claude/settings.json` moves `gh pr merge` from `deny` to `ask`, so every merge also needs the owner's approval at a permission prompt.
- Branch protection on `main` is unchanged and is still the real control: no admin override, no bypass.
- Without an explicit request, the owner reviews and merges as before.
