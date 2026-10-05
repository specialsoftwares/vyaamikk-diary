# Packet D — Owner policy choices (recommendations; not selected)

GRIN pricing, storage quota, and retention after account/ledger retirement are
**unset**. Encrypted PDF backup remains backlog. ITC stays `not_determined` in
source. Do not treat emulator results as policy. This is not legal advice.
Counsel/legal sign-off is not performed here.

Each topic lists the choices in plain language, cost/consequence, and what
must be implemented. **No choice is recorded on the owner’s behalf.**

## 1. How testers and later customers pay for GRIN

| Choice | Consequence | Required implementation |
|---|---|---|
| Include GRIN in the existing diary plan | No new Play product. Storage cost sits on the current subscription. Still needs a technical/commercial cap. **Existing-plan billing still requires real-store acceptance** (Packet E): a diary SKU already in source is not GRIN enablement and is not a substitute for store purchase/acknowledge tests. | Keep purchase-entry `"0"` until that store path is accepted. Do not treat Internal Testing as public pricing. |
| Sell a separate GRIN Play/App Store product | Public GRIN waits until that SKU exists and Packet E real-store purchase, acknowledge, GST invoice, refund/entitlement mapping are done. | New store product, Functions billing env, client purchase-entry only after that programme. A separate SKU is **one** commercial model, not the only one. |
| Invite-only Internal Testing, no priced SKU | Fine for a named tester set. **Cannot** be a public Play feature. Tester storage still costs the project. | Seed admission for named uids only. Wipe warning if retention is unset. |
| Leave it unset | GRIN stays default-off. No public claim of a priced feature. | No commercial copy in listing/Data safety that implies GRIN is generally available. |

**Recommendation for the 6 Oct Internal candidate:** invite-only Internal
Testing with no priced SKU. Public-release target 18 Oct stays blocked until
the owner writes either “included in the existing diary plan” or “separate
GRIN product,” **and** Packet E real-store acceptance exists for whatever
plan customers actually pay through.

## 2. Storage limits and over-limit behaviour

Technical ceilings already in source (not a commercial quota): 15 MiB PDF /
10 MiB image per original; 2 concurrent uploads per owner; policy v2
categories.

| Choice | Consequence | Required implementation |
|---|---|---|
| Technical ceilings only | A tester can still fill Storage with many 15 MiB PDFs. Project cost and restore risk grow with tester count. | Manual owner watch of Storage usage. Accept residual cost. |
| Per-owner object count and total bytes | Overflow is `policy_denied`, not silent truncate. Already-linked objects stay. | Server counter in a later Functions export. Required before public GRIN upload unless the owner writes a residual-cost acceptance. |
| Per-receipt original-count cap only | Already has a technical original-count limit. Still not a billing quota. | None beyond current domain. Unbounded object count across receipts remains. |
| Leave it unset | Do not publish a “fair use” number. | No store listing claim of a storage quota. |

**Recommendation for Internal Testing:** keep the existing per-receipt and
file-size ceilings, plus manual Storage watch. **Recommendation before
public upload:** per-owner object count and total bytes. Over-limit: refuse
the new original; keep already-linked objects; do not truncate bytes.

## 3. What happens to GRIN data after account deletion

Deletion jobs (`retireIdentity`, `completeAccountDeletion`) are unchanged and
do **not** currently purge GRIN objects. Pending-deletion users already fail
closed on **new** GRIN commands. That is not a retention policy.

A wipe warning on Internal Testing is **disclosure**, not a deletion
implementation. This packet does not invent a statutory retention period.

| Choice | Consequence | Required implementation |
|---|---|---|
| Delete GRIN Firestore and Storage with the account | Aligns with diary deletion. Issued numbers and originals disappear. Any tax-retention duty is on the **owner**, not this app. | Later authorized Functions change to `completeAccountDeletion` (Admin delete of `users/{uid}/goodsEvidence*` and `users/{uid}/grinEvidence/**`). Not written. |
| Keep data for a stated window after deletion | Needs a hold class, access deny for the uid, and a later purge job. Window length is an owner+counsel decision. | Undeployed. Do not pick a number here. |
| Keep until the owner exports, then delete | Needs an export that actually bundles originals (today `originalsBundled=false`) or an external dump. | Not implemented. |
| Leave it unset | Do not enable production admission that accumulates originals with no deletion story. | Internal Testing only with a wipe warning and seeded testers. |

**Proposed cleanup (not executed):**

| Item | Proposal |
|---|---|
| Owner | Cloud Functions `completeAccountDeletion` (existing job), under a later source change — **not** a Console one-off |
| Trigger | Account deletion completing for that uid, after identity retirement |
| Verification | After the job, Admin `exists()` false for `users/{uid}/grinEvidence/**` objects and GRIN Firestore trees; serial docs gone or explicitly retained per the written choice. Record the check; do not delete in this assignment. |

**Recommendation:** For Internal Testing, leaving retention unset is
acceptable only because tester volume is small and admission is seeded —
testers must be told data may be wiped. **Public release is blocked until
delete-with-account or retain-for-a-stated-window is chosen in writing and
implemented.** Do not attach GRIN paths to deletion jobs silently in this
packet.

## Decision record

| Topic | Owner choice | Blocks |
|---|---|---|
| Pricing | **not recorded** | Public GRIN until a written plan exists **and** real-store acceptance for that plan |
| Storage quota | **not recorded** | Public GRIN upload until per-owner bytes/count exists or a written residual-cost acceptance |
| Retention | **not recorded** | Production admission that accumulates originals; public release until delete-or-retain is implemented |

Do not mark GRIN, G6, billing, or public release Done until the chosen rows
exist in writing.
