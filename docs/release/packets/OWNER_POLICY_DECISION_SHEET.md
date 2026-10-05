# Owner decision sheet — GRIN pricing, quota, retention

Collect once. Recommendations are not an owner decision and not legal advice.
Do not invent a statutory retention period. Encrypted PDF backup = backlog.
No “zero knowledge,” legal immunity, automatic GST eligibility, or live
2B/EWB claims.

Source of options: `D_OWNER_POLICY_OPTIONS.md`. **Owner choice: blank.**

---

## Q1. How do testers and later customers pay for GRIN?

| Option | Internal Testing | Public 18 Oct |
|---|---|---|
| **A. Include in existing diary plan** | No new SKU. Still needs Packet E real-store acceptance of that diary plan. Storage cost on current subscription. Needs a technical/commercial cap. | Unblocks commercial copy only after store purchase/acknowledge/entitlement tests for the diary SKU. |
| **B. Separate GRIN Play product** | Public GRIN waits for SKU + Packet E. | New product, Functions billing env, client purchase-entry only after that programme. |
| **C. Invite-only Internal, no priced SKU** | Fine for named testers. Cannot be a public Play feature. | Does **not** satisfy public release. |
| **D. Leave unset** | GRIN stays default-off. | No public claim of a priced feature. |

**Recommendation:** Internal candidate → **C**. Public → owner writes **A or B**, then Packet E for that plan.

**Owner choice:** _________________

---

## Q2. What count/byte limits apply, and what happens at the limit?

Already in source (technical, not a commercial quota): 15 MiB PDF / 10 MiB
image per original; **24 originals per receipt**; 2 concurrent uploads per
owner; policy v2 categories. **No** per-owner byte/object GRIN counter.
Diary `counters` is a different product.

| Option | At the limit | Required implementation |
|---|---|---|
| **A. Technical ceilings only** | Tester can still fill Storage with many 15 MiB PDFs. | Manual Storage watch. Residual cost on the owner. |
| **B. Per-owner object count + total bytes** | New original refused (`policy_denied`); already-linked objects kept; no silent truncate; issued history preserved. | Authoritative backend counters. Required before **public** upload unless residual-cost is accepted in writing. |
| **C. Per-receipt cap only (current)** | Unbounded object count across receipts remains. | None beyond current domain. |
| **D. Leave unset** | Do not publish a fair-use number. | No listing claim of a storage quota. |

**Recommendation:** Internal → **A** plus manual watch. Public upload → **B**.

**Owner choice:** _________________
If B: count cap _____  byte cap _____  over-limit = refuse new original (recommended).

---

## Q3. What happens to GRIN data after account / ledger retirement?

Today: `retireIdentity` / `completeAccountDeletion` purge Storage prefixes
`users/{uid}/letterhead|attachments|pdfs/` only
(`functions/src/deletion/userOwnedStoragePaths.ts`). **`grinEvidence/` is not
in that list.** Firestore `USER_SUBCOLLECTIONS` has no `goodsEvidence*` trees
and is **not recursive**. Pending-deletion users already fail closed on
**new** GRIN commands (EMULATOR production-compose gates, register only).
That is not a retention policy.

| Option | Consequence | Required implementation |
|---|---|---|
| **A. Delete GRIN Firestore + Storage with the account** | Aligns with diary deletion. Issued numbers and originals disappear. Any tax-retention duty is on the **owner**, not this app. | Later Functions change to purge `users/{uid}/goodsEvidence*` and `users/{uid}/grinEvidence/**` from the existing job. Reuse `purgePrefixPaged` / subcollection purge. Not a Console one-off. |
| **B. Keep for a stated window, then purge** | Hold class + access deny + later job. Window length is owner+counsel. | Undeployed. **Do not pick a number in this sheet.** |
| **C. Keep until export, then delete** | Needs an export that bundles originals (`originalsBundled=false` today). | Not implemented. |
| **D. Leave unset** | Do not accumulate customer originals. | Internal: synthetic data + wipe warning. Public blocked. |

**Recommendation:** Internal → **D** with synthetic evidence and wipe warning.
Public → **A or B chosen in writing and implemented.**

**Owner choice:** _________________
If B, window (owner+counsel): _________________

---

## While choices are blank

- Do not implement a speculative extra quota framework.
- Do not attach GRIN paths to deletion jobs silently.
- Real customer GRIN evidence remains blocked.
- Public submission / rollout remain blocked (see Approval D).
