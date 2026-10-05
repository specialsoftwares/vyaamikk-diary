# 180-day deletion hold vs Play (Team 4 proposal)

**Not implemented. Not legally approved. Not Play-approved.** Do not silently
reinterpret this as a shipped archive product.

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

**Recommendation: no, not as the pending-deletion window that replaces
today’s 15-day grace.**

A 180-day period during which the account stays `pending_deletion` (disabled,
data retained, reversible by re-OTP) is **account freezing**, which Play
explicitly says does not qualify as deletion. “Reasonably quick” is not a
fixed Play SLA, but six months of holding the full workspace after a verified
deletion request is hard to defend as deletion and is not a recorded
regulatory retention basis.

Keep **15-day** accidental-reversal grace as the implemented product unless
counsel writes a **different** legal basis.

---

## 3. Separate optional archive vs permanent deletion

If the owner wants ~180 days of recoverability, treat it as a **separate,
opt-in archive** — not as “deletion”:

| Model | Play posture | Product |
|---|---|---|
| A. 15-day pending then purge (current) | Matches “delete after a short reversal window” if disclosed | **Keep** unless counsel says otherwise |
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

Until Packet D retention is implemented, Data safety and `/delete-account`
must **not** claim GRIN originals (or those Firestore collections) vanish with
the account. Safer Internal text: goods-evidence files used in internal
testing may be retained until testers are wiped or a deletion policy ships.

Profile logos: device-local; web copy that they are purged from production
Storage may over-claim.

Live purge: **NOT RUN** (do not execute deletion).
