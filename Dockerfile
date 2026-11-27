FROM node:22.23.1-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && CI=true pnpm install --prod --frozen-lockfile

FROM node:22.23.1-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000 STATIC_DIR=/app/apps/web/dist
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/apps/server ./apps/server
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
WORKDIR /app/apps/server
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
