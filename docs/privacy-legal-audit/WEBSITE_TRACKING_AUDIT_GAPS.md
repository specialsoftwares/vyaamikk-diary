# WEBSITE TRACKING AUDIT GAPS

**Tip:** `f1019b6`

## Scope limitation

The **authoritative public origin** used by the mobile app defaults is:

`https://vyaamikk.specialsoftwares.com`

The **Lovable website source is not present** in this repository. Therefore browser cookies, localStorage, sessionStorage, hosting analytics, CDN videos, form backends, and IP log retention **cannot be technically verified here**.

A legacy static mirror exists under `public-site/` but is **not** authoritative for the live `.com` site (outdated domains and emails).

---

## What the mobile repo *can* verify

| Item | Evidence |
|------|----------|
| Default Privacy/Terms/Support/Contact/Delete/Download URLs | `src/config/env.ts` |
| `/auth` forbidden for end users | `publicLinks.ts` / validation |
| App opens HTTPS via validated opener | `4d04786` path |
| Mailto support | `support.vyd@specialsoftwares.com` default |

---

## Exact Lovable / website audit questionnaire

Owner or Lovable implementer must answer with screenshots or HAR exports:

### A. Hosting and analytics

1. Which host serves `vyaamikk.specialsoftwares.com` (Lovable, Cloudflare, other)?
2. Is Lovable/project analytics enabled? If yes, which events and identifiers?
3. Are Google Analytics, Meta Pixel, Hotjar, or similar scripts present? List each tag ID.
4. Does the host log full IP addresses? Retention period?
5. Any CDN (Cloudflare/Fastly) bot management cookies?

### B. Cookies / storage

6. List every cookie name, purpose, duration, first/third party.
7. Is localStorage or sessionStorage used? Keys and purposes?
8. Is there a cookie consent banner? Does it block non-essential tags until accept?

### C. Forms and contact

9. Do `/support`, `/contact`, `/delete-account` post to a form backend? Which?
10. What fields are stored? Where? Retention?
11. Is delete-account a **mailto-only** page or a ticket system that creates a deletion request record?
12. Can a user request deletion **without reinstalling the app** via the web page alone? (Play expectation)

### D. Media and embeds

13. Are YouTube/Vimeo/other embeds present?
14. Any future demo videos and their host?

### E. Legal pages

15. Confirm live Privacy/Terms text matches counsel-approved draft (not `public-site` stale HTML).
16. Confirm support email on site is `support.vyd@specialsoftwares.com` (or owner-approved alternate).
17. Confirm no end-user CTA links to `/auth`.
18. Confirm App Store / Play badges are hidden or non-linking while URLs empty.

### F. Cross-claims

19. Language count claimed on marketing vs app `SUPPORTED_LANGS` (5: en/hi/ta/te/gu).
20. Any claim of “data stored only in India”, “end-to-end encrypted”, “we never share” — capture exact quotes for contradiction register.

---

## Interim Cookie Policy stance

Until A–D are answered: Cookie Policy drafts must state that **website cookie/analytics facts are unverified** and must not assert “we do not use cookies” or “we use analytics cookies” as facts.
