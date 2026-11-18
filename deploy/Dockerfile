# The finance app. Build from the repo root:
#   docker build -f deploy/Dockerfile -t finance-app .
# Pinned base: node 24.22.3 on Debian bookworm (slim), by digest.
ARG NODE_IMAGE=node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54

FROM ${NODE_IMAGE} AS build
WORKDIR /src
COPY package.json package-lock.json ./
# --ignore-scripts: no install scripts run (native modules ship prebuilt binaries)
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json ./
COPY app ./app
RUN npm run build

FROM ${NODE_IMAGE} AS deps
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    FINANCE_DATA_DIR=/data \
    FINANCE_PORT=8080 \
    FINANCE_HOST=0.0.0.0
WORKDIR /app
COPY --from=deps /src/node_modules ./node_modules
COPY --from=build /src/dist ./dist
COPY package.json ./
# The only writable place; run the container read-only (see the compose file).
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/app/src/main.js"]
