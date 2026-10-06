# Owner decision: account deletion 15 days vs 180 days

**SUPERSEDED 2026-10-06.** Owner selected a **45-day** cancellation window
after a confirmed account-deletion request. Do **not** implement 180. Do
**not** treat implemented 15 as the owner’s choice. Canonical worksheet:
`DELETION_45_PLAY_DISCLOSURE.md`.

This file is kept as provenance for the earlier 15-vs-180 ask. Choices A–D
below are **not** the live owner write.

**This is not a recorded owner choice.** Team 4 cannot close the public
deletion window for you. Counsel has not signed this. Google Play has not
approved a number in this repository. This sheet is **not legal advice** and
is **not immunity** from Play, DPDP, or any other law.

Worktree: `/Users/shivamsaurav/vyd-worktrees/grin-t4-product`  
Branch: `team/grin-t4-product`  
Combined (READ-ONLY): `aea65c170adb25f09ca1045593f18847df2f3b30`  
Application SHA to describe: `520f9f98bc952fd7f30a907da9e85774629a69c0`
(no AAB of this SHA).  
Canonical CI: run `37425360211` on `0d7aa17`.  
Fetched Play Help: **2026-10-06** (this continue; same calendar day as the
prior sheet). Confirm again in Play Console Help before any listing or
Data safety Save.

The other remaining owner write is storage caps:
`STORAGE_OWNER_CHOICE.md`. **Do not reopen** GRIN-in-existing-plans.

Do **not** publish website copy, flip billing, or submit Play forms from this
file.

---

## Three facts (do not collapse)

These are **three different statements**. Do not merge them into “the
deletion window is 15 days” or “the owner chose 180 days.”

| # | Fact | What it is today | What it is not |
|---|---|---|---|
| 1 | **Implemented** | **15 days.** `DELETION_GRACE_DAYS` / `DELETION_GRACE_MS` in `src/domain/identityLifecycle.ts` and `functions/src/deletion/finalPurge.ts` (and the same 15-day constant in identity resolve). Live `/privacy` and `/delete-account` copy also say 15-day pending deletion (re-read 2026-10-06). | Not “the owner already chose 15.” Not Play-certified. Not a public-policy close. Not Team 4 recording 15 as your final product decision. |
| 2 | **Owner requested** | **180 days** of recoverability after an **explicit account-deletion request**. | Not implemented. **Not** legally reviewed. **Not** Play-approved. Not a GST/tax retention period invented by this app. Not the 90+30 expiry clock. |
| 3 | **Final public-approved policy** | **UNRESOLVED.** | Not 15 by default. Not 180. Not 30. Not “keep shipping until someone objects.” |

Leaving the code at 15 days until you write a public window is an
**engineering hold**. It is **not** Team 4 recording 15 days as your choice.

Do **not** substitute **30 days**. Thirty days in this programme is the
**subscription-expiry notice** after a 90-day read window (see clocks
below), not the account-deletion clock.

---

## Changing `DELETION_GRACE_MS` does not implement a safe 180-day policy

If someone later sets `DELETION_GRACE_MS` (or `DELETION_GRACE_DAYS`) from
15 to 180, that change would only **lengthen the pending-deletion freeze**.
It would **not**, by itself:

- make six months of a disabled, fully recoverable workspace count as
  **account deletion** under Play User Data (freeze / disable ≠ delete);
- add GRIN Storage or GRIN Firestore trees to the production purge (P8);
- write counsel-approved `/privacy`, `/delete-account`, in-app legal, or
  Play Data safety copy;
- create the **optional recoverable archive** product (that is a different
  control — see clocks);
- close public-approved policy (fact 3 stays UNRESOLVED until you + counsel
  write it).

Team 4 **will not** change `DELETION_GRACE_MS` in this slice. Do **not**
treat a constant edit as the 180-day product.

---

## These are three different clocks

Do not mix them in listing copy, privacy text, or Functions jobs.

