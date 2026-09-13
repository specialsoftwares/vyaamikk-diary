# Subscription invoice renderer (Cloud Run)

Isolated HTML → PDF service for Vyaamikk Diary tax documents.

**Selected architecture:** owner decision B — dedicated Cloud Run Chromium/Puppeteer renderer.

## Non-goals

This service must never:

- access Firestore
- allocate invoice numbers
- determine GST
- read purchase tokens or billing credentials
- send email
- expose a generic URL-to-PDF or browsing proxy

## Auth (deployment time — not provisioned in VYD-40)

Cloud Run requires IAM authentication. The Firebase Functions billing service
account receives only `roles/run.invoker`. Callers present a Google-signed
ID token whose audience is the exact `INVOICE_RENDERER_URL`.

No API keys. No shared bearer secrets. No unauthenticated invocation.

## Local / contract tests

`npm test` exercises protocol and HTTP bounds with a fake renderer (no Chromium).

## Pin

- Isolated Cloud Run service: Node 22 (`ghcr.io/puppeteer/puppeteer:24.22.3`). `package.json` `engines.node` is `"22"`.
- GitHub Actions installs renderer deps inside `node:22-bookworm-slim` so the Node 20 job runner cannot emit EBADENGINE.
- `puppeteer@24.22.3`
- Image tag must match: `ghcr.io/puppeteer/puppeteer:24.22.3`

## Production-enablement gate (Cloud Run)

Before Cloud Run is enabled, review reachable runtime vulnerabilities with:

`npm audit --omit=dev --json`

against this exact pinned Puppeteer image. Do **not** run `npm audit fix --force`.
This is a Cloud Run production-enablement gate, not a VYD-40 merge blocker while
the renderer is undeployed.

Do not deploy this service until the owner authorizes Cloud Run + IAM.
