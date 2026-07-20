# WEBSITE LEGAL IMPLEMENTATION BRIEF FOR LOVABLE

**Audience:** Lovable / website implementers · **Owner must approve copy before publish**  
**Authoritative origin:** `https://vyaamikk.specialsoftwares.com`  
**Mobile tip reference:** `f1019b6`

---

## 1. Non-negotiable product constants

| Item | Value |
|------|-------|
| Product | Vyaamikk Diary |
| Brand | SPECIAL SOFTWARES |
| Operator string (pending counsel) | Ananya Engineered Industrial Components & Pay Systems LLP |
| Support email | `support.vyd@specialsoftwares.com` |
| Forbidden end-user route | `/auth` (developer integration only) |
| Store badges | Do not deep-link App Store/Play while URLs empty |
| Delete Account URL | `/delete-account` |
| Privacy / Terms | `/privacy` · `/terms` |

---

## 2. Pages to implement or update

1. `/privacy` — publish only counsel-approved text (from draft after markers resolved).  
2. `/terms` — same.  
3. `/cookie` or section in privacy — only after cookie audit.  
4. `/delete-account` — must satisfy Play “web resource to request deletion”:  
   - Clear in-App instructions (Settings → Delete Account & Data)  
   - Web request path (form **or** verified mailto process with expected handling time)  
   - 15-day grace explanation  
   - What cannot be deleted (shared PDFs; device residual)  
   - Support email `.com`  
5. `/support` `/contact` `/download` — consistent email and no `/auth` CTAs.  
6. Home marketing — language count must match App (**5**: English, Hindi, Tamil, Telugu, Gujarati) unless product changes.

---

## 3. Remove / avoid

- Legacy `.in` hosts as primary canonical (`vyaamikk.specialsoftwares.in`, `vyaamikkdiary.in`) in user-facing canonical tags  
- `support@specialsoftwares.in` if product support is `support.vyd@specialsoftwares.com`  
- Claims: “we never share data”, “data never leaves India”, “military-grade encryption”, “instant deletion”, “email reply reactivates account”  
- End-user buttons to `/auth`  
- Active store download buttons with empty destinations  

---

## 4. Tracking / consent engineering tasks

Complete `WEBSITE_TRACKING_AUDIT_GAPS.md`. Then:

- Document every cookie/tag  
- Add consent banner **if** non-essential tags exist  
- Ensure analytics (including Lovable project analytics) are disclosed or disabled per owner decision  

---

## 5. Delete-account UX acceptance criteria (Play-oriented)

- Discoverable URL works without installing the App  
- Explains in-App path  
- Provides a way to **request** deletion if App inaccessible  
- Does not claim freezing is the end state  
- States 15-day grace truthfully  
- Lists limitations honestly  

---

## 6. Handoff artifacts from this repo

- `DRAFT_*_FOR_REVIEW.md` files in `docs/privacy-legal-audit/`  
- Contradiction register  
- Owner questionnaire  

**Do not publish drafts containing `[OWNER CONFIRMATION REQUIRED]` markers.**
