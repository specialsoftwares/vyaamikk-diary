# Website ↔ Mobile Store Integration

**Date:** 2026-07-16  
**Scope:** Mobile app alignment with the Lovable marketing/legal website.  
**Does not:** rewrite legal policy bodies, deploy DNS, publish the site, or claim a final canonical domain.

---

## Website architecture (authoritative context)

| Field | Value |
|-------|-------|
| Builder | Lovable (separate repo) |
| Stack | TanStack Start, React 19, Cloudflare Workers |
| Status | **Pre-launch** — private / unpublished |
| Product | Vyaamikk Diary |
| Development brand | SPECIAL SOFTWARES |
| Legal operator | Ananya Engineered Industrial Components & Pay Systems LLP |
| Support email | `support.vyd@specialsoftwares.com` |
| Store listings | **None live** — no App Store or Google Play URLs on the website |

### Public routes (Lovable)

| Route | Purpose |
|-------|---------|
| `/` | Marketing home |
| `/privacy` | Privacy Policy |
| `/terms` | Terms of Use |
| `/support` | Support |
| `/contact` | Contact |
| `/delete-account` | Web account-deletion request |
| `/download` | Download / launch status (pre-launch) |
| `/faq` | FAQ |

### Non-public / forbidden for mobile end-users

| Route | Purpose |
|-------|---------|
| `/auth` | **Developer Integration Sign-In** (MCP/OAuth) — `noindex`. **Never** present as mobile-app login or open from the app. |

---

## Canonical domain — OWNER DECISION PENDING

Unresolved between:

1. `https://specialsoftwares.com`
2. `https://vyaamikk.specialsoftwares.in`

**Mobile policy:** provisional `EXPO_PUBLIC_*` defaults may still use path structure on `vyaamikk.specialsoftwares.in` for local/dev continuity. They are **not** a published final origin. Do not hard-code the other host as final either. Replace all public URLs in EAS secrets / `.env` when the owner confirms DNS + publication.

---

## Mobile public-link configuration

| Module | Role |
|--------|------|
| `src/config/env.ts` (`env.brand.*`) | Reads `EXPO_PUBLIC_*` |
| `src/config/publicLinks.ts` | Validates / opens links; blocks `/auth`; empty store URLs = pre-launch |
| `src/config/legal.ts` | Legal copy + versions; surfaces URLs from env |
| `src/config/appLinks.ts` | Install / store helpers for share text |

### Environment keys

| Key | Website route | Notes |
|-----|---------------|-------|
| `EXPO_PUBLIC_WEBSITE_URL` | `/` | Home |
| `EXPO_PUBLIC_PRIVACY_URL` | `/privacy` | Required for production |
| `EXPO_PUBLIC_TERMS_URL` | `/terms` | Required for production |
| `EXPO_PUBLIC_LEGAL_URL` | `/` (hub) | Site has **no** `/legal` combined page |
| `EXPO_PUBLIC_SUPPORT_URL` | `/support` | |
| `EXPO_PUBLIC_CONTACT_URL` | `/contact` | |
| `EXPO_PUBLIC_ACCOUNT_DELETION_URL` | `/delete-account` | Required for production |
| `EXPO_PUBLIC_APP_INSTALL_URL` | `/download` | Pre-launch status page; required HTTPS for production builds |
| `EXPO_PUBLIC_SUPPORT_EMAIL` | mailto | Default `support.vyd@specialsoftwares.com` |
| `EXPO_PUBLIC_APP_STORE_URL` | — | **Empty** until listing live |
| `EXPO_PUBLIC_PLAY_STORE_URL` | — | **Empty** until listing live |

---

## App → website link matrix

