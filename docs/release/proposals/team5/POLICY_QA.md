# Team 5 policy QA — 2026-10-06 continuation

AI QA / release-gate role, not human certification. Not live deploy. Not
G6. Not main merge. Not EAS/Play. **Wave 2 is not accepted.** Owner
policies below are **approved for source, not live**. This file does not
implement them.

| Coordinate | Value |
|---|---|
| Worktree | `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa` |
| Branch / HEAD | `team/grin-t5-qa` `aa5253e4e070195227055cde836d6b528d5e0070` |
| Application SHA | `5d5df3d54df08953bfb26db39a9b7f5e3d67ed47` |
| Tooling SHA | `228a8f58ac83d3c71e853cdccb6e4c4fa64c251f` (ancestor of HEAD) |
| `GRIN_OPS_ALLOW_LIVE` | unset (no live mutate) |

Application paths vs `5d5df3d` on `functions src eas.json app.json app firebase.json`: empty. Ops-guard A/B, confirmation-refresh `dcc325a`, Admin config `4aac867`, and Internal-GRIN visibility `4409366` are **not** reopened.

Team 2 product code is **not** in this SHA and was **not** reviewed (no extra commits on `team/grin-t2-evidence` vs `aa5253e`; worktree clean).

---

## Owner policy vs `5d5df3d` source

| Approved policy | Source at `5d5df3d` | Public-release effect |
|---|---|---|
| GRIN in existing diary plans | No separate GRIN SKU in source. Purchase-entry `"0"` on `internal-grin` / production / preview. | Commercial copy still blocked until Packet E real-store acceptance for the diary plan. |
| One **issuance** consumes one monthly record allowance; other GRIN commands do not | **Not implemented.** `g1/adapter.ts` `register` writes serial / receipt / event / command only. No `recordsThisMonth`. Client `quotaLinkedCollection` is diary-only (correct: client GRIN create is `false`). Mutate / reconcile / G2 also do not consume (correct). | **False entitlement** if public GRIN is enabled on a capped plan: issuances would not count against the diary monthly cap. |
| Storage 1/5/20 GiB **proposed, pending economics**; warn 80/95; refuse at cap; no silent delete | No per-owner GiB counter. Ordinary-record UI has **warn80** only (`youDashboardQuotaWarning.ts`); **no warn95**. Technical ceilings remain 15 MiB PDF / 10 MiB image / 24 originals per receipt / 2 concurrent uploads. No silent truncate/delete found in G1/G2 or deletion jobs. | Public upload remains blocked until a cap (or written residual-cost acceptance) exists. Do not treat 1/5/20 as source. |
| Active accounts: no age-based purge | No GRIN TTL / age sweep in `functions/src/deletion` or goodsEvidence adapters. | Holds. |
| Expiry: 90-day read then 30-day notice; **no production purge job this assignment** | Not in source. No 90/30 GRIN expiry job. | Expected absence for this assignment. Not a close of public deletion FAIL. |
| Deletion: **15-day IMPLEMENTED** vs **180-day REQUESTED** vs **public-approved UNRESOLVED**. `grinEvidence` still not in purge list | `DELETION_GRACE_DAYS = 15` (`src/domain/identityLifecycle.ts`, `functions/src/deletion/finalPurge.ts`). No `180` grace. `USER_STORAGE_CATEGORIES` = `letterhead` \| `attachments` \| `pdfs`. `USER_SUBCOLLECTIONS` has no `goodsEvidence*` / `grinEvidence*`. Purge of first-level subcollections is **not** nested-recursive; even appending `goodsEvidenceLedgers` would leave `commands` / `serials` / `receipts` / `events` / `evidenceLinks`. | **FAIL** until GRIN is in the **implemented** deletion architecture **and** a public-approved window exists. **180 requested does not close this FAIL.** |
| Pack is summary `originalsBundled=false` | `GrinApplicationRepository.ts` still sets `originalsBundled: false`. SQLITE_HOST repository test passed this session. | Holds. Do not list packs as bundling originals. |

