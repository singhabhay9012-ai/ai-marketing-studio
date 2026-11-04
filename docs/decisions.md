# Architecture decisions

Newest last. Each decision stays in force until a later entry replaces it.

## D-001: MongoDB as the primary database (5 Nov 2026)

**Decision:** Replace PostgreSQL with MongoDB (Atlas) before further feature work.

**Context:** The owner wants to settle the database before Phase 1.5 so it never has to be switched at deployment.
The codebase is still small (31 tables, one module with raw SQL: `packages/database/src/credits.ts`).

**Consequences:**
- Data layer, seed, tests and CI are rewritten (see "MongoDB migration" in `CLAUDE.md`).
- MongoDB doesn't enforce relationships or foreign keys, so tenant and reference checks live in the service layer and need tests.
- Credits move from `SELECT … FOR UPDATE` to atomic conditional updates inside transactions (needs a replica set, which Atlas provides).
- Money is stored as integer minor units, because the current `Decimal` columns have no direct equivalent.
- Production needs a paid Atlas tier (Flex or Dedicated M10+). The free M0 cluster is for development only.
- PostgreSQL row-level security is no longer an option for defence in depth; isolation relies on repository helpers and tests.

## D-002: Mongoose as the MongoDB library (5 Nov 2026)

**Decision:** Use Mongoose rather than Prisma for MongoDB.

**Context:** Prisma ORM v7 has no MongoDB connector. MongoDB users must stay on Prisma v6 (maintenance line), and MongoDB
support in Prisma's successor (Prisma Next) is in early access. Choosing Prisma would mean another library migration later.

**Consequences:** Service-layer queries are rewritten from the Prisma client API to Mongoose models. Types come from
Mongoose schemas (`InferSchemaType`) and the shared Zod schemas.

## D-003: Git workflow (5 Nov 2026)

**Decision:** Claude Code works on feature branches, commits, pushes and opens pull requests. It never merges or deploys.
The owner reviews and merges into `main`.

## D-004: No Docker on the Windows development laptop (5 Nov 2026)

**Decision:** Every dev and test workflow must work without Docker.

**Context:** On the ASUS laptop (AMD Ryzen 5 3550H), enabling the Windows hypervisor stops Windows from booting. It is
disabled with `bcdedit /set {default} hypervisorlaunchtype off`, so Docker Desktop can't run there (documented in SOP-DEV-001).

**Consequences:** Dev database on MongoDB Atlas, tests on `mongodb-memory-server`, Redis on Upstash (Windows).
Docker remains optional on macOS and in CI.

## D-005: Neon PostgreSQL project superseded (5 Nov 2026)

The Neon project `ai-marketing-studio` (ID `ancient-tooth-53331895`) was created before D-001 and is unused. Delete it from
the Neon console once the MongoDB migration is merged.
