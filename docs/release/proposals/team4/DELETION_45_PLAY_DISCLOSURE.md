# 45-day deletion — Play / privacy / Data safety (Team 4)

**Not a Play Save. Not a website publish.** Not legal advice.

Owner **2026-10-06:** explicit account deletion is a **45-day cancellation
window after a confirmed request**. This **supersedes** the 180-day request.
Implemented `DELETION_GRACE_DAYS` / `DELETION_GRACE_MS` is still **15** until
Team 2 lands the constant. **Do not treat 15 as the owner’s choice.**

Play User Data: freeze / disable / temporary deactivation **does not qualify**
as deletion.

Changing `DELETION_GRACE_MS` from 15 to **45** implements the **pending-then-purge
clock** only. It does **not**:

- create a recoverable archive product
- flip `INCLUDE_GRIN_IN_ACCOUNT_PURGE` (stays **false** until a separate grant)
- change subscription expiry (90 + 30)
- make a frozen account count as deleted for Play

P8 stays open while GRIN originals are omitted from purge **and** public
copy is not yet aligned with the wired clock.

---

## Three facts (do not collapse)

| # | Fact | Status 2026-10-06 |
|---|---|---|
| 1 | **Implemented** | **15 days** (code + live `/privacy` and `/delete-account`). Not owner choice. |
| 2 | **Superseded request** | **180 days** — do not implement. |
| 3 | **Owner policy** | **45-day** cancellation window after **confirmed** deletion request. Source not wired until T2. |

---

## Do not ship 15-day copy after T2 lands

| Surface | Rule |
|---|---|
| In-app Settings / pending-deletion | Already interpolates `DELETION_GRACE_DAYS`. Follows T2 automatically. |
| In-app privacy (`src/content/legal/documents.ts`) | Now interpolates `DELETION_GRACE_DAYS` (this continue). Counsel must bump `LEGAL_EFFECTIVE_DATE` before **public** ship of a 45-day term. Do not backdate 2026-07-27. |
| Live website `/privacy` `/delete-account` | Still say **15** today. **Do not publish** from this tree. After T2, replace with **45** before any public claim. Draft copy below. |
| Play Data safety / account deletion answers | **Do not Save** now. After T2, file **45 days**, never leftover **15**. |
| Play listing | **Do not Save / submit.** |

---

## Data safety answers to use **after T2** (not now)

Account creation: Yes. In-app delete: Yes (Settings → Delete Account & Data).
Web URL: `https://vyaamikk.specialsoftwares.com/delete-account` (mailto allowed;
do not invent a form).

**Data deletion period (explicit account deletion):** 45 days after confirmed
request (pending cancellation window, then purge of **app-controlled** cloud
records the job actually deletes).

**Additional retention:** anti-abuse indexes; device residual until uninstall;
shared/exported PDFs; **GRIN Storage / GRIN Firestore trees until a separate
purge grant** (`INCLUDE_GRIN_IN_ACCOUNT_PURGE=false`). Do not tell Play that
GRIN originals vanish with the account.

**Do not** describe 45 days as an archive you can fully restore as a product.
**Do not** describe Play freeze as deletion.

Until T2 lands, these answers must **not** be Saved (they would mismatch the
installed 15-day clock).

---

## Unpublished website draft (45-day) — do not publish

Replace the live “15-day grace period” sentences **only after**
`DELETION_GRACE_DAYS === 45`:

> After you confirm deletion in the app (or we confirm a web request), the
> account enters a **45-day** cancellation window. You can cancel by signing
> in with the same mobile number before that date. After the window, we run
> final deletion of app-controlled cloud records. Freeze or disable is not
> this process. Goods-evidence (GRIN) files used in internal testing may be
> retained until testers are wiped or a deletion policy that includes those
> files ships.

Operator / mailto remain as on the live page. Inbox monitoring: **NOT RUN**.

---

## Storage (do not advertise)

Owner selected Starter **1 GiB** / Professional **3 GiB** / Business **10 GiB**.
Neither 1/5/20 nor 256 MiB/1/5. **Do not advertise** on Play or the website.
Team 2 wires constants. Team 4 does not reopen GRIN-in-existing-plans.

---

## HOLD

No Play Save, no website publish, no billing activation, no GRIN purge flag.