---

## Material findings (this session)

### P8-2026-10-06 — Public deletion/retention still FAIL

**SHA / path:** `5d5df3d` `functions/src/deletion/userOwnedStoragePaths.ts`, `functions/src/deletion/firestorePurge.ts`, `src/domain/identityLifecycle.ts`.

**Scenario:** Account deletion completes for a uid that stored GRIN Firestore trees (`users/{uid}/goodsEvidenceLedgers/**`, admission, object keys) and `users/{uid}/grinEvidence/**` originals. Diary prefixes purge. GRIN documents and originals remain. Pending-deletion users already fail closed on **new** commands (`user.status !== "active"`). That is not retention.

**Practical impact:** Public GRIN would accumulate originals with no implemented delete-with-account and no public-approved retain window. Play Data safety must not claim GRIN files vanish with the account.

**Smallest correction:** Keep 15-day diary grace as-is until counsel/Play certify a public window. Then an authorized Functions change to `completeAccountDeletion` that (1) adds `grinEvidence/` to owned Storage prefixes, (2) purges GRIN Firestore trees **including nested** ledger children (current loop is first-level only), (3) records the public-approved window in listing copy. Do **not** close this by writing `DELETION_GRACE_DAYS = 180` without GRIN paths and Play-certified disclosure.

**Regression (expected FAIL):** `node --test docs/release/proposals/team5/public-deletion-retention.regression.test.mjs` — 3 fail (GRIN absent from purge) / 1 pass (180 not implemented).

### P3-2026-10-06 — Issuance does not consume monthly record allowance

**SHA / path:** `5d5df3d` `functions/src/goodsEvidence/g1/adapter.ts` (`register`, ~300–376); `src/billing/optionC/usageTransition.ts` (`QuotaLinkedRecordCollection` has no GRIN variant).

**Scenario:** Admitted uid on a capped plan (free 25 / starter 100) calls `grinRegisterGoodsReceipt` until the diary monthly cap would have been exhausted. Register still allocates a serial. Mutate / read / evidence do not increment (correct).

**Practical impact:** Against the approved “included in existing plans / one issuance = one record” policy this is **false entitlement** for public GRIN. Duplicate serials remain blocked (`receipt_exists` / `digest_conflict`); that path is not reopened.

**Smallest correction:** Inside the **Admin register transaction only**, read/increment the same monthly usage document diary billable creates use; refuse over cap (`quota_exhausted` / `policy_denied`); skip the increment on replay of the same `commandId`. Do not add GRIN to client `quotaLinkedCollection`. Team 2 implementation was not in tree to review.

**Regression (expected FAIL):** `node --test docs/release/proposals/team5/issuance-monthly-allowance.regression.test.mjs` — 1 fail (register) / 2 pass (other commands; client Rules stay diary-only).

No new reproduction of ops-guard A/B, confirmation-refresh, Admin config, or Internal-GRIN visibility.

---

## Play artwork (independent)

`PLAY_SUBMISSION_READINESS.md` still says the 512 icon / feature graphic are **not in this worktree**. That worksheet is stale.

This session, both files are **git-tracked** on application SHA `5d5df3d` (landed in `0a89fff`) and hashes match:

| File | SHA-256 |
|---|---|
| `store/play-icon-512.png` | `cc550cb8450c62d5b991da56d0e5989db9ee14fb7d971b679848728caf401f5a` |
| `store/play-feature-graphic.png` | `b17f8082b5b7f025ce0ecfc23d0dd096c8997a945f5960198e135b27d10dddd1` |

Onboarding wording in `docs/PLAY_REVIEW_SETUP.md` and live `/~flock.js` vs privacy copy remain Team 4 worksheet defects. Live website HTML was **not** re-fetched this session.

---

## Tests this session

See `RELEASE_COMPLETION_QA.md` 2026-10-06 continuation for commands, labels, and counts.

Ops-guard `34/34` is **TOOLING** at `228a8f5`, **not** application CI.
