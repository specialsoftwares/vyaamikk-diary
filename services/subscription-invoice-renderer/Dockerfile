# syntax=docker/dockerfile:1
# Self-contained: compiles TypeScript in the builder. Do not COPY a host dist/.

FROM node:22-bookworm-slim AS builder
WORKDIR /app
# Builder only compiles TypeScript — do not download/extract Chromium here.
# Without this, `npm ci` runs puppeteer's install script → extract-zip on the
# browser archive (GHSA-jmr9-qjv8-65gv / GHSA-7pqw-9j4j-h8q3 still unfixed).
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM ghcr.io/puppeteer/puppeteer:24.22.3
ENV NODE_ENV=production
ENV PORT=8080
ENV npm_config_engine_strict=true
WORKDIR /app
COPY package.json package-lock.json ./
# Runtime image already provides Chromium; skip download/extract on npm ci.
ENV PUPPETEER_SKIP_DOWNLOAD=true
USER root
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
USER pptruser

EXPOSE 8080
CMD ["node", "dist/main.js"]
