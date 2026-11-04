## What does this change?

## Why?

## Checklist
- [ ] Tests added/updated (unit, integration, tenant-isolation where relevant)
- [ ] Every new organisation-owned query is scoped through `TenantService` / org guard
- [ ] Prisma migration generated and reviewed (no destructive changes without a plan)
- [ ] API changes reflected in Swagger decorators
- [ ] No secrets, tokens or real customer data committed
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass locally
