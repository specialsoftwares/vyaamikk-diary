# Website + Android App Links — handoff (not deployed)

Date: 2026-10-08 · Mobile tree: `feature/unified-material-movement-aso`

**Authoritative origin:** `https://vyaamikk.specialsoftwares.com`  
**Mobile `public-site/`:** older proposal — **not** treated as current deployment source.  
**Website repository:** unavailable in this coordinator worktree set — changes below are a handoff, not implemented/deployed.

## Public feature pages to add (website repo)

| Path | Purpose |
|---|---|
| `/features/business-records` | Crawlable overview of diary records |
| `/features/goods-receipt` | GRIN explained as goods receipt & inspection |
| `/features/letterhead-pdf` | Letterhead documents |
| `/features/returns` | Returns linked to own receipts (honest: not replacement stock) |

Each page needs: unique title/description, canonical URL, OG/Twitter metadata, truthful FAQ/HowTo structured data only when accurate, sitemap entries for real public pages only. No fabricated ratings, prices, testimonials, or JobPosting.

Do **not** change Firestore/Storage Rules for searchability of private records.

## Android App Links (mobile + website)

| Item | Value |
|---|---|
| Package | `com.specialsoftwares.vyaamikkdiary` |
| Custom scheme (existing) | `vyaamikkdiary` |
| HTTPS host | `vyaamikk.specialsoftwares.com` |
| Path prefixes (narrow) | `/features`, `/faq`, `/support`, `/download` — **exclude** `/auth`, legal callback paths |
| Native content | Informational screens matching public feature pages + CTA into existing auth/admission |
| Listeners | No duplicate Linking listeners; no UID/UEID authorization via query |

### `/.well-known/assetlinks.json` (website)

Use the **complete verified Play App Signing SHA-256** (not upload-key, not shortened historical fingerprint). Preserve any existing associations. If the live signing cert fingerprint is not available in this session, leave a `PLAY_APP_SIGNING_SHA256_PENDING` placeholder — do not invent.

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.specialsoftwares.vyaamikkdiary",
    "sha256_cert_fingerprints": ["PLAY_APP_SIGNING_SHA256_PENDING"]
  }
}]
```

No Firebase Dynamic Links. No claim that App Links resume a pre-install destination after install.

## Mobile config patch (separate reviewable; not applied in MM candidate)

Additive `intentFilters` under Android in `app.json` / `app.config.js` for https host + pathPrefix `/features` only, preserving existing scheme and Google services remapping. Requires a dedicated PR after owner supplies Play App Signing SHA-256 and website deploy of assetlinks.
