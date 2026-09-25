# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

ARG NODE_VERSION=24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553

FROM node:${NODE_VERSION} AS dependencies
WORKDIR /workspace
COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM dependencies AS build
COPY . .
RUN npm run build

FROM dependencies AS development
ENV NODE_ENV=development
COPY --chown=node:node . .
RUN chown node:node /workspace
USER node
EXPOSE 3003
CMD ["sh", "-c", "npm run build:dev && exec npm run start"]

FROM node:${NODE_VERSION} AS runtime-dependencies
WORKDIR /workspace
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:${NODE_VERSION} AS runtime
LABEL org.opencontainers.image.title="String of Pearls" \
      org.opencontainers.image.description="Browser-based air traffic control simulator" \
      org.opencontainers.image.source="https://github.com/blairhoddinott/stringofpearls"
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080
COPY --from=runtime-dependencies --chown=node:node --chmod=0555 /workspace/node_modules/ ./node_modules/
COPY --from=build --chown=node:node --chmod=0444 /workspace/package.json ./package.json
COPY --from=build --chown=node:node --chmod=0555 /workspace/public/ ./public/
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:8080/healthz').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"]
STOPSIGNAL SIGTERM
CMD ["node", "public/assets/scripts/server/index.js"]
