# Security Rules

Follow secure-by-design principles and current OWASP guidance.

## Identity and access
- Hash passwords with Argon2id or appropriately configured bcrypt.
- Use secure session or token handling, rotation/expiry and safe logout/revocation.
- Protect password reset and verification flows against enumeration and abuse.
- Enforce least-privilege role-based access control on the server.
- Require stronger verification/MFA for sensitive administrative actions where appropriate.

## Application and API
- Protect against NoSQL injection, XSS, CSRF, SSRF, IDOR/BOLA, broken access control, path traversal, command injection and denial-of-service.
- Validate all input and encode output appropriately.
- Configure restrictive CORS, security headers, rate limits, request-size limits and safe timeouts.
- Verify webhook signatures and protect replay-sensitive operations.
- Return generic safe errors; do not expose secrets, stack traces or internal infrastructure details.

## Multi-tenancy
- Enforce organisation/workspace/client ownership on every relevant read, write, update, delete, export and background job.
- Do not trust client-supplied tenant identifiers.
- Add automated cross-tenant access-denial tests for every major resource type.

## Secrets and integrations
- Keep secrets in environment variables or an approved secret manager.
- Never commit `.env` files, credentials, private keys or real tokens.
- Never expose privileged secrets in React/Vite client bundles.
- Encrypt sensitive OAuth credentials at rest where supported, restrict access and handle revocation/rotation.
- Use least-privilege scopes for third-party integrations.

## Uploads and AI
- Validate upload size, extension, detected file type and content; generate safe storage names and control access.
- Treat user uploads, webpages and external content as untrusted input.
- Defend AI workflows against prompt injection; restrict tools and data available to the model.
- Prevent cross-tenant retrieval and accidental disclosure of prompts, credentials or private records.
- Require explicit user authorisation for publishing, sending messages, payments or other external side effects.

## Audit and response
- Audit important authentication, permission, billing, publishing and administrative actions.
- Do not place passwords, tokens or sensitive payloads in logs.
- Report discovered vulnerabilities, severity, affected components and remediation. Do not conceal or silently waive security failures.
