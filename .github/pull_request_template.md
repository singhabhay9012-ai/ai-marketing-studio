## What does this change?

## Why?

## Roadmap phase

## Checklist
- [ ] Tests added/updated (unit, integration, tenant-isolation where relevant)
- [ ] Every new organisation-owned query is tenant-scoped (`TenantGuard` / `@Tenant()`, never an organisation ID from the request body)
- [ ] Schema or data changes are migrated safely and reversibly (no destructive changes without a rollback plan)
- [ ] API changes reflected in Swagger decorators
- [ ] `.env.example` and docs updated for any new configuration
- [ ] No secrets, tokens or real customer data committed
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` pass locally

## Agent reviews (`CLAUDE.md` §12.8)
| Agent | Result | Findings fixed | Still open |
|---|---|---|---|
| `qa-testing` | | | |
| `code-reviewer` | | | |
| `security-engineer` | | | |
| `documentation-agent` | | | |

## Checks run
<!-- Exact commands and pass/fail results. Say what was skipped and why. -->
