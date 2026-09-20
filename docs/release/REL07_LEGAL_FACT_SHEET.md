# REL-07 legal fact sheet

HTTP 200 is **not** legal approval. Effective dates must follow approved versions / adoption history; do not pick today’s date or silently “fix” the mismatch. Registered address / officer / contact requires owner or counsel confirmation. No website publish from this repo.

Website repository/host is the documented Lovable / TanStack / Cloudflare site at `https://vyaamikk.specialsoftwares.com` (`docs/WEBSITE_STORE_INTEGRATION.md`). It is not this mobile repository and not a Vercel app in-tree.

## URLs checked (Cursor HTTP)

Checked 2026-09-19T07:46:16Z–07:46:25Z (`curl -sI`, HTTP/2). Independent web reader previously could not retrieve these pages; treat the 200s as **Cursor evidence only**.

| Config key / symbol | URL | HEAD |
| --- | --- | --- |
| `env.brand.privacyUrl` | https://vyaamikk.specialsoftwares.com/privacy | 200 |
| `env.brand.termsUrl` | https://vyaamikk.specialsoftwares.com/terms | 200 |
| `env.brand.supportUrl` | https://vyaamikk.specialsoftwares.com/support | 200 |
| `env.brand.contactUrl` | https://vyaamikk.specialsoftwares.com/contact | 200 |
| `env.brand.accountDeletionUrl` | https://vyaamikk.specialsoftwares.com/delete-account | 200 |

Defaults: `src/config/env.ts`. Aggregated in `src/config/legal.ts`. Runtime open path: `src/config/publicLinks.ts` (blocks `/auth`).

Store listing URLs: `EXPO_PUBLIC_APP_STORE_URL` / `EXPO_PUBLIC_PLAY_STORE_URL` empty (pre-launch). Support mailbox default: `support.vyd@specialsoftwares.com`.

## Current app copy (`src/config/legal.ts`)

| Field | Value in app source |
| --- | --- |
| `LEGAL_EFFECTIVE_DATE` | `2026-07-01` — comment: **placeholder until counsel confirms publication date** |
| Consent / privacy / terms versions | `1.0.0` |
| `LEGAL_ENTITY_ADDRESS` | `[REGISTERED ADDRESS — Delhi NCR, India — confirm with counsel]` |
| Grievance officer name | `[GRIEVANCE OFFICER NAME — confirm with counsel]` |
| Grievance officer email | `grievance@specialsoftwares.in` |
| Legal entity name | `LEGAL_OPERATOR` from `src/config/brand.ts` (Ananya Engineered Industrial Components & Pay Systems LLP in website docs) |

`findLegalConfigBlockers()` flags bracketed officer name and registered address. Production config assertion exists; do not invent replacements.

In-app deletion path (source of truth for website copy): Settings → Delete Account & Data → `/(app)/settings/delete`.

## Current website copy (fetched body, Cursor)

Privacy and Terms pages both show **Effective: 15 July 2026** / **Last updated: 15 July 2026**. Operator named: Ananya Engineered Industrial Components & Pay Systems LLP, brand SPECIAL SOFTWARES.

Website grievance channel on the privacy page: `support.vyd@specialsoftwares.com` (not the app’s `grievance@specialsoftwares.in` / named officer placeholders).

Account deletion page: 15-day pending-deletion window (aligned with terms §12). Do not treat alignment of that number as a counsel sign-off.

## Unresolved facts (owner / counsel)

1. Which **effective date** is authoritative: app `2026-07-01`, website **15 July 2026**, or another adopted version? Do not change either in this queue.
2. Registered office / LLPIN / legal address (app still placeholder).
3. Grievance officer **name** and whether the public mailbox is `grievance@specialsoftwares.in`, `support.vyd@specialsoftwares.com`, or both.
4. Whether hosted policy bodies match the last counsel-approved text (HTTP 200 + title match is not content approval).
5. Store Data Safety / privacy-label alignment once listings exist.

No legal URL, placeholder, or website file is changed by this task.
