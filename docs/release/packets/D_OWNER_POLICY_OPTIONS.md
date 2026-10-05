# Packet D — Owner decisions (options only; no invented policy)

GRIN pricing, quota, and retention/deletion after account or ledger retirement
are **unset**. This packet lists concrete options and consequences. Choosing
one is an owner decision. Do not treat emulator results as the policy.

Encrypted PDF backup remains backlog.

## 1. Pricing / commercial access

| Option | Consequence |
|---|---|
| A. GRIN included in the current diary SKU | No new Play product; support cost sits on existing subscription; quota still needed so a free-or-paid owner cannot upload unbounded originals |
| B. Separate paid GRIN SKU | Needs Packet E (real-store billing) before public GRIN; versionCode/source of that binary must be inventoried again |
| C. Invite-only / Internal Testing only, no SKU | Fine for a later controlled test; cannot be public release; quotas still apply to testers |
| D. Leave undecided | GRIN stays default-off; no public claim of a priced feature |

Do not infer GST/ITC commercial claims from pack completeness. ITC stays
`not_determined` in source.

## 2. Upload / storage quota

Current **technical** ceilings (not a commercial quota): 15 MiB PDF / 10 MiB
image per original, 2 concurrent uploads per owner, policy v2 category set.

| Option | Consequence |
|---|---|
| A. Keep only technical ceilings | A determined tester can still fill Storage with many 15 MiB PDFs; cost and restore risk sit on the project |
| B. Per-owner object count and total bytes | Needs a server counter in a later export; overflow is `policy_denied`, not silent truncate |
| C. Per-receipt original cap (already has a technical original-count limit) | Tight for messy purchases; still not a billing quota |
| D. Leave undecided | Do not publish a “fair use” number |

## 3. Retention / deletion

Deletion jobs (`retireIdentity`, `completeAccountDeletion`) are unchanged and
do not currently define GRIN object purge.

| Option | Consequence |
|---|---|
| A. Delete GRIN Firestore + Storage with the account | Restores privacy alignment with diary deletion; packs and issued numbers disappear; tax-retention duty if any is on the owner, not the app |
| B. Retain GRIN for a stated statutory window after deletion | Needs a hold class, access deny for the uid, and a later purge job; undeployed |
| C. Retain until the owner exports, then delete | Needs an export that actually bundles originals (today `originalsBundled=false`) or an external dump; not implemented |
| D. Leave undecided | Do not enable production admission that accumulates originals with no deletion story |

Pending-deletion users already fail closed on new GRIN commands. That is not a
retention policy.

## Decision record

Owner choice: **not recorded**. Do not mark GRIN, G6, billing, or public
release Done until the chosen rows exist in writing.
