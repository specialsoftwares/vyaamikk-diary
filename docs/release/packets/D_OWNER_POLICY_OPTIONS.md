# Packet D — Owner decisions (recommended options; not invented legal policy)

GRIN pricing, quota, and retention after account/ledger retirement are **unset**.
Encrypted PDF backup remains backlog. ITC stays `not_determined` in source.
Do not treat emulator results as policy.

This packet **recommends** a row for the 6 Oct 2026 Internal candidate and
states which operations stay blocked until a written owner choice exists.
Counsel/legal sign-off is not performed here.

## 1. GRIN initial pricing / quota (commercial access)

| Option | Consequence |
|---|---|
| A. Included in current diary SKU | No new Play product; storage cost on existing subscription; still needs a technical/commercial cap |
| B. Separate paid GRIN SKU | Packet E (real-store billing) **blocks public GRIN** until that SKU exists |
| C. Invite-only / Internal Testing, no SKU | Fine for controlled test; **cannot** be public release; tester quotas still apply |
| D. Leave undecided | GRIN stays default-off; no public claim of a priced feature |

**Recommendation for 6 Oct Internal candidate: C.**
Public-release target 18 Oct stays **blocked** on a later A or B choice in
writing. **D** also blocks public release.

Do not infer GST/ITC commercial claims from pack completeness.

## 2. Storage limits and over-limit behavior

Technical ceilings already in source (not a commercial quota): 15 MiB PDF /
10 MiB image per original; 2 concurrent uploads per owner; policy v2 categories.

| Option | Consequence |
|---|---|
| A. Technical ceilings only | A tester can still fill Storage with many 15 MiB PDFs |
| B. Per-owner object count + total bytes | Needs a server counter in a later export; overflow is `policy_denied`, not silent truncate |
| C. Per-receipt original cap only | Already has a technical original-count limit; still not a billing quota |
| D. Leave undecided | Do not publish a “fair use” number |

**Recommendation for Internal Testing: C + existing technical ceilings**, plus
**manual** owner watch of Storage usage. **B is required before public
release** (otherwise A/C leave unbounded project cost). Over-limit: refuse
the new original; keep already-linked objects; do not truncate bytes.

Until B exists, **public release of GRIN upload is blocked** (cost/restore
risk). Internal Testing can proceed with C + ceilings if the owner accepts
A’s cost risk for a small tester set.

## 3. Retention / deletion (including pending uploads and account deletion)

Deletion jobs (`retireIdentity`, `completeAccountDeletion`) are unchanged and
do **not** currently purge GRIN objects. Pending-deletion users already fail
closed on **new** GRIN commands. That is not a retention policy.

| Option | Consequence |
|---|---|
| A. Delete GRIN Firestore + Storage with the account | Aligns with diary deletion; issued numbers and originals disappear; any tax-retention duty is on the **owner**, not this app |
| B. Retain for a stated statutory window after deletion | Needs a hold class, access deny for the uid, and a later purge job; **undeployed** |
| C. Retain until the owner exports, then delete | Needs an export that actually bundles originals (today `originalsBundled=false`) or an external dump; **not implemented** |
| D. Leave undecided | Do not enable production admission that accumulates originals with no deletion story |

Pending uploads at deletion time: local files may remain on device until app
uninstall; server flight objects should be deleted or left unreachable. **A**
implies Admin delete of `users/{uid}/grinEvidence/**` during
`completeAccountDeletion` — that job change is **not written** and must be a
later authorized Functions change.

**Recommendation:** For Internal Testing, **D is acceptable only because
tester volume is small and admission is seeded** — testers must be told
data may be wiped. **Public release is blocked until A or B is chosen in
writing and implemented.** Do not implement A by silently attaching GRIN
paths to deletion jobs in this packet.

This is not legal advice. If Indian tax retention applies to the operator,
**B** may be required; that choice is the owner’s, with counsel.

## Decision record

| Topic | Owner choice | Blocks |
|---|---|---|
| Pricing | **not recorded** (recommend C for Internal) | Public GRIN (needs A or B) |
| Storage quota | **not recorded** (recommend C+ceilings Internal; B before public) | Public GRIN upload (needs B) |
| Retention | **not recorded** (Internal may proceed with wipe warning; public needs A or B implemented) | Production admission that accumulates originals |

Do not mark GRIN, G6, billing, or public release Done until the chosen rows
exist in writing.
