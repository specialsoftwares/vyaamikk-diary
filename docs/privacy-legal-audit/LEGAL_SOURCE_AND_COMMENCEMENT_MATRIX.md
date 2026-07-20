# LEGAL SOURCE AND COMMENCEMENT MATRIX

**Purpose:** Issue-spotting for Indian privacy law and Google Play user-data rules.  
**Not a legal opinion. Not legal advice. Counsel must independently verify.**

---

## 1. India — Digital Personal Data Protection Act, 2023 & Rules, 2025

### Primary sources consulted (internet)

| Source | URL / citation | Use |
|--------|----------------|-----|
| MeitY commencement notification G.S.R. 843(E) (13 Nov 2025) | Reproduced on government-linked mirrors incl. [dpdpact2023.com Section 1](https://www.dpdpact2023.com/Section_1); eGazette `https://egazette.gov.in/WriteReadData/2025/267647.pdf` | Phased commencement of Act provisions |
| PIB note on DPDP Rules 2025 notification | [PIB](https://www.pib.gov.in/PressNoteDetails.aspx?id=156054&lang=2&ModuleId=3&NoteId=156054&reg=3); PIB PDF | Rules notified ~14 Nov 2025 |
| DPDP Act, 2023 | Act No. 22 of 2023 (official text via Law/MeitY channels) | Substantive obligations |

### Phased commencement (from G.S.R. 843(E) text as published)

| Timing | Provisions (summary) | Status relative to 2026-07-21 |
|--------|----------------------|-------------------------------|
| On Gazette publication (~13 Nov 2025) | s.1(2), s.2 (definitions), ss.18–26 (Board establishment etc.), ss.35, 38–43, s.44(1)(3) | **Commenced** (per notification text) |
| **One year** after publication (~13 Nov 2026) | s.6(9); s.27(1)(d) | **Scheduled** — verify exact calendar with counsel |
| **Eighteen months** after publication (~13 May 2027) | ss.3–5; s.6(1)–(8),(10); ss.7–10; ss.11–17; s.27 (except (1)(d)); ss.28–34, 36, 37; s.44(2) — core fiduciary / rights / penalties cluster | **Scheduled** — verify with counsel |

**Rules 2025:** Notified (PIB). Specific rule-wise effective dates (immediate vs +1y vs +18m) appear in Rules notification schedules — counsel must read the **official Gazette Rules text**, not secondary blogs. Secondary commentary (e.g. LinkedIn summaries of Rule effective dates) is **not authoritative**.

### Issue-spotting themes for Vyaamikk Diary (non-exhaustive)

| Theme | Product touchpoint | Note |
|-------|--------------------|------|
| Notice / consent | Auth legal checkboxes + purpose limitation | Align notices with actual processors |
| Children’s data | Policy 18+; no age gate | Eligibility decision |
| Rights (access, correction, erasure) | Profile edit + deletion + support email | Erasure ≠ instant |
| Security safeguards | Firebase + SecureStore + rules | No certification claimed |
| Cross-border transfer | Firebase/Google | Disclosure + transfer basis when obligations commence |
| Significant Data Fiduciary | Volume/sensitivity of MSME records | Counsel assess SDF risk |

---

## 2. Google Play — User Data / Data Safety / Account deletion

| Source | URL |
|--------|-----|
| User Data policy | https://support.google.com/googleplay/android-developer/answer/10144311 |
| Account deletion requirements | https://support.google.com/googleplay/android-developer/answer/13327111 |
| Developer Program Policy hub | https://support.google.com/googleplay/android-developer/answer/17190352 |

### Requirements relevant to this app (paraphrase — verify live Play text)

1. Prominent privacy policy.  
2. Accurate Data Safety declarations.  
3. If account creation: **in-app** deletion **and** **web** deletion resource.  
4. Freezing is not a substitute for deletion; retain only with clear disclosure.  
5. Sensitive permissions (location, photos) need accurate disclosure; background location not used here.

---

## 3. What this matrix deliberately excludes

- Blog posts, policy generators, ChatGPT templates as authority.  
- Any statement that the product is “DPDP compliant” or “Play compliant.”
