# AI Integration Rules

- Keep AI providers behind a provider-independent service interface so providers/models can be changed without rewriting product workflows.
- Store provider credentials only on the server in secure environment configuration.
- Centralise model configuration, prompt templates, prompt versions, timeouts, retries, rate limits and usage accounting.
- Track model/provider, workspace, user, task, tokens/usage where available, estimated cost, status and errors without storing unnecessary sensitive content.
- Validate structured AI output against schemas before saving or triggering downstream actions.
- Treat AI output as untrusted. Never execute generated code, queries, URLs or external actions without validation and permission checks.
- Use authorised workspace/brand context only. Prevent cross-tenant retrieval and access.
- Distinguish verified facts, user-provided facts, assumptions and generated suggestions. Do not invent product claims, testimonials, prices, statistics or campaign results.
- Support cancellation, retries and clear status for long-running generation jobs.
- Ensure retries do not double-deduct credits or create duplicate assets/jobs. Use idempotency and transaction-safe accounting.
- Apply usage limits, abuse prevention and cost controls.
- Protect against prompt injection from uploads, webpages, connected platforms and user-supplied content.
- Require explicit authorisation before publishing, messaging, spending money or performing other external side effects.
- The in-product AI should act as a practical marketing strategist/operations assistant. Claude Code remains the software development agent; do not confuse their roles.
