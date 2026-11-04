# Testing and Quality Rules

Testing is required for meaningful changes. Select tools compatible with the existing project; preferred options include Vitest or Jest, Supertest and Playwright.

## Test layers
- Unit tests: business rules, utilities, services and components.
- Integration tests: Express routes, MongoDB persistence, authentication and service boundaries.
- End-to-end tests: critical customer journeys across the application.
- Security tests: authentication, authorisation, tenant isolation, validation, uploads and sensitive operations.
- Regression tests: previously working behaviour affected by a change.

## Critical scenarios
Test registration/login/recovery, roles and permissions, cross-tenant isolation, AI generation and usage accounting, content CRUD, campaigns, approvals, scheduling, publishing success/failure, uploads, subscriptions/payments and background job retries/idempotency as applicable.

## Quality gates
Run applicable:
1. Type checking.
2. Linting.
3. Unit tests.
4. Integration tests.
5. End-to-end tests for critical flows.
6. Dependency vulnerability and secret scans.
7. Frontend production build.
8. Backend build/startup checks.
9. Database migration/schema checks.
10. Tenant-isolation and permission tests.

Aim for at least 80% overall unit coverage and 90% for critical business logic, but prioritise meaningful assertions over coverage numbers. Do not game coverage.

Never claim tests passed unless they were executed. State skipped tests, environment blockers, failures and known gaps explicitly. Fix failures caused by your changes before declaring completion.
