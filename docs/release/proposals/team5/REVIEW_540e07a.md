# Team 5 independent review — application `540e07a` (inert P8 production-path)

AI QA / release-gate role, not human certification. Worked **only** in
`/Users/shivamsaurav/vyd-worktrees/grin-t5-qa`. This T5 worktree was **not**
reset. Historical dirty workspace **not** edited. **No deploy.** Helper
**not** rewritten. `GRIN_OPS_ALLOW_LIVE` remained **unset**.
`PLAY_BILLING_ENABLED` remained **unset**. **No INCLUDE_GRIN_IN_ACCOUNT_PURGE
flip.** No live purge, EAS, Play, or billing activation.

Scope is **only** application `540e07a` vs prior `60c4bc1` — **P8 inert
production-path only**. Entire GRIN history is **not** re-reviewed. S1 /
S2 / P3 are **not reopened** (no new reproduction). Device / live backend /
catalog / RTDN live / Play / billing / public are **not accepted**. **P8 is
not flipped** and **stays FAIL operationally**. This packet is **not** a
live grant. **GRIN readiness ≠ billing readiness.**

Leftover dirty `POLICY_QA.md` / `issuance-monthly-allowance.regression.test.mjs`
/ `public-deletion-retention.regression.test.mjs` / `RELEASE_COMPLETION_QA.md`
still describe **P3 FAIL at `5d5df3d`**. They were **left uncommitted**.

Prior application review: `REVIEW_60c4bc1.md`. This file is the inert GRIN
purge-path slice on that candidate.

---

## Coordinates (verified)

| Item | Value |
|---|---|
| QA worktree | `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa` provenance `team/grin-t5-review-540e07a` |
| **Application SHA** | `540e07aa07f376716484adb879ce66cb9fb170ce` |
| Prior application | `60c4bc179c46b8986ab0dbd2c95db0e4a5ceb49a` (ancestor) |
| Application slice | `60c4bc1..540e07a` on `functions/src/deletion/*` only: **6 files**, +197 / −28 |
| `eas.json` / `app.json` / `app` / `firebase.json` / `package.json` / `src` / `functions/src/billing` / `tools/billing-acceptance` vs `60c4bc1` | **empty** |
| Git range also contains | `24e994e` (docs A–F batch) and `573b208` (docs UID-receipt, values **not** in git). **Out of application scope.** Not re-reviewed. Identifiers **not copied** into this file. |
| Helper `PINNED_APP_SHA` at `540e07a` | `520f9f98bc952fd7f30a907da9e85774629a69c0` — **STALE vs `540e07a`**. Pin apply is **coordinator HOLD**. **Not rewritten.** |
| Helper blob | `23f71103b473fccda55849fa1a1dcf2bf0f870c5` (same pin-constant tree as recorded at `0d7aa17`) |
| Canonical GHA `37440328976` | covers `fcda7cd` / `70bdfe4` **only**. Does **not** cover `540e07a`. `gh auth status`: not logged into any GitHub hosts. **NOT RUN** / **not invented**. |
| `INCLUDE_GRIN_IN_ACCOUNT_PURGE` at `540e07a` | **false** (compile-time constant in `grinCleanupLists.ts`) |
| `GRIN_OPS_ALLOW_LIVE` (this shell) | unset |
| `PLAY_BILLING_ENABLED` (this shell) | unset |
| `adb devices` | `List of devices attached` (empty) |

This T5 provenance tree’s on-disk identity files still show historical
**15-day** constants. Tests below used **temporarily checked-out `540e07a`
blobs** (deletion + the two source-scan identity files), then those paths
were **restored**. Application files were **not** left staged.

---

## Label split (keep separate)

