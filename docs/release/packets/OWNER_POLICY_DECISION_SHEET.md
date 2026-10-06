# Owner decision sheet — GRIN pricing, quota, retention

Encrypted PDF backup = backlog. No “zero knowledge,” legal immunity,
automatic GST eligibility, or live 2B/EWB claims. Not legal advice.

Recorded **2026-10-06** from the consolidated owner policy mission.
These decisions authorize **source implementation and tests**. They do **not**
authorize live deployment, billing activation, or Play publication.

Source of original options: `D_OWNER_POLICY_OPTIONS.md`.

---

## Q1. How testers and later customers pay for GRIN?

**Owner choice: A — include GRIN in existing Starter, Professional and
Business subscriptions.**

- No separate GRIN SKU at launch.
- Preserve existing approved prices; do not invent prices or trial terms.
- Source expected paise (not live Play display authority) remain
  `functions/src/billing/products.ts`: starter 9900 / 24900 / 79900;
  professional 24900 / 64900 / 199900; business 49900 / 129900 / 399900.
- Count **one newly issued GRIN** against the applicable plan **monthly
  record allowance** (free 25, starter 100, professional/business unlimited).
- Retry, amendment, QC, return, evidence attachment and reconciliation
  **must not** consume another issuance.
- Integrate atomically/idempotently with existing quota
  (`atomicBillableCreate` / `usageCurrent` / Functions register transaction).
- Preserve ordinary diary and letterhead quota behavior.

Internal Testing still uses **synthetic** evidence until lifecycle
implementation is reviewed. Public commercial copy still needs Packet E
real-store acceptance of the diary SKU.

---

## Q2. What count/byte limits apply, and what happens at the limit?

**Owner choice: B — per-owner retained-storage allowances, plus existing
technical ceilings, subject to cost validation before advertising.**

Proposed (total retained per subscribed account, not per device, not a
monthly reset):

| Plan | Allowance |
|---|---|
| Starter | 1 GiB |
| Professional | 5 GiB |
| Business | 20 GiB |

Include original files and retained derivatives. Keep 15 MiB PDF / 10 MiB
image technical limits and two concurrent uploads per owner.

Behaviour:

- Warn at 80% and 95%.
- At the cap: refuse additional cloud uploads clearly; preserve
  viewing/download/export; keep local pending evidence visibly unsynced.
- Never claim an upload succeeded when it did not.
- Never silently delete old evidence or charge overage fees.
- No age-based purge of issued evidence merely to make room.
- Handle concurrent reservations, retry, abandoned uploads, accounting
  repair, and downgrade-over-limit **without deleting existing evidence**.

**Advertising hold (Team 2 SOURCE, 2026-10-06):** Typical usage supports
the proposal. Heavy 20 GiB + repeated downloads can exceed business monthly
₹499 after an assumed 15% store cut. **Do not advertise 1/5/20 GiB.**
Code constants remain those values labelled
`PROPOSED_PENDING_OWNER_CONFIRMATION`. **Single alternative for owner
approval: 256 MiB / 1 GiB / 5 GiB.** See
`docs/release/proposals/team2/STORAGE_ECONOMICS.md`.

---

## Q3. Active accounts, expiry, deletion, export

Keep these clocks **distinct**. Do not substitute one for another.

### Active entitled accounts

Preserve issued GRIN records/evidence while the account remains entitled,
within the selected storage policy. No age-based purge. Corrections and
voids preserve history.

### Subscription expiry (owner-approved for source)

After entitlement **genuinely** expires:

1. Stop new paid issuance/uploads as applicable.
2. Provide **90 days** of read/download/export access.
3. Before a subsequent purge, provide a further **30-day** final notice.
4. Do not purge during valid entitlement or merely because one payment failed.
5. Renewal and retry must not race with deletion.
6. Deletion must not run without the required notice and eligibility evidence.

This is **separate** from an explicit account-deletion request.
**No production purge job** from this assignment. Source state machine +
tests only.

### Explicit account deletion — three facts (do not collapse)

Owner plain-language sheet (choices A–D **blank** until the owner writes):
`docs/release/proposals/team4/DELETION_15_VS_180_OWNER_SHEET.md`.

| # | Fact | Status |
|---|---|---|
| 1 | **Current implemented behavior** | `DELETION_GRACE_MS` = **15 days**. Live `/privacy` and `/delete-account` also describe 15 days. **Not** “the owner already chose 15.” |
| 2 | **Owner-requested policy** | **180 days** after an explicit account-deletion request. **Not** legally/Play approved. |
| 3 | **Policy approved for public operation** | **UNRESOLVED.** Do not advertise or activate 180 days. Do not silently substitute 15 or 30. |

Team 4 Play-risk framing (not a recorded owner choice): do **not** ship
180-day `pending_deletion` as deletion (Play: freeze ≠ delete). Do **not**
treat implemented 15 days as the public-policy answer. Do **not** pick 30
(that is expiry notice in 90+30). Optional 180-day recoverability would be
a **separate archive product**. **P8 stays open** while production purge
omits GRIN and the public window is unresolved. Do not flip
`INCLUDE_GRIN_IN_ACCOUNT_PURGE`.

While unresolved: prepare reusable GRIN cleanup lists and tests; do not
report deletion complete while associated live data remains; do not attach
a production purge job.

Existing Storage purge prefixes remain `letterhead | attachments | pdfs`
only. `users/{uid}/grinEvidence/` is **not** in that list. Firestore
`USER_SUBCOLLECTIONS` has no `goodsEvidence*` trees and is **not**
recursive.

### Exit and export

Before expiry-related purging or account deletion: offer a working way to
obtain **originals** and receipt/audit records. Current pack PDF is a
summary (`originalsBundled=false`). Do not call that summary a complete
archive. ZIP is optional; usable original downloads + record export are
required.

---

## Testers

Arrangement accepted: owner plus two trusted testers, separate accounts.
Identities, Firebase UIDs and devices still need owner input. Do not invent
them. No passwords/OTPs/tokens in the repository. Synthetic GRIN evidence
until lifecycle is implemented and approved.

---

## Implementation status (this session)

| Item | State |
|---|---|
| Owner choices recorded | **this document** |
| Issuance quota + storage accounting + expiry SM | Team 2 source (separate worktree) |
| GRIN paths on existing deletion job | prepare in source; **not live** |
| 180-day public policy | **UNRESOLVED.** Owner sheet choices A–D blank. Engineering hold at implemented 15 days is **not** a recorded owner choice |
| Advertising 1/5/20 GiB | blocked on economics confirmation |
| Live Functions/Rules/IAM | HOLD |
| Production purge job | **not introduced** |
