# syntax=docker/dockerfile:1
# Self-contained: compiles TypeScript in the builder. Do not COPY a host dist/.

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM ghcr.io/puppeteer/puppeteer:24.22.3
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
COPY package.json package-lock.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=true
USER root
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
USER pptruser

EXPOSE 8080
CMD ["node", "dist/main.js"]
