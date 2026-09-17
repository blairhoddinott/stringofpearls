# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

FROM mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /workspace

COPY tools/browser-smoke/package.json tools/browser-smoke/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY --chown=pwuser:pwuser tools/browser-smoke/smoke.js ./smoke.js

USER pwuser
CMD ["node", "smoke.js"]
