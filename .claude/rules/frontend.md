# Frontend Rules — React

- Use React with Next.js and TypeScript. Do not introduce another primary frontend framework.
- Inspect and follow the existing component, routing, styling and state-management conventions before adding dependencies.
- Build reusable, focused components; keep business logic out of large presentation components.
- Use typed API contracts and a centralised API client. Handle authentication expiry and API errors consistently.
- Every interactive control must perform its stated action. Do not ship decorative buttons, fake forms or hardcoded success states.
- Include loading, empty, error, success, disabled and validation states where relevant.
- Validate forms on the client for usability and always validate again on the server.
- Make layouts responsive across mobile, tablet and desktop.
- Target WCAG 2.2 AA where practical: keyboard access, visible focus, labels, contrast and semantic structure.
- Optimise rendering, route loading, images and bundle size. Avoid unnecessary state and duplicate requests.
- Never place private API keys, database credentials, signing secrets or privileged tokens in browser code or public (`NEXT_PUBLIC_`) environment variables.
- Authenticated dashboards and private workspace pages must not be indexable. Public marketing pages should use appropriate titles, descriptions, canonical URLs, sitemap and structured metadata.
- Test critical components and user journeys. Do not claim a UI flow works based only on visual inspection.
