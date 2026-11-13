# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspaces --include-workspace-root

COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN npm run build --workspace @scamshield/shared-types \
    && npm run build --workspace @scamshield/validation \
    && npx prisma generate --schema apps/api/prisma/schema.prisma \
    && npm run build --workspace @scamshield/api

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl curl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma ./apps/api/prisma

RUN chown -R node:node /app
USER node

EXPOSE 4000
# Render injects PORT (usually 10000); keep the health check aligned with it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD sh -c 'curl -fsS "http://127.0.0.1:${PORT:-4000}/health" || exit 1'

CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]