| Clock | What the user did | What the clock is | Status here |
|---|---|---|---|
| **Explicit account deletion** | User (or web email) asked to **delete the Vyaamikk Diary account** | Pending (`pending_deletion`) then purge after the **deletion grace** | Implemented **15 days**. Requested **180 days**. Public **UNRESOLVED**. |
| **Subscription / GRIN expiry (90+30)** | Paid/trial entitlement **ended**; the user did **not** ask to delete the account | Owner-described: **90 days** read/export, then **30 days** final notice. `expired_purge_eligible` is source machinery in other GRIN slices; **no production purge scheduler** is authorized from this sheet | **Not** account deletion. Do not stretch deletion grace to match 90+30, and do not shrink 90+30 to 15. |
| **Optional archival product** | User would **choose** “keep a recoverable copy” instead of (or in addition to) timely deletion | A **separate product** with its own consent, listing language, and implementation | **Not built.** Must not be the only deletion control. Must not be labelled “delete account.” |

Play Data safety also has a **different** 90-day idea: a badge for data that
is automatically deleted or anonymized **within 90 days of collection**
([Data safety Help — answer 10787469](https://support.google.com/googleplay/android-developer/answer/10787469),
fetched 2026-10-06). That badge is **not** this app’s account-deletion grace
and is **not** a reason to pick 90 (or 30) as the deletion window.

---

## What 15 days does today (implemented)

After the user confirms in-app deletion (Settings → Delete Account & Data):

1. The account becomes **pending deletion** (sign-in restricted; reactivation
   by re-OTP is possible during grace).
2. After **15 days**, `runFinalAccountPurge` may delete Firebase Auth, listed
   diary Firestore subcollections, and Storage prefixes
   `letterhead` / `attachments` / `pdfs` only.
3. A limited identity stub / retired-phone index can remain for anti-abuse.

**GRIN is omitted from that production purge** in this tree
(`USER_STORAGE_CATEGORIES` and `USER_SUBCOLLECTIONS` have no `grinEvidence` /
`goodsEvidence*` trees). Other slices prepared reusable GRIN lists behind
`INCLUDE_GRIN_IN_ACCOUNT_PURGE` defaulting **false**. **Do not flip that
flag** from this sheet.

Live purge behaviour: **NOT RUN** (do not execute deletion to “prove” this).

---

## What 180 days would be (requested, not approved)

A 180-day hold after an explicit deletion request would keep the account
**disabled but recoverable**, with diary (and any unpurged GRIN) data still
on Special Softwares systems, for about six months.

That is a **product/policy request**, not a drop-in change of
`DELETION_GRACE_MS`, and **not** a recorded legal or Play approval.

If you still want ~180 days of recoverability, treat it as an **optional
archive product** (separate consent, separate copy). Silently renaming a
six-month freeze “deletion” is the failure mode Play’s User Data policy
warns against.

---

## Official Play / Help references (fetched 2026-10-06)

Read the live articles again before any Console Save. Policy text can change.
Quoted language below is from Play Console Help as fetched this session.

| Source | URL | What it says that matters here |
|---|---|---|
| **User Data policy — Account Deletion Requirement** | [Play Console Help — User Data](https://support.google.com/googleplay/android-developer/answer/10144311) | Apps that create accounts must offer deletion **in-app and on an external web resource**. “When you delete an app account based on a user's request, you must also delete the user data associated with that app account.” **“Temporary account deactivation, disabling, or ‘freezing’ the app account does not qualify as account deletion.”** Extra retention only for legitimate security, fraud-prevention, or **regulatory** reasons, and **must be disclosed** (for example in the privacy policy). Key consideration table: **“Account freezing is not a valid substitute.”** Do / Don't: **“Don't present account freezing as a substitute for deletion.”** “Upon user request, delete all associated user data; merely freezing the account is not sufficient.” |
| **Understanding Google Play’s app account deletion requirements** | [Play Console Help — answer 13327111](https://support.google.com/googleplay/android-developer/answer/13327111) | Same in-app + web rule. Web link must load, be easy to find, name the app/developer as on the listing. Pathway may be **a form, a customer-service email, or similar**. **Mailto / support email is not automatically defective.** Fulfil requests in a **“reasonably quick” period**; Play does **not** publish a 15 / 30 / 180 day SLA. “Check with your legal advisors” — local law may be stricter. |
| **Data safety section** | [Play Console Help — answer 10787469](https://support.google.com/googleplay/android-developer/answer/10787469) | Data safety answers must match real deletion behaviour. The 90-day auto-delete **badge** is a **collection** disclosure (delete or anonymize within 90 days of collection), not this deletion-grace decision. |
| **Policy announcement (5 April 2023)** | [Play Console Help — answer 13411745](https://support.google.com/googleplay/android-developer/answer/13411745) | Account deletion requirement added under User Data; Data safety questions may show on the store listing. |
| **Android Developers Blog (6 March 2024)** | [Designing your account deletion experience](https://android-developers.googleblog.com/2024/03/designing-your-account-deletion-experience-google-play.html) | **UX guidance**, not a numbered Play SLA: explain consequences, consider recovery **“within a reasonable timeframe,”** and keep a web path that does **not** require reinstall. This blog does **not** approve 180 days. |

India privacy / DPDP (and any tax record-keeping duty) sit with **you and
counsel**. This sheet does **not** assert that 15 days, 180 days, or 90+30
is required or sufficient under those laws.

---

## Team 4 Play-risk framing (not your decision)

For you and counsel to test — **not recorded as Special Softwares’ choice**:

1. **Do not ship 180-day `pending_deletion` as “account deletion.”** Six months
   of a disabled but fully recoverable workspace is the kind of freeze Play
   says does not count. Play’s only timing words here are **reasonably
   quick**, plus “ask your lawyers.” There is no Play article in the table
   above that blesses 180 days.
2. **Do not treat implemented 15 days as your public-policy answer** just
   because it is already in code and on the live site. Public-approved policy
   is still **UNRESOLVED**.
3. **Do not pick 30 days** as a compromise. That number belongs to
   subscription-expiry notice (90+30), not this clock.
4. If you want long recoverability, specify an **optional archive** with
   separate consent, and keep a **timely deletion path** as the default
   “delete my account” control. Do not implement that product from this
   file.
5. Whatever number counsel writes for **explicit deletion**, **P8 stays
   open** until production purge actually covers GRIN (and nested ledger
   children) **and** the public window is written. Requesting 180 days does
   **not** close P8.

Engineering will **not** change `DELETION_GRACE_MS` in this slice. Engineering
will **not** flip `INCLUDE_GRIN_IN_ACCOUNT_PURGE`.

---

## Choices you still have to write (none is filled in)

| Choice | Plain meaning | What would have to happen later (not this slice) |
|---|---|---|
| **A.** Keep **15-day** pending then purge as the **public** deletion story | Accidental-reversal window, then erase what the job actually deletes | Counsel + Play listing / Data safety / `/privacy` / `/delete-account` must **say 15** as the approved public term. In-app legal baseline stays **2026-07-27**; live site today says **15 July 2026**. Do **not** backdate. New terms are a **new** revision. |
| **B.** Make **180-day** pending-then-purge the deletion story | Six-month freeze labelled as deletion | High Play-policy risk unless counsel documents a legitimate disclosed basis. Would still need GRIN in the purge architecture before public GRIN claims. **Not recommended as “deletion.”** Changing `DELETION_GRACE_MS` to 180 is **not** this choice implemented safely. |
| **C.** Keep a **timely** deletion path, and offer **optional 180-day archive** as a **different** button | Recoverability without pretending freeze is delete | New product: consent, copy, implementation, counsel. Pack PDFs today are `originalsBundled=false` — they are **not** that archive. |
| **D.** Leave **UNRESOLVED** | Current state | Code stays at implemented 15 days. Public GRIN / public deletion claims stay blocked. **P8 remains open.** |

**Owner choice (A / B / C / D):** _________________ **Date:** ________  
**Counsel:** _________________ **Play Console reviewer (if any):** _________________

Until that row is filled by you, Team 4 will describe the three facts
separately in handoff and listing worksheets.

---

## P8 — public deletion / retention (still open)

Independent QA labelled **P8** (public deletion/retention) **FAIL / open**
while both of these remain true:

1. Production account purge **omits GRIN** Storage (`users/{uid}/grinEvidence/**`)
   and GRIN Firestore trees. Nested ledger children would remain even if only
   first-level collection names were appended.
2. **Public-approved** explicit-deletion window is **UNRESOLVED**.

**180 requested does not close P8.** **15 implemented does not close P8.**

Do **not** flip `INCLUDE_GRIN_IN_ACCOUNT_PURGE`. Do **not** wire a live
expiry-purge scheduler from this sheet.

Safer Internal Testing disclosure until Packet D retention is implemented:
goods-evidence files used in internal testing may be retained until testers
are wiped or a deletion policy ships. Do **not** tell Play that GRIN
originals vanish with the account.

---

## Website and mailto (do not “fix” from this file)

Live `https://vyaamikk.specialsoftwares.com/delete-account` (HTTP 200,
re-read 2026-10-06 this continue): in-app path plus a **customer-service
email** to `support.vyd@specialsoftwares.com` (page tells the user to
identify Vyaamikk Diary in the subject; no reinstall required). The page
names Vyaamikk Diary and Ananya Engineered Industrial Components &
Pay Systems LLP. Play Help allows a customer-service email. **Do not call
mailto / support-email inherently defective. Do not invent a form. Do not
publish website changes from this file.** Inbox monitoring: **NOT RUN**.

Live `/privacy` effective date on page: **15 July 2026**. In-app
`LEGAL_EFFECTIVE_DATE`: **2026-07-27**. Preserve the in-app baseline. **Do
not backdate** a 180-day (or any new) term onto 2026-07-27.

Website `/~api/analytics` POST **202** does **not**, by itself, prove that
the first-party proxy forwards to Tinybird or any other external processor.
Upstream forward remains **UNKNOWN**. Do **not** claim `flock.js` forwards
solely from that 202.

---

## Related HOLD (unchanged by this sheet)

- `PLAY_BILLING_ENABLED` fail-closed (`=== "true"`). Client purchase-entry
  `"0"`. Tester restriction, when present, is **server-side UID allowlist
  behind enablement**; empty list denies all. **Not enabled. Not deployed
  from this file.**
- Play catalog / prices / license testers: **NOT RUN**. Do **not** reuse
  “catalog empty.” This continue: `gcloud` absent; no Android Publisher
  client; no Play Console session.
- Acceptance matrix (purchase, restore, pending, cancel, renewal, refund,
  duplicate RTDN, account switch, expiry, reconciliation): **SOURCE** tests
  where they exist; **LIVE_STORE NOT RUN**. See
  `docs/release/packets/APPROVAL_C_RESTRICTED_BILLING.md`.
- Listing screenshots: dashboard assets `safeForPublic: false` (demo names).
  Do not upload those to Play.
- Reviewer onboarding: owner/tester finishes **email + profile before
  review**. Reviewer uses `+91 9000000000` / OTP `654321` only if the live
  fixture is verified. No founder inbox in Play instructions.
  `docs/PLAY_REVIEW_SETUP.md`. **No `520f9f9` AAB** to complete that
  onboarding on the intended binary.

---

## Pointers

- Index of both remaining asks: `TWO_OWNER_DECISIONS.md`
- Storage GiB (the other remaining write): `STORAGE_OWNER_CHOICE.md`
- Engineering notes (not this owner sheet): `DELETION_WINDOW_180_PLAY.md`
- Handoff: `BILLING_PLAY_HANDOFF.md`
- Data safety rebuild: `DATA_SAFETY_REBUILD.md`
- Packet D (pricing recorded; storage GiB and public deletion still open):
  `docs/release/packets/D_OWNER_POLICY_OPTIONS.md`
