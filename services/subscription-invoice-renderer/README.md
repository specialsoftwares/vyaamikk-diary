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

- Node 20
- `puppeteer@24.22.3`
- Image tag must match: `ghcr.io/puppeteer/puppeteer:24.22.3`

Do not deploy this service until the owner authorizes Cloud Run + IAM.
