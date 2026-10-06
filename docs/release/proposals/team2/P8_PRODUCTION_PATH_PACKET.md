# P8 production-path packet (Team 2)

AI implementer packet. **Not** human sign-off. **Not** authorization to purge live data.

| Pin | Value |
|---|---|
| Worktree | `/Users/shivamsaurav/vyd-worktrees/grin-t2-evidence` |
| Provenance branch | `team/grin-t2-p8-proposal` |
| Combined (READ-ONLY) | `fcda7cd64e9622e50c38223a7156f0f6b8ca5576` |
| Default `INCLUDE_GRIN_IN_ACCOUNT_PURGE` | **false** (unchanged) |
| Owner clocks already wired | cancellation window **45 days**; do not re-ask |
| Live purge / live data deletion | **UNAPPROVED** |
| GRIN until owner live grant | **synthetic-only** (Internal GRIN today) |

P8 remains **FAIL** as an operational public-deletion gate: the default account-purge path still omits GRIN. This packet is the production-path integration **proposal** plus synthetic evidence. It does **not** close P8. Do not deploy. Do not publish website copy. Do not advertise storage-cap numbers.

S1/S2 and P3 are not reopened.

---

## 1. How cancellation and scheduled deletion dates are calculated today

Three source clocks use the same integers. They are **not** imported from one module (Functions copies the millisecond literal).

### Constants

```
DELETION_GRACE_DAYS = 45
hours_per_day       = 24
minutes_per_hour    = 60
seconds_per_minute  = 60
ms_per_second       = 1000

ms_per_day = 24 * 60 * 60 * 1000 = 86_400_000
DELETION_GRACE_MS = 45 * 86_400_000 = 3_888_000_000
```

| File | Formula in source |
|---|---|
| `src/domain/identityLifecycle.ts` | `DELETION_GRACE_DAYS = 45`; `DELETION_GRACE_MS = DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000` |
| `functions/src/deletion/finalPurge.ts` | `DELETION_GRACE_MS = 45 * 24 * 60 * 60 * 1000` |
| `functions/src/identity/resolveOrCreateUserByPhone.ts` | same literal `45 * 24 * 60 * 60 * 1000` |

Owner 2026-10-06: **45 days SUPERSEDES 15**. **Not 180.** Distinct from subscription expiry 90+30 and from optional archive.

### `computeDeletionScheduledFor`

`src/domain/identityLifecycle.ts`:

```
computeDeletionScheduledFor(requestedAt) = requestedAt + DELETION_GRACE_MS
                                         = requestedAt + 3_888_000_000
```

Example: `requestedAt = 1_000_000_000_000` → `deletionScheduledFor = 1_003_888_000_000`.

Client pending write (`src/services/accountDeletion/pendingDeletion.ts`) sets both:

```
deletionRequestedAt   = now
deletionScheduledFor  = computeDeletionScheduledFor(now) = now + 3_888_000_000
status                = pending_deletion
```

### Server fallback when `deletionScheduledFor` is missing or 0

Used by `ensureAccountDeletionJob`, `completeAccountDeletion`, `scheduledDeletionCleanup`, `runFinalAccountPurge` bootstrap, `assertStillPendingOrDeletedStub`, and phone-resolver grace checks:

```
graceExpiresAt =
  Number(user.deletionScheduledFor ?? 0) || requestedAt + 3_888_000_000
```

If `deletionScheduledFor` is a positive integer, **that stored deadline wins**. The current 45-day constant is **not** reapplied on top of an existing timestamp.

`src/services/accountDeletion/accountStatus.ts` `deletionScheduledFor(profile)` uses the same preference: stored `deletionScheduledFor` if `> 0`, else `deletionRequestedAt + DELETION_GRACE_MS`.

Play: freeze ≠ delete. After the 45-day cancellation window, `runFinalAccountPurge` **does** delete app-controlled **non-GRIN** account data. GRIN stays omitted while the flag is false.

---

## 2. Handling of pre-existing pending-deletion deadlines

