# Website ↔ Mobile Store Integration

**Date:** 2026-07-16 (domain reconciled)  
**Scope:** Mobile app alignment with the published Vyaamikk Diary marketing/legal website.  
**Does not:** rewrite legal policy bodies, invent store listings, or change Firebase/auth.

---

## Website architecture (authoritative)

| Field | Value |
|-------|-------|
| Builder | Lovable (separate repo) |
| Stack | TanStack Start, React 19, Cloudflare Workers |
| **Production origin** | **`https://vyaamikk.specialsoftwares.com`** (final — published) |
| Status | Public website **deployed**; store listings still pre-launch |
| Product | Vyaamikk Diary |
| Development brand | SPECIAL SOFTWARES |
| Legal operator | Ananya Engineered Industrial Components & Pay Systems LLP |
| Support email | `support.vyd@specialsoftwares.com` |
| Store listings | **None live** — App Store / Play URLs remain empty in the app |

### Public routes

| Route | Absolute URL |
|-------|----------------|
| `/` | `https://vyaamikk.specialsoftwares.com/` |
| `/privacy` | `https://vyaamikk.specialsoftwares.com/privacy` |
| `/terms` | `https://vyaamikk.specialsoftwares.com/terms` |
| `/support` | `https://vyaamikk.specialsoftwares.com/support` |
| `/contact` | `https://vyaamikk.specialsoftwares.com/contact` |
| `/delete-account` | `https://vyaamikk.specialsoftwares.com/delete-account` |
| `/download` | `https://vyaamikk.specialsoftwares.com/download` |
| `/faq` | `https://vyaamikk.specialsoftwares.com/faq` |

### Forbidden for mobile end-users

| Route | Purpose |
|-------|---------|
| `/auth` | Developer Integration Sign-In (MCP/OAuth) — `noindex`. **Never** present as mobile-app login or open from the app. `classifyPublicUrl` / `openPublicLink*` reject any `…/auth` URL. |

Legacy host `https://vyaamikk.specialsoftwares.in` is **retired** and must not appear in mobile defaults, tests, or integration docs.

---

## Mobile public-link configuration

| Module | Role |
|--------|------|
| `src/config/env.ts` (`env.brand.*`) | Reads `EXPO_PUBLIC_*` — defaults use `.com` origin |
| `src/config/publicLinkValidation.ts` | Pure URL classification; blocks `/auth`; empty store = pre-launch |
| `src/config/publicLinks.ts` | Resolves / opens links from env |
| `src/config/legal.ts` | Legal copy + versions |
| `src/config/appLinks.ts` | Install / store helpers for share text |

### Environment keys

| Key | Resolved default |
|-----|------------------|
| `EXPO_PUBLIC_WEBSITE_URL` | `https://vyaamikk.specialsoftwares.com` |
| `EXPO_PUBLIC_PRIVACY_URL` | `https://vyaamikk.specialsoftwares.com/privacy` |
| `EXPO_PUBLIC_TERMS_URL` | `https://vyaamikk.specialsoftwares.com/terms` |
| `EXPO_PUBLIC_LEGAL_URL` | `https://vyaamikk.specialsoftwares.com/` |
| `EXPO_PUBLIC_SUPPORT_URL` | `https://vyaamikk.specialsoftwares.com/support` |
| `EXPO_PUBLIC_CONTACT_URL` | `https://vyaamikk.specialsoftwares.com/contact` |
| `EXPO_PUBLIC_ACCOUNT_DELETION_URL` | `https://vyaamikk.specialsoftwares.com/delete-account` |
| `EXPO_PUBLIC_APP_INSTALL_URL` | `https://vyaamikk.specialsoftwares.com/download` |
| `EXPO_PUBLIC_SUPPORT_EMAIL` | `support.vyd@specialsoftwares.com` |
| `EXPO_PUBLIC_APP_STORE_URL` | *(empty — pre-launch)* |
| `EXPO_PUBLIC_PLAY_STORE_URL` | *(empty — pre-launch)* |

---

## App → website link matrix

| Kind | Default | Site | Prod-safe? |
|------|---------|------|------------|
| Home | `https://vyaamikk.specialsoftwares.com/` | ✅ | ✅ |
| Privacy | `…/privacy` | ✅ | ✅ |
| Terms | `…/terms` | ✅ | ✅ |
| Support | `…/support` | ✅ | ✅ |
| Contact | `…/contact` | ✅ | ✅ |
| Deletion | `…/delete-account` | ✅ | ✅ |
| Download | `…/download` | ✅ | ✅ (pre-launch page) |
| App Store / Play | *(empty)* | — | ✅ non-openable |
| `/auth` | — | Dev only | ✅ blocked |

---

## Mobile account-deletion path (source of truth)

**Settings → Delete Account & Data → `/(app)/settings/delete`**  
(Also: Settings → About → Delete account)

Website copy should say the same — not `Profile → Account & data`.

---

## Store listing URL candidates (when live)

| Platform | Field | Candidate |
|----------|-------|-----------|
| App Store | Marketing URL | `https://vyaamikk.specialsoftwares.com/` |
| App Store | Support URL | `…/support` |
| App Store | Privacy Policy | `…/privacy` |
| Google Play | Privacy policy | `…/privacy` |
| Google Play | External deletion | `…/delete-account` |

Leave `EXPO_PUBLIC_APP_STORE_URL` / `EXPO_PUBLIC_PLAY_STORE_URL` empty until listings exist.

---

## Owner confirmations still outstanding

- [x] Final canonical domain → **`vyaamikk.specialsoftwares.com`**
- [x] Public website deployment + DNS
- [ ] LLPIN / registered office / Grievance Officer name & address
- [ ] OG image
- [ ] CSP enforcement, HSTS
- [ ] Privacy label / Data Safety form alignment
- [ ] Real App Store + Play Store listing URLs
- [ ] Counsel review of hosted privacy/terms content (content accuracy)
- [ ] Lovable deletion-path wording if still mismatched

---

## Checklist — replacing pre-launch store links

1. Set `EXPO_PUBLIC_APP_STORE_URL` and `EXPO_PUBLIC_PLAY_STORE_URL` to live listing URLs (EAS secrets + `.env`).
2. Update website `/download` CTAs to real store buttons (Lovable).
3. Re-run `npm run test:public-links` and a production-mode config assert.
4. Submit App Store Marketing/Support/Privacy URLs and Play Data Safety + external deletion URL.

---

## Related

- Prior integration: `900c46e`
- Domain reconciliation: this pass (`Fix: set production website domain`)
- Production readiness: `PRODUCTION_READINESS.md`
- Pre-build handover: `PRE_BUILD_EDGE_CASE_HANDOVER.md`