| Host | This review |
|---|---|
| SOURCE | Flag false; independent GRIN gate; `accountPurgeMayComplete`; `listGrinCollectionPaged` + `startAfter`; default lists omit GRIN; helper **stale** |
| INJECTED | `grinCleanup.unit.test.ts` + `deletion.unit.test.ts` (in-memory stores; **no** live Firestore/Storage) |
| EMULATOR | **NOT RUN** |
| LIVE_BACKEND | **NOT RUN** |
| Catalog / RTDN live / Play permissions | **NOT RUN** |
| NATIVE_DEVICE / PLAY_INSTALLED | **NOT RUN** (empty `adb`) |
| REAL-CHARGE | **NOT RUN** |
| Payment / public-submission | **NOT RUN** / **not accepted** |

---

## Slice vs `60c4bc1` (application)

`grinCleanup.ts` / `grinCleanupLists.ts` **unchanged**. Wiring changed in
`finalPurge.ts`, `deletionJob.ts`, comments in `lifecycle.ts` /
`userOwnedStoragePaths.ts`, plus unit tests.

- `INCLUDE_GRIN_IN_ACCOUNT_PURGE` remains exact **`false`**. **Not flipped.**
- Default `USER_STORAGE_CATEGORIES` still `letterhead | attachments | pdfs`
  (no `grinEvidence`). Default `USER_SUBCOLLECTIONS` still omits GRIN trees.
  Comment on the diary storage list forbids appending `grinEvidence` as
  P8 enablement (that list is not flag-gated and is first-level only).
- `runFinalAccountPurge` no longer nests GRIN inside
  `if (phases.storage !== "done")`. After diary storage **and** diary
  Firestore phase-done, a **separate** gate runs. Flag-false skips the
  call (`grinCompleted = !INCLUDE_GRIN_IN_ACCOUNT_PURGE`). Flag-true would
  still run even if an in-flight job already marked diary phases done.
- Production adapter is `listGrinCollectionPaged`: `limit(400)` +
  `startAfter` until a short page. Replaces the previous single
  `.limit(400).get()` that could strand the rest.
- `accountPurgeMayComplete` requires diary `allPhasesDone`. When the flag
  **would be on**, it also requires `grinCompleted`. Flag-false production
  **may complete with GRIN trees still present** (intentional inert path).
- `runFinalAccountPurge` never passes `force`. `force: true` exists only
  for tests. `scheduledDeletionCleanup` still does **not** import the flag
  (GRIN rides the purge helper). Comment: flag-true remains an
  **UNAPPROVED live grant**.
- Grace in `finalPurge.ts` remains **45 days**. Public/Play listing copy
  remains UNRESOLVED. **P8 is not painted green.**

---

## Required checks

| Requirement | Result |
|---|---|
| `INCLUDE_GRIN_IN_ACCOUNT_PURGE` remains **false** | **PASS** SOURCE (`= false`) + INJECTED `assert.equal(..., false)` |
| GRIN gate independent of diary storage/firestore phase-done | **PASS** SOURCE (gate after both phases; nested-in-storage pattern `doesNotMatch`) |
| `accountPurgeMayComplete` refuses completed when flag would be on and GRIN not completed | **PASS** INJECTED (`flag true` + `grinCompleted false` → `false`). Production sets `grinCompleted` from `purgeGrinEvidenceIfEnabled`, which requires exhausted trees. No-op delete → `grin_firestore_incomplete`, `completed: false`. |
| Paged list / `startAfter` present | **PASS** SOURCE (`listGrinCollectionPaged` + `startAfter`). INJECTED mocks return the full collection (no 400-doc Admin cursor simulation). Storage `pageToken` paging **unchanged**. |
| Flag-false skips GRIN trees; `force: true` may delete test data only | **PASS** INJECTED (`attempted: false`, `grin_purge_disabled`; inventory remains). Production purge does not pass `force`. |
| Other-uid prefixes not deleted | **PASS** INJECTED (`force: true` on `u1`; `u2` storage + Firestore remain) |
| P8 stays FAIL operationally; packet is not a live grant | **FAIL (required)** — flag false; default lists omit GRIN; scheduler does not import the flag; tests state packet is **not authorization** |
| S1 / S2 / P3 preserved | **PASS preserved** — **not re-run, not reopened** |
| Device / live / billing / public Done | **not marked** — **NOT RUN** |