`ensureDeletionJobDoc({ uid, requestedAt, graceExpiresAt })` in `finalPurge.ts` is a transaction on `deletionJobs/{uid}`.

| Existing job | Behaviour |
|---|---|
| **None** | `initialDeletionJob`: `generation = 1`, `status = awaiting_grace`, `attempts = 0`, all phases `pending`, `completedAt = null`. Writes `requestedAt` and `graceExpiresAt` from input. |
| **`completed`** | New deletion after prior completion. `generation = existing.generation + 1`. Fresh `initialDeletionJob`. Prior ledger is replaced. |
| **`cancelled`** | Same as completed: `generation = existing.generation + 1`, new job. |
| **`awaiting_grace` / `ready` / `leased` / `needs_manual_review`** | **Does not** mint a new generation. Merges `requestedAt` and `graceExpiresAt` from **this call’s input**. Preserves `leased` and `needs_manual_review`. Otherwise: `graceExpiresAt <= now` → `ready`, else `awaiting_grace`. |

Callers always pass:

```
requestedAt    = Number(user.deletionRequestedAt ?? now)
graceExpiresAt = Number(user.deletionScheduledFor ?? 0) || requestedAt + 3_888_000_000
```

### `user.deletionScheduledFor` vs `requestedAt + grace`

- **New request today:** client writes `deletionScheduledFor = now + 3_888_000_000`. Job grace matches that 45-day instant.
- **Pre-existing pending user** whose `users/{uid}.deletionScheduledFor` was written under the old **15-day** clock: `ensureDeletionJobDoc` copies **that stored instant**. It does **not** stretch the deadline to 45 days. `requestedAt + 3_888_000_000` is used only when `deletionScheduledFor` is missing or 0.
- Re-calling ensure while a job is still `awaiting_grace`/`ready` **refreshes** job `graceExpiresAt` from the **current user doc**, not from a newly computed 45-day window, unless the user doc itself was rewritten.

Cancel (`cancelDeletionPatch` / `cancelDeletionJob`): user returns `active` and timestamps are cleared; job becomes `cancelled` and `generation` increments. A later new request is a new generation.

---

## 3. Recursive GRIN cleanup

Reusable lists: `functions/src/deletion/grinCleanupLists.ts`. Recursive walker: `grinCleanup.ts`. **Not** `USER_SUBCOLLECTIONS` / `USER_STORAGE_CATEGORIES`.

### Firestore roots (`users/{uid}/…`)

`goodsEvidenceLedgers`, `goodsEvidenceAdmission`, `goodsEvidenceUploadControl`, `grinEvidenceObjectKeys`, `grinEvidenceDerivativeKeys`, `goodsEvidenceStorage`.

### Nested collection ids (always visited)

Even if `listSubcollections` is incomplete, `uniqueSubs` unions discovery with:

`receipts`, `commands`, `serials`, `evidenceObjects`, `events`, `evidenceLinks`, `evidenceControl`.

Child-first delete: events/links/control → receipt → ledger. Completion requires `countGrinFirestoreDocs(uid) === 0`.

Inventory paths (uid-scoped):

| Kind | Path |
|---|---|
| Storage prefix | `users/{uid}/grinEvidence/` |
| Originals | `users/{uid}/grinEvidence/{objectKey}/original` |
| Derivatives | `users/{uid}/grinEvidence/{objectKey}/derivatives/{derivativeKey}` |
| Ledgers | `users/{uid}/goodsEvidenceLedgers/{ledgerId}` |
| Nested | `…/receipts/{receiptId}` plus `commands`, `serials`, `evidenceObjects` |
| Receipt children | `…/events`, `…/evidenceLinks`, `…/evidenceControl` |
| Admission / upload | `users/{uid}/goodsEvidenceAdmission/runtime`, `…/goodsEvidenceUploadControl/runtime` |
| Key reservations | `users/{uid}/grinEvidenceObjectKeys/{objectKey}`, `…/grinEvidenceDerivativeKeys/{derivativeKey}` |
| Accounting / holds | `users/{uid}/goodsEvidenceStorage/accounting` |

