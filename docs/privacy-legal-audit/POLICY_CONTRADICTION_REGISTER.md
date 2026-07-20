# POLICY CONTRADICTION REGISTER

**Tip:** `f1019b6` · Do not silently pick a side — correct sources of truth.

| ID | Topic | Representation A | Representation B | Authoritative technical evidence | Required correction |
|----|-------|------------------|------------------|----------------------------------|---------------------|
| C1 | Public website host | `env.ts` / mobile: `vyaamikk.specialsoftwares.com` | `docs/legal/PRIVACY_POLICY.md`, `public-site/*`: `.in` / `vyaamikkdiary.in` | Mobile defaults `.com` (`0b12fb4`) | Update repo legal docs + live site; retire `.in` in user copy |
| C2 | Support email | Default `support.vyd@specialsoftwares.com` | `public-site` + short PRIVACY_POLICY: `support@specialsoftwares.in` | `env.ts` brand.supportEmail | Align all public pages + policies |
| C3 | Grievance email domain | `grievance@specialsoftwares.in` in `legal.ts` | Support on `.com` | Placeholders still present | Owner/counsel assign final mailboxes |
| C4 | “We do not sell” vs Firebase | In-app privacy: do not sell | Firebase **processes** data as infrastructure | Both can be true if carefully worded | Never say “we do not share with anyone”; disclose processors |
| C5 | Deletion immediacy | Users may infer instant erase | Code: **15-day grace** then async purge | `DELETION_GRACE_DAYS = 15` | Policies must state grace + async |
| C6 | Web deletion initiates erase | Play needs web request path | `public-site` is mailto + instructions; live Lovable unknown | Mobile opens URL only | Verify live page; disclose if manual ops |
| C7 | Local data after delete | Some copy acknowledges device residual | Users may expect full wipe | No server-driven SQLite wipe found | Disclose device residual |
| C8 | Storage deletion | Policies imply cloud data deleted | **Repo now purges Storage prefixes**; soft-delete/backup still EXTERNAL; **deploy pending** | `finalPurge` + `storagePurge` | Disclose provider recovery windows; deploy Functions |
| C9 | Auth deletion | Implied full account erase | **Repo now deletes Auth user last**; **deploy pending** | `authDelete.ts` | Deploy + verify |
| C10 | Languages | Marketing may claim N languages | App UI supports **5** (`en,hi,ta,te,gu`); profile type still `en\|hi` | `src/i18n/types.ts` vs `types.ts` LangCode | Align marketing + fix profile type drift |
| C11 | Children 18+ | Policy states 18+ | No age gate in auth | `documents.ts` vs auth flows | Product decision: gate vs acknowledgment |
| C12 | Encryption at rest / India-only | Risk of overclaim in drafts | Not verified in repo | Absence | Forbid unverified claims |
| C13 | PDF cloud backup | Preference key `vyd_pdf_cloud_backup_v1` exists | In-app privacy says PDFs not automatically uploaded | Preference + privacy text | Clarify when backup flag uploads |
| C14 | Legal entity address / officer | Placeholders `LEGAL_ENTITY_ADDRESS`, GO name | Required for DPDP grievance publishing | `legal.ts` blockers | Owner fill before publish |
| C15 | Effective date | `2026-07-01` placeholder | May not match counsel publication | `LEGAL_EFFECTIVE_DATE` | Counsel set |
| C16 | Account deletion URL host | `.com/delete-account` | Legacy HTML canonical `.in` | env default | Align SEO/canonical on live site |

---

## Priority for publication blockers

**Must resolve before public legal pages / Play listing:** C1, C2, C5, C6, C8 (or disclose), C14, C15.  
**Should resolve soon:** C3, C7, C9, C10, C11, C13.
