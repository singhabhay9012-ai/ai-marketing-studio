# GitHub, CI/CD and Deployment Rules

## Git safety
- Inspect repository root, `git status`, current branch, remotes and diff before Git operations.
- Use the already configured remote and established branch strategy. Never guess a repository URL or production branch.
- Before committing: review changed files, run relevant checks, scan for secrets and ensure temporary/build files are excluded.
- Use clear, meaningful commit messages.
- Push only to the confirmed intended remote and branch, and only when authorised by the task/project workflow.
- Never force-push, rewrite shared history, overwrite other contributors' work, discard uncommitted changes or commit secrets without explicit approval.
- Report actual commit hash, branch and push result. If authentication or remote configuration is missing, explain the exact blocker.

## CI
Use GitHub Actions or the repository's existing CI system for appropriate type checks, lint, tests, builds, dependency scanning and secret scanning. Protect the production branch with required reviews/status checks where configured.

## Deployment architecture
- React/Next.js frontend: Vercel.
- Node.js/NestJS backend: AWS (ECS on Fargate, region `ap-south-1`).
- MongoDB: MongoDB Atlas or an approved managed MongoDB service.
- Persistent workers and Redis/BullMQ: worker-compatible hosting; do not assume Vercel Functions are persistent processes.

## Environments
Keep development, preview/staging and production settings and databases separate. Document required environment variables in `.env.example` using placeholder values only. Validate required variables at startup. Never expose server secrets to the browser.

## Deployment verification
After a deployment the owner has authorised, verify the deployment result, URL, commit/revision, frontend availability, backend health, database connectivity and critical API flows. Report what was actually checked. Never claim deployment succeeded without confirmation.

## Production protection
Destructive migrations, production data deletion, breaking API/auth changes, security-sensitive changes, domain changes and infrastructure changes require explicit approval and a recovery/rollback plan. Do not automatically bypass approvals or CI gates.