`purgeGrinEvidenceIfEnabled`: Storage prefixes first (paged + `countOwnedFilesUnderPrefix`); then recursive Firestore; **completed requires both trees empty**. `force: true` is synthetic/unit-test only. Flag-false without force returns `grin_purge_disabled` and **does not delete**.

Diary `purgeUserSubcollectionsFully` is **first-level only** (400/batch). Appending GRIN collection names there would strand nested children. That is why enablement is the recursive helper, not `USER_SUBCOLLECTIONS`.

---

## 4. How writes are fenced while final deletion proceeds

| Layer | Fence |
|---|---|
| G1 `gate` / G2 `authorize` | `(user.status ?? "active") !== "active"` → `forbidden`. Covers `pending_deletion` **and** `deleted`. No replay exception. |
| Admission policy | After status: `newCommands` / `reconciliation` must be `allow` or `policy_denied`. `retain` reads are not a write path. |
| Login | `isLoginBlockedAccount`: `pending_deletion` or `deleted`. OTP / normal app use must not continue. |
| Client `firestore.rules` | `clientDeletionRequestAllowed` only `active` → `pending_deletion` with a closed field set. Live repo-root rules have **no** `grinEvidence` / `goodsEvidence*` match (client GRIN writes are not in live rules). |
| Live `storage.rules` | **No** `grinEvidence` match. Proposed/emulator GRIN rules deny `pending_deletion` / inactive for originals and derivatives. |
| Purge worker | `assertStillPendingOrDeletedStub`: generation mismatch → abort; `cancelled` → abort; `active` → `reactivated`; `pending_deletion` and `scheduled > now` → `grace_not_elapsed`; other statuses except `deleted` → `invalid_status`. |
| Lease | `acquireLease`: 5 minutes (`5 * 60 * 1000 = 300_000` ms). Active lease blocks other workers. `canAcquireLease` refuses `completed`, `cancelled`, `needs_manual_review`, unelapsed `awaiting_grace`. |
| Generation | Cancel increments generation. Purge holds the generation from lease acquire; mismatch stops the attempt. |

Admin purge uses Admin SDK (bypasses client rules). Fencing is to stop **new** owner writes and concurrent workers, not to replace uid-prefix isolation.

---

## 5. Interruption / retry

`deletionJobs/{uid}` phases, in order: **storage** (diary prefixes `letterhead` / `attachments` / `pdfs`) → **firestore** (diary `USER_SUBCOLLECTIONS`) → **GRIN gate** (flag-gated; see § enablement) → **indexes** (retire phone/UEID/email, mark user `deleted`) → **auth** (`deleteAuthUserIdempotent`, last).

| Rule | Integer / behaviour |
|---|---|
| Lease | `300_000` ms; expired `leased` reclaimed by the 24h scheduler |
| `MAX_ATTEMPTS_BEFORE_MANUAL` | **12**. Next failure → `needs_manual_review` (lease not acquirable) |
| Transient error | status `ready` (retry); never `completed` |
| Permanent / cancelled | `needs_manual_review` or `cancelled` |
| `allPhasesDone` | all four diary/auth phases `=== "done"` |
| `accountPurgeMayComplete` | `allPhasesDone` **and**, if flag true, GRIN report `completed` |
| GRIN completed | Storage prefixes **and** Firestore trees empty (`grin_storage_incomplete` / `grin_firestore_incomplete` otherwise) |

`scheduledDeletionCleanup` (`every 24 hours`, region `asia-south1`): promote `awaiting_grace` where `graceExpiresAt <= now`; bootstrap `pending_deletion` users whose stored deadline elapsed; process `ready`; reclaim expired leases. Page size **40**, max pages **25**. It calls `runFinalAccountPurge` only. **No second GRIN cron.**

Never mark `completed` unless `accountPurgeMayComplete` is true. Flag-false: GRIN trees may remain after `completed` — that is current production and why P8 is FAIL.

---

## 6. Protection of other owners and unrelated records

All GRIN and diary purge prefixes are `users/{uid}/…` after `uid.trim()`.

