# Website `/~flock.js` inspection — 2026-10-06

Read-only. Not a website publish. Filename alone is not proof of third-party
analytics. App binaries do not load this script.

## What the script is

Fetched `https://vyaamikk.specialsoftwares.com/~flock.js` (~20.8 KiB).
It is a **Tinybird** web analytics bundle:

- `window.Tinybird = { trackEvent }`
- web-vitals (FCP/CLS/INP/LCP/TTFB) optional
- default POST destination if no proxy attributes:
  `https://api.tinybird.co/v0/events?name=analytics_events&token=…`
- session id in cookie / localStorage / sessionStorage (`session-id`, 30 min)

## How the live privacy page loads it

`GET /privacy` HTML (HTTP 200, Cloudflare):

```html
<script defer src="/~flock.js" data-proxy-url="/~api/analytics">
```

Because `data-proxy-url` is set, the script’s destination is **same-origin**
`/~api/analytics`, not the default Tinybird URL.

## Proxy behaviour (this session)

| Request | Result |
|---|---|
| `OPTIONS /~api/analytics` | HTTP **404** |
| `POST /~api/analytics` `{"probe":true}` | HTTP **202**, body `Accepted` (8 bytes) |

So a first-party ingest endpoint **exists** and accepts POSTs. Whether that
proxy **forwards to Tinybird** (or another processor) is **UNKNOWN** without
hosting/Lovable configuration. Do not claim “no third-party analytics”
from the first-party URL alone.

## Other hosting signals

- `server: cloudflare`; `__cf_bm` bot-management cookie on `/privacy`.
- Privacy §6 already says hosting/CDN/security/request-log processing is
  handled by the website hosting provider. Cloudflare bot cookie is
  consistent with that, not with an in-app SDK.
- Cookie policy URL live: `https://vyaamikk.specialsoftwares.com/cookies`.

## Contradiction to resolve (website only)

Privacy copy: “This marketing website itself does not load third-party
analytics, advertising, session-replay or marketing pixels.”

`/~flock.js` **is** an analytics collector. If the proxy stays first-party
and Tinybird is only a processor, copy should name that processor (or the
script should be removed). If the proxy still posts to `api.tinybird.co`,
the “does not load third-party analytics” sentence is false.

**Do not publish website changes without authorization.**
**Do not backdate** in-app `LEGAL_EFFECTIVE_DATE` `2026-07-27` to match
the live site **15 July 2026**. Preserve the accepted legal baseline;
fix the **site** date/copy when authorized.

App Data safety: website analytics remain **separate** unless an app
integration loads this script (it does not).
