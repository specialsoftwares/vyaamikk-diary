# Account-deletion window: 15 days vs 180 days (Team 2)

This is **not legal advice**. Team 4 will also assess. Play policy can change; confirm against the current Play Console Help article before any public claim.

## Three distinct facts (do not collapse)

| # | Fact | Status |
|---|---|---|
| 1 | **Implemented grace** | `functions/src/deletion/finalPurge.ts` `DELETION_GRACE_MS = 15 * 24 * 60 * 60 * 1000` (15 days). This slice does **not** change that constant. |
| 2 | **Owner-requested policy** | 180-day retention after an explicit account-deletion request. **Not** legally reviewed. **Not** Play-approved in this repository. |
| 3 | **Policy approved for public operation** | **UNRESOLVED.** |

## What 15 days is

The implemented 15-day window is the current Functions job grace after the user marks `pending_deletion`. After it elapses, `runFinalAccountPurge` may delete Auth, diary Storage prefixes (`letterhead` / `attachments` / `pdfs`), and listed Firestore subcollections. GRIN trees are **not** included unless `INCLUDE_GRIN_IN_ACCOUNT_PURGE` is flipped (default **false**).

Play’s account-deletion requirement is typically that users can request deletion and that the developer **completes deletion in a timely way** (often discussed as days, not many months). Treating **180 days as if it were already Play-compliant** would be incorrect.

## What 180 days would be

A 180-day hold after an explicit deletion request is a **product/policy choice**, not a drop-in replacement for `DELETION_GRACE_MS`:

- It delays actual erasure of account-held data.
- Play reviewers may treat a long recoverable window as **not meeting** “delete the account” if the user cannot obtain timely erasure, or if the listing claims deletion that is actually a 6-month archive.
- Tax or commercial record-keeping duties, if any, sit with the **owner**, not with this app inventing a GST retention period. This document does not assert a statutory 180-day duty.

## Optional archive product (not built)

If the owner wants a long recoverable copy **after** the user asks to delete the sign-in, that should be a **separate, explicit choice**, for example:

- User confirms “keep a recoverable archive for up to 180 days” vs “delete now after the 15-day implemented grace”; or
- A paid/export-then-delete path that actually bundles originals (today the pack PDF is `originalsBundled=false` and is **not** a complete archive).

Silently stretching `DELETION_GRACE_MS` from 15 to 180 would mix “account deletion” with “secret archive” and is **not recommended**.

## Recommendation

1. **Do not silently treat 180 days as Play-compliant.**
2. **Do not change `DELETION_GRACE_MS` in this slice.**
3. Keep public listing / Data safety language aligned with the **implemented** 15-day job until counsel + Play policy owners write otherwise.
4. If 180-day recoverability is desired, specify it as an **optional recoverable-archive product** with separate consent, and keep the default deletion path timely.
5. GRIN Storage (`users/{uid}/grinEvidence/`) and Firestore trees are prepared as **reusable lists** behind `INCLUDE_GRIN_IN_ACCOUNT_PURGE = false` so existing scheduled cleanup does **not** purge live customer GRIN now.

Team 4 should independently read the current Play account-deletion help article at review time. This file is a SOURCE assessment, not a store filing.