`isObjectOwnedByUser(uid, objectPath)`: path must start with `users/{uid}/`, must not contain `..`, and must be longer than the root. `purgePrefixPaged` throws `storage_path_not_owned_by_user` on a listed object that fails the check (`skipped_unowned` is treated as fatal in the page loop). `grinEvidenceStoragePrefix` / `allGrinStoragePrefixes` emit only that uid’s `grinEvidence/` prefix.

Firestore walker lists only `users/{uid}/{GRIN_FIRESTORE_USER_COLLECTIONS}` and nested children under those docs. Other uids are never in the prefix. Injected evidence: `u1` force-purge leaves `users/u2/grinEvidence/…` and `users/u2/goodsEvidenceLedgers/…` intact.

Do not list `users/` without uid. Do not add a bucket-wide delete.

---

## 7. Provider / backup retention limitations and accurate user copy

| Fact | Accurate copy |
|---|---|
| Play freeze ≠ delete | A Play account freeze or subscription pause is **not** account erasure. After 45 days the implemented job **deletes** app-controlled diary data (and, only after a live grant + flag flip, GRIN). |
| GRIN omitted until flag | Default `INCLUDE_GRIN_IN_ACCOUNT_PURGE = false`. Scheduled purge **must not** delete customer GRIN today. Do not tell users GRIN originals are deleted with the account. |
| Website may still say 15 | `public-site/privacy.html` and `public-site/delete-account.html` still say a **15-day** grace. **Do not publish** that HTML as the 45-day policy. In-app `src/content/legal/documents.ts` interpolates `DELETION_GRACE_DAYS` (45). Align public HTML only under a separate publish approval. |
| Provider backups | Repo has **no** Cloud Logging TTL, Storage object lifecycle, or Google backup retention number. Do not invent a backup-erasure SLA. Provider snapshots can outlive app-controlled deletes. |
| Device local | Cloud Functions cannot wipe SQLite on an offline/uninstalled device. During the 45-day window local data is retained for reactivation; after final detection, uid-scoped local purge only. |
| Shared PDFs | Exported/shared PDFs outside the app cannot be recalled. |
| Auth / indexes | Auth delete is last and idempotent if already absent. `retiredPhones` / retired `ueidIndex` are retained as anti-abuse stubs, not full account restoration. |

Until P8 is operationally resolved (owner **live grant**), **GRIN pilot remains synthetic-only**. Internal GRIN must not be treated as live customer evidence.

---

## Exact source/config change required to enable the reviewed path

**This packet is not that grant. Do not flip in this SHA.**

### A. Required later flip (the only enablement constant)

File: `functions/src/deletion/grinCleanupLists.ts`

```
export const INCLUDE_GRIN_IN_ACCOUNT_PURGE = false;
```

Later request (UNAPPROVED until owner live grant):

```
export const INCLUDE_GRIN_IN_ACCOUNT_PURGE = true;
```

That constant is imported by `grinCleanup.ts` (`purgeGrinEvidenceIfEnabled`) and `finalPurge.ts` (`runFinalAccountPurge`). `scheduledDeletionCleanup` does not name the flag; it already calls `runFinalAccountPurge`. After the flip, the existing 24h job **would** purge GRIN for eligible uids.

### B. Production-path wiring landed in this proposal SHA (flag still false)

These are **not** a live grant. They make a later one-line flip mean the reviewed path instead of a nested storage-phase skip.

