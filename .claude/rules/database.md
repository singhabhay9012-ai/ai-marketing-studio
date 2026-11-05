# Database Rules — MongoDB and Mongoose

- MongoDB is the mandatory primary database; use Mongoose for modelling and database access.
- **Transition:** until roadmap phase 2 (the MongoDB port) is merged, the app still runs on PostgreSQL with Prisma. Maintain that code as needed, but don't add new Prisma models or features beyond what a phase needs (see `CLAUDE.md` §12.2).
- Inspect existing schemas and data before changing models or collection structure.
- Define explicit schemas, types, validation, timestamps and ownership/tenant fields.
- Add indexes based on actual query patterns. Use unique indexes for invariants such as unique account identifiers within the correct scope.
- Scope every tenant-owned query by authenticated organisation/workspace/client. Never rely on frontend filtering for isolation.
- Use pagination and bounded query results for potentially large collections.
- Avoid unbounded arrays and uncontrolled document growth. Model relationships according to access patterns and data lifecycle.
- Use transactions when supported and appropriate for multi-document consistency. Design retries and concurrent updates safely.
- Use atomic updates and idempotency keys for credit deductions, payments, publishing and other operations that must not be duplicated.
- Do not expose raw MongoDB query objects from user input. Prevent NoSQL operator injection by validating and constructing queries safely.
- Make schema/data changes through documented, repeatable and reversible migration or transformation procedures where possible.
- Never run destructive production changes without explicit approval, verified backup and rollback/recovery plan.
- Document retention, archival, export and deletion behaviour. Test backup restoration rather than assuming backups are usable.

## Project specifics
- Every tenant-owned document stores `organizationId` (plus `workspaceId` from phase 4). All queries go through tenant-scoped repository helpers; compound indexes start with `organizationId`; invariants are unique indexes.
- Money in integer minor units (paise) plus `currency`. Reference by ID; embed only small, bounded, owned data; check referenced documents exist and belong to the same tenant.
- Credits: reserve → settle/release only through the credit service, with an atomic conditional update (`balance - reserved >= amount` in the filter) inside a transaction. Never read-then-write.
- Zod-parse every input before querying; reject `$`-prefixed keys.
- Development uses MongoDB Atlas (free M0) as `MONGODB_URI`; tests use `mongodb-memory-server` in replica-set mode. Phase 2 acceptance criteria are in `docs/audit-and-roadmap.md`.
