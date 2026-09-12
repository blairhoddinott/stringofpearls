# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

ARG NODE_VERSION=24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553
ARG NGINX_VERSION=1.28-alpine@sha256:7377697a821c131a924a7105fafbe7414db4e9fcc77a6f08f776f33f141ec3f8

FROM node:${NODE_VERSION} AS dependencies
WORKDIR /workspace
COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM dependencies AS build
COPY . .
RUN node node_modules/gulp/bin/gulp.js build --prod

FROM dependencies AS development
ENV NODE_ENV=development
COPY --chown=node:node . .
RUN chown node:node /workspace
USER node
EXPOSE 3003
CMD ["sh", "-c", "node node_modules/gulp/bin/gulp.js build && exec node public/assets/scripts/server/index.js"]

FROM nginxinc/nginx-unprivileged:${NGINX_VERSION} AS runtime
LABEL org.opencontainers.image.title="String of Pearls" \
      org.opencontainers.image.description="Browser-based air traffic control simulator" \
      org.opencontainers.image.source="https://github.com/blairhoddinott/stringofpearls"
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=101:101 /workspace/public/ /usr/share/nginx/html/
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1
STOPSIGNAL SIGQUIT