1. **`runFinalAccountPurge`** (`finalPurge.ts`): GRIN gate is **independent of** `phases.storage !== "done"` / `phases.firestore !== "done"`. Diary storage and diary Firestore run as today. Then, only if the flag is true, `purgeGrinEvidenceIfEnabled` runs (paged Admin adapter) **before indexes/Auth**. In-flight jobs that already marked diary storage done still hit GRIN after a future flip. Flag-false: the block is skipped (`grinCompleted = true` for the completion predicate only; trees are not touched).
2. **Paged `listGrinCollectionPaged`**: production adapter uses `limit(400)` **and** `startAfter` until a short page. A single `limit(400)` plus a matching limited count could have marked GRIN “empty” while docs remained.
3. **`accountPurgeMayComplete`**: job `status = completed` only if all four phases are `done` **and**, when the flag is true, GRIN reported completed (both trees empty). Flag-false may complete with GRIN remaining (current production).
4. **`userOwnedStoragePaths.ts`**: **do not** add `grinEvidence` to `USER_STORAGE_CATEGORIES`. That array is **not** flag-gated; appending it would delete live GRIN storage while the flag is false, and `purgeAllUserOwnedStorage` still would not recurse nested Firestore. Enablement is the flag + recursive helper.
5. **`scheduledDeletionCleanup`**: **no new scheduler**. Comment-only: GRIN rides `runFinalAccountPurge` and the flag.

### C. What not to do as “enablement”

- Do not append `goodsEvidenceLedgers` (or other GRIN roots) to `USER_SUBCOLLECTIONS` as the fix — first-level delete strands `commands` / `serials` / `receipts` / `events` / `evidenceLinks`.
- Do not add a standalone GRIN Cloud Scheduler.
- Do not set `force: true` in production.
- Do not treat this packet, a unit-test green, or the inert wiring as P8 PASS.

---

## Operational consequences (if the later flip is granted)

| Now (flag false) | After live grant + `INCLUDE_GRIN_IN_ACCOUNT_PURGE = true` |
|---|---|
| Internal GRIN is **synthetic-only**. Default purge deletes diary Storage/Firestore/Auth after 45 days. Customer GRIN trees are **left in place**. | Customer GRIN **originals and derivatives** under `users/{uid}/grinEvidence/` **and** the Firestore trees in §3 **WOULD be deleted** after that uid’s stored 45-day (or older stored) deadline. |
| `force: true` exists for tests only. | Irreversible for app-controlled copies. Provider backups may still exist (no invented TTL). |
| Other uids untouched (uid prefix). | Other uids remain untouched (same uid-scoped prefixes). |
| P8 FAIL. | Operational P8 still needs public/Play copy alignment; this packet still does not publish 15-vs-45 HTML. |

Live purge activation and live data deletion remain **UNAPPROVED**.

---

## Behavioral evidence (synthetic / injected)

Commands (no live project, no customer data):

```
npx tsx functions/src/deletion/grinCleanup.unit.test.ts
npx tsx functions/src/deletion/deletion.unit.test.ts
```

| Claim | Evidence |
|---|---|
| Flag-false skips GRIN trees (production default) | `purgeGrinEvidenceIfEnabled` without `force` → `grin_purge_disabled`; `u1` and `u2` docs/objects remain |
| Force/injected path deletes synthetic GRIN docs/objects | `force: true` deletes `u1` originals, derivatives, reserved original, nested receipts/events, accounting, key reservations |
| Recursive empty-check | `countGrinFirestoreDocs(u1) === 0`; leftover no-op delete → `grin_firestore_incomplete` |
| Known nested ids if `listSubcollections` is empty | Injected empty discovery still deletes `receipts`/`events`/… |
| Other-uid prefix not deleted | `u2` storage + Firestore unchanged |
| Interruption leaves not-completed | Storage timeout / Firestore unavailable / leftover → `completed: false`; `accountPurgeMayComplete` false when flag true and GRIN incomplete |
| Retry completes | Second force attempt empties both trees |
| Child before parent | event < receipt < ledger |
| Job completion contract | `accountPurgeMayComplete`: flag-false may complete with GRIN remaining; flag-true must not |

Live emulator against a non-demo project: **not run**. No live purge.

---

## Authorization

This packet **is not** authorization to:

- flip `INCLUDE_GRIN_IN_ACCOUNT_PURGE`
- run `scheduledDeletionCleanup` / `runFinalAccountPurge` against live customer GRIN
- deploy Functions
- publish 45-day (or 15-day) website copy
- mark GRIN / deletion / public-release Done

Until the owner live grant, **GRIN remains synthetic-only.**
