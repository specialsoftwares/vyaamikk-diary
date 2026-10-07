# 180-day deletion hold vs Play (Team 4 engineering notes)

**SUPERSEDED 2026-10-06.** Owner policy is **45-day** pending-then-purge, not
180. See `DELETION_45_PLAY_DISCLOSURE.md`. Do not implement 180. Changing
`DELETION_GRACE_MS` to 45 is the pending clock, not a recoverable archive,
not GRIN purge, and freeze still ≠ delete.

The notes below were written against the earlier 180-day request.

**PRIMARY owner decision sheet:**
`docs/release/proposals/team4/DELETION_45_PLAY_DISCLOSURE.md`

Application SHA to describe: `520f9f9` (no AAB). Combined READ-ONLY
`aea65c1`. CI `37425360211` on `0d7aa17`.

**Not implemented. Not legally approved. Not Play-approved.** Do not silently
reinterpret this as a shipped archive product. Do **not** treat implemented
15 days as the owner’s recorded public-policy choice.

Three facts, do not collapse: **implemented = 15 days**; **owner requested =
180 days**; **public-approved policy = UNRESOLVED**.

**Changing `DELETION_GRACE_MS` from 15 to 180 is not a safe 180-day
deletion policy.** It would only lengthen pending-deletion freeze. Play
User Data (answer 10144311, fetched 2026-10-06): “Temporary account
deactivation, disabling, or ‘freezing’ the app account does not qualify as
account deletion.” Engineering **does not** change that constant in this
slice.

Owner requested a **180-day** hold. Current code is a **15-day** pending
window (`DELETION_GRACE_DAYS` / `DELETION_GRACE_MS` = 15 days) in:

- `src/domain/identityLifecycle.ts`
- `functions/src/deletion/finalPurge.ts` (`DELETION_GRACE_MS`)
- `functions/src/identity/resolveOrCreateUserByPhone.ts`
- Live `/privacy` and `/delete-account` copy (15-day pending-deletion)

In-app legal baseline remains **2026-07-27**. Changing the window is a **new**
policy term (counsel + Play listing), not a backdate of `legal.ts`.

---

## 1. Play account deletion expectations

Play User Data / account deletion
([help](https://support.google.com/googleplay/android-developer/answer/13327111)):

- Apps that create accounts must offer **in-app** deletion **and** a **web**
  resource that works **without reinstalling** the app.
- Freezing, disabling, or “pending” the account is **not** deletion.
- Associated user data in scope of Data safety must be deleted when the
  account is deleted.
- Additional retention is allowed only for **legitimate** security,
  fraud-prevention, or **regulatory** reasons, and must be **disclosed**.
- Fulfil requests in a **reasonably quick** period; local law may be stricter.
- Web resource may be a **form, support email, or similar**. Mailto is not
  automatically defective if the page loads, identifies the app/developer, and
  the pathway is prominent.

Current web page (`https://vyaamikk.specialsoftwares.com/delete-account`,
HTTP 200): in-app path +
`mailto:support.vyd@specialsoftwares.com?subject=Vyaamikk%20Diary%3A%20Account%20deletion%20request`.
Operator named: Ananya Engineered Industrial Components & Pay Systems LLP.
**Do not invent a form. Do not publish website changes from this file.**
Mailbox monitoring: **NOT RUN**.

---

## 2. Can 180 days be justified as the deletion grace?

**Play-risk framing (not an owner decision recorded here):** not as the
pending-deletion window that *replaces* today’s implemented 15-day grace
*and is then labelled deletion*.

A 180-day period during which the account stays `pending_deletion` (disabled,
data retained, reversible by re-OTP) is **account freezing**, which Play
explicitly says does not qualify as deletion. “Reasonably quick” is not a
fixed Play SLA, but six months of holding the full workspace after a verified
deletion request is hard to defend as deletion and is not a recorded
regulatory retention basis.

Engineering **does not change** `DELETION_GRACE_MS` in this slice. That
hold is **not** “the owner chose 15.” Public-approved policy remains
**UNRESOLVED** until the owner + counsel fill the decision row on
`DELETION_15_VS_180_OWNER_SHEET.md`. Do **not** substitute 30 days.

---

## 3. Separate optional archive vs permanent deletion

If the owner wants ~180 days of recoverability, treat it as a **separate,
opt-in archive** — not as “deletion”:

| Model | Play posture | Product |
|---|---|---|
| A. 15-day pending then purge (current implementation) | Matches “delete after a short reversal window” **if** counsel makes it the public-approved term | Owner+counsel must still write it; not silently kept |
| B. 180-day pending then purge | Looks like freeze; high Play/policy risk | **Do not ship as deletion** |
| C. User chooses “Archive 180 days” **instead of** delete | Not deletion; must not be the only control; listing must not call it delete | New product; counsel; not this candidate |
| D. Delete the app account promptly; retain a **minimal** legally required subset (e.g. retired phone index) for a stated period | Allowed if disclosed | Closest to Play’s “additional retention” language |

Do **not** implement C or D from this file. Do not rename B to “archive” in
Play copy without shipping a real distinct flow.

---

## 4. GRIN and other purge gaps (independent of 15 vs 180)

Final Storage purge only walks:

`users/{uid}/letterhead/`, `attachments/`, `pdfs/`
(`USER_STORAGE_CATEGORIES`).

**Not included:** `users/{uid}/grinEvidence/**` (G2 originals/derivatives).

Firestore `USER_SUBCOLLECTIONS` is also a fixed list (`entries`,
`professionalPacks`, `letterheadDocs`, `customerCreditRecords`,
`purchaseOrders`, `config`, `counters`, `_saveLocks`, `trustedDevices`).
**Not included:** `goodsEvidenceAdmission`, `goodsEvidenceUploadControl`,
`grinEvidenceObjectKeys`, `grinEvidenceDerivativeKeys`, `goodsEvidenceLedgers`,
and billing docs under `subscription` / related billing collections.

**P8 remains open** while production purge omits GRIN and public-approved
deletion policy is UNRESOLVED. Do **not** flip `INCLUDE_GRIN_IN_ACCOUNT_PURGE`.
180 requested does not close P8.

Until Packet D retention is implemented, Data safety and `/delete-account`
must **not** claim GRIN originals (or those Firestore collections) vanish with
the account. Safer Internal text: goods-evidence files used in internal
testing may be retained until testers are wiped or a deletion policy ships.

Profile logos: device-local; web copy that they are purged from production
Storage may over-claim.

Live purge: **NOT RUN** (do not execute deletion).
