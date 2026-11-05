# Multi-target image for api / worker / web.
#   docker build -f infra/docker/Dockerfile --target api    -t amp-api .
#   docker build -f infra/docker/Dockerfile --target worker -t amp-worker .
#   docker build -f infra/docker/Dockerfile --target web    -t amp-web --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api/v1 .
FROM node:22-slim AS base
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

FROM base AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm install --frozen-lockfile && pnpm db:generate && pnpm build

FROM base AS api
ENV NODE_ENV=production
COPY --from=build /repo /repo
USER node
EXPOSE 4000
# Run `pnpm db:deploy` as a separate release step before starting new versions.
CMD ["node", "server/api/dist/main.js"]

FROM base AS worker
ENV NODE_ENV=production
COPY --from=build /repo /repo
USER node
CMD ["node", "server/worker/dist/main.js"]

FROM base AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /repo /repo
WORKDIR /repo/client
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