| Source | Function / UI | Present value (provisional default) | Mode | Label | Site exists? | Prod-safe? |
|--------|---------------|-------------------------------------|------|-------|--------------|------------|
| `env.brand.websiteUrl` | Legal hub / About open | `…specialsoftwares.in` | all | Website home | ✅ `/` | Pending DNS |
| `env.brand.privacyUrl` | Consent footer, About, legal viewer | `…/privacy` | all | Privacy Policy | ✅ | Pending DNS |
| `env.brand.termsUrl` | Consent footer, legal viewer | `…/terms` | all | Terms | ✅ | Pending DNS |
| `env.brand.legalUrl` | Settings legal hub external | `…/` (was `/legal`) | all | Hosted hub | ✅ home | Fixed path |
| `env.brand.supportUrl` | About Support row | `…/support` | all | Support | ✅ | Pending DNS |
| `env.brand.contactUrl` | Available via `publicLinks` | `…/contact` | all | Contact | ✅ | Pending DNS |
| `env.brand.accountDeletionUrl` | Delete screen web link | `…/delete-account` | all | Web deletion | ✅ | Pending DNS |
| `env.brand.installUrl` | Share / install helper | `…/download` | all | Download status | ✅ | Pre-launch OK |
| `env.brand.appStoreUrl` | `appLinks` | *(empty)* | all | — | ❌ no listing | ✅ empty = no link |
| `env.brand.playStoreUrl` | `appLinks` | *(empty)* | all | — | ❌ no listing | ✅ empty = no link |
| `env.brand.supportEmail` | About, mailto, landing | `support.vyd@specialsoftwares.com` | all | Support email | n/a | ✅ |
| In-app `/legal/[doc]` | Consent checkboxes | Local document viewer | all | Terms/Privacy | In-app | ✅ not website `/auth` |
| `getAuthEntryHref()` | App login | `/(auth)/v2` | all | Sign in | App route | ✅ not website `/auth` |

---

## Mobile account-deletion path (source of truth)

**Exact path:**

1. Tab **Settings** (`app/(app)/(tabs)/settings.tsx`)
2. Card **“Delete Account & Data”** (`settings.deleteAccountAndData`)
3. Screen `/(app)/settings/delete` — title **“Delete Account & Data”**

**Also reachable from:** Settings → About → **Delete account** link → same screen.

**Website handover statement:** `Profile → Account & data → Delete account`  
**Mismatch:** Mobile does **not** nest deletion under Profile Identity. Lovable copy should be corrected later to:

> **Settings → Delete Account & Data**

(or “Settings → About → Delete account”).

### Hardened behaviour reflected in copy

- Deletion enters a **pending-deletion** grace period.
- **Business writes are blocked** while pending.
- Reactivation requires **in-app identity verification** (email code / supported flow).
- **Email reply alone is not sufficient** to cancel deletion (stated in `deleteAccount` / `pendingDeletion` strings).

---

## Store listing URL candidates (when live)

### Apple App Store Connect

| Field | Candidate |
|-------|-----------|
| Marketing URL | Confirmed website home (`EXPO_PUBLIC_WEBSITE_URL`) |
| Support URL | `EXPO_PUBLIC_SUPPORT_URL` (`/support`) |
| Privacy Policy URL | `EXPO_PUBLIC_PRIVACY_URL` (`/privacy`) |

### Google Play Console

| Field | Candidate |
|-------|-----------|
| Privacy policy | `EXPO_PUBLIC_PRIVACY_URL` |
| Account deletion (external) | `EXPO_PUBLIC_ACCOUNT_DELETION_URL` |
| Store listing website | Website home |

Leave `EXPO_PUBLIC_APP_STORE_URL` / `EXPO_PUBLIC_PLAY_STORE_URL` empty until listings exist. Do not render empty store URLs as active buttons.

---

## Owner confirmations still required

- [ ] Final canonical domain (`.com` vs `.in`)
- [ ] Public website deployment + DNS
- [ ] LLPIN / registered office / grievance officer name & address
- [ ] OG image, CSP, HSTS on website
- [ ] Privacy label / Data Safety form alignment
- [ ] Real App Store + Play Store listing URLs
- [ ] Counsel review of hosted privacy/terms content
- [ ] Lovable deletion-path wording correction

---

## Checklist — replacing pre-launch store links

1. Confirm canonical host and update all `EXPO_PUBLIC_*` URL hosts (EAS secrets + local `.env`).
2. Set `EXPO_PUBLIC_APP_STORE_URL` and `EXPO_PUBLIC_PLAY_STORE_URL` to live listing URLs.
3. Update website `/download` CTAs to real store buttons (Lovable).
4. Re-run `npm run test:public-links` and production guard on a production-mode build.
5. Submit App Store Marketing/Support/Privacy URLs and Play Data Safety + external deletion URL.

---

## Related commits / docs

- Environment isolation: `3bc2e2e`
- Production readiness: `PRODUCTION_READINESS.md`
- Pre-build handover: `PRE_BUILD_EDGE_CASE_HANDOVER.md`