---

## Verdicts

| Item | Result |
|---|---|
| Inert production-path wiring vs `60c4bc1` | **PASS** SOURCE + INJECTED |
| Flag remains false; live GRIN not on the default purge | **PASS** for that fact |
| **P3** | **ACCEPTED** preserved — **not re-run** |
| **P8** | **FAIL** (inert path; flag false; GRIN omitted from default purge; public window UNRESOLVED) |
| **S1 / S2** | **PASS preserved** — no new reproduction — **not re-run** |
| Helper pin | **`520f9f9` STALE vs `540e07a`** — recorded, not rewritten |
| Canonical GHA for `540e07a` | **NOT RUN** (`37440328976` is `fcda7cd`/`70bdfe4` only) |
| NATIVE_DEVICE / LIVE_BACKEND / billing / public | **NOT RUN** |

`REVIEW_60c4bc1.md` SOURCE+INJECTED PASS for already-owned Play lifecycle
**stands**. This slice did not change billing.

---

## Commands actually run (labels + exits)

Tests executed **in this T5 worktree** against **`540e07a` deletion blobs**
(temporarily checked out, then restored). Leftover P3-FAIL files stayed
dirty. No deploy. No helper rewrite.

| Command | Label | Exit |
|---|---|---|
| `npx --yes tsx functions/src/deletion/grinCleanup.unit.test.ts` | INJECTED (+ SOURCE file scans) | **0** (`grinCleanup.unit.test.ts: ok (INJECTED)`) — **PASS** |
| `npx --yes tsx functions/src/deletion/deletion.unit.test.ts` | INJECTED / SOURCE (lease, phases, `accountPurgeMayComplete`, storage paging mocks) | **0** (`deletion.unit.test.ts: ok`) — **PASS** |
| `adb devices` | NATIVE_DEVICE | empty list — **NOT RUN** |
| `gh auth status` | Canonical CI | not logged in — **NOT RUN** |

---

## NOT RUN

LIVE_BACKEND inspect/apply, A1–A7 execute, EAS, Play writes, billing
activation, catalog/RTDN live, REAL-CHARGE, public submission,
NATIVE_DEVICE / PLAY_INSTALLED, G2 Firestore/Storage emulator, S1/S2 Team 5
harness re-exec, canonical GHA API fetch for `540e07a`, leftover `5d5df3d`
expected-FAIL copies, helper rewrite, `INCLUDE_GRIN_IN_ACCOUNT_PURGE` flip,
live account purge, 400-document Admin Firestore cursor of
`listGrinCollectionPaged`.

---

## Blockers

**None** for this inert production-path slice at SOURCE/INJECTED. No flag
flip, no diary-list GRIN append, no production `force`, no other-uid
delete path, no committed customer identifiers, no claim that P8 is
operationally done.

Do not treat this SHA as a live GRIN-deletion grant. Do not delay Internal
GRIN on billing-activation residuals. Do not rewrite the helper here.

---

## Verdict

**PASS at SOURCE + INJECTED** for application `540e07a` vs `60c4bc1`
**for the inert P8 GRIN purge production-path only**. The flag stays
**false**. The GRIN gate is independent of diary phase-done. Completion
refuses `completed` if the flag **would** be on and GRIN did not complete.
Paged `startAfter` is present. Flag-false skips GRIN trees; `force: true`
is test-only; other-uid prefixes remain. Helper pin remains **`520f9f9`
(STALE)**. Canonical GHA **`37440328976` does not cover this SHA**.

**P3 ACCEPTED. P8 FAIL. S1/S2 preserved.** Packet is **not** a live grant.
No new defect with a reproduction that blocks Internal GRIN.

Do not mark device / live / billing / public Done. Do not flip
`INCLUDE_GRIN_IN_ACCOUNT_PURGE`. Do not rewrite the helper in this review.
Do not force-push `origin/team/grin-t5-qa`.
