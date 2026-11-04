# Backend Rules — Node.js and NestJS

- Use Node.js with NestJS (running on Express) and TypeScript. Do not replace the backend framework without explicit approval.
- In NestJS terms: routes are controllers, middleware is guards, pipes, interceptors and filters, and services hold business logic.
- Keep routes, controllers, services, models, validators, middleware and integrations separated by responsibility.
- Validate and normalise all incoming parameters, query strings, request bodies and uploaded files on the server.
- Authenticate requests and enforce authorisation at the resource/action level on every protected route.
- Scope every tenant-owned read and write by the authenticated organisation/workspace/client context. Never trust tenant IDs supplied by the browser without checking membership and permission.
- Use consistent response shapes and appropriate HTTP status codes. Centralise error handling; do not leak stack traces or internal details to clients.
- Apply rate limits, request-size limits, restrictive CORS, secure headers and appropriate timeouts.
- Verify webhook signatures and make sensitive/retryable operations idempotent.
- Use transactions or compensating operations where needed to preserve consistency across related changes.
- Do not block request handlers with long-running AI, media, bulk or scheduled work. Queue appropriate work and return a trackable job/status.
- Add structured logs and correlation/request IDs. Never log passwords, access tokens, API keys, payment secrets or sensitive customer content unnecessarily.
- Document important APIs and test authentication, permissions, validation, error paths and tenant boundaries.
