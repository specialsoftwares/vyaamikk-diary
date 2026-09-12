FROM ghcr.io/puppeteer/puppeteer:24.22.3

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app
COPY package.json package-lock.json* ./
# Image already contains a matching Chromium; skip a second download if npm runs.
ENV PUPPETEER_SKIP_DOWNLOAD=true
USER root
RUN npm ci --omit=dev || npm install --omit=dev
COPY dist ./dist
USER pptruser

EXPOSE 8080
CMD ["node", "dist/main.js"]
