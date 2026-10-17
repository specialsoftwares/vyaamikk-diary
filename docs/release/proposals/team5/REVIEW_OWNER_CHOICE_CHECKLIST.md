# Team 5 owner-choice checklist — T2 1/3/10 GiB + 45-day

AI QA / release-gate role, not human certification. Combined
`/Users/shivamsaurav/vyd-worktrees/grin-combined` is **read-only**. Historical
workspace is **read-only**. This worktree was **not** reset. **No deploy.**
`GRIN_OPS_ALLOW_LIVE` remains **unset**. Helper **not** rewritten.

Written **before** Team 2 committed the owner-choice slice. T2 worktree
`/Users/shivamsaurav/vyd-worktrees/grin-t2-evidence` was still **`2cebe32`**
(`team/grin-t2-owner-choice-1310`, clean) when this file was authored.
Coordinator docs (`c45518a`) record the owner writes; **source is not yet
wired**. This checklist is the exact assertions Team 5 will run on the
**first T2 commit after `2cebe32`**. Entire GRIN history is **not**
re-reviewed.

Leftover dirty `POLICY_QA.md` / `issuance-monthly-allowance.regression.test.mjs`
/ `public-deletion-retention.regression.test.mjs` still describe **P3 FAIL
at `5d5df3d`**. They stay **uncommitted**.

When T2 lands: execute this file, then write `REVIEW_<sha>.md`. Do **not**
treat this checklist as a PASS.

---

## Baseline (must not move unless T2 commit exists)

| Item | Value |
|---|---|
| QA HEAD when authored | `7865384` (`REVIEW_56f2040` already done) |
| T2 HEAD when authored | `2cebe32a8a78dc1928c5abc984a29887ccf7a954` |
| Application still at that T2 HEAD | `56f2040` constants: starter **1** / professional **5** / business **20** GiB; `DELETION_GRACE_*` **15** days |
| Owner write (coordinator docs only) | Starter **1** / Professional **3** / Business **10** GiB; explicit deletion **45** days; **do not advertise** |
| `INCLUDE_GRIN_IN_ACCOUNT_PURGE` | **false** (must remain) |
| S1 / S2 | **PASS preserved** at `1e33894` unless a **new** reproduction |
| P3 | **PASS** unless a **new** issuance reproduction |
| P8 | **FAIL** while the flag is false |

Scope after T2 lands: **`2cebe32..<T2_HEAD>` only**. Do not re-run S1/S2
harness unless that diff newly touches accounting-identity / corrupt-counter
paths in a way that newly suspects failure.

---

## Label split (keep separate)

| Host | This slice |
|---|---|
| SOURCE | Constants, live lookup wiring, grace clocks, flag, advertising scan, packager remap-parity |
| INJECTED / PURE_DOMAIN | Cap refuse without override; holds-capacity originals preserved; behavioral GRIN cleanup |
| EMULATOR | **NOT RUN** unless T2 lands a new emulator case (S1/S2 named G2 emulator not re-executed by default) |
| LIVE_BACKEND | **NOT RUN** |
| NATIVE_DEVICE / PLAY_INSTALLED | **NOT RUN** — no phone = **NOT RUN**, never PASS |
| Payment / public-submission | **NOT RUN** / **not accepted** |

---

## A. Storage caps are actually 1 / 3 / 10 GiB (SOURCE)

`GIB = 1024 * 1024 * 1024` (`1073741824`).

| Plan | Required bytes | Forbidden leftover |
|---|---|---|
| free (enforcement on, not entitled) | `0` | — |
| starter | `1 * GIB` = `1073741824` | `256 * 1024 * 1024` (old alternative) |
| professional | `3 * GIB` = `3221225472` | `5 * GIB` = `5368709120` (old proposed) |
| business | `10 * GIB` = `10737418240` | `20 * GIB` = `21474836480` (old proposed) |

Assertions (all required):

1. The **live** cap table (whatever it is named after the slice —
   `PROPOSED_PENDING_OWNER_CONFIRMATION_STORAGE_CAPS_BYTES` or a successor)
   equals the 1 / 3 / 10 map above.
2. `storageCapBytesFromStatus` **returns those bytes** for
   `quotaEnforcementEnabled === true` + `entitlementActive === true` +
   `plan` in `{starter, professional, business}`. A renamed constant that is
   unused is a **FAIL**. An `OWNER_ALTERNATIVE_*` object that is still the
   lookup is a **FAIL**.
3. Adapter live path is still
   `this.hooks.storageCapOverrideBytes ?? storageCapBytesFromStatus(...)`
   in `storageStatus` / `repairAccounting` / `reserve` (tools + packaged
   Functions G2). Tests that only pass with `storageCapOverrideBytes` do
   **not** prove the live lookup.
4. Packaged `functions/src/goodsEvidence/g2/{storageQuota,adapter,types}.ts`
   stay GENERATED; after remapping
   `../time|evidence|ports|entitlementLifecycle` →
   `../../src/goodsEvidence/…`, bodies match tools. Exit **0**.

Python SOURCE snippet (run in T2 worktree after the commit):

```python
from pathlib import Path
p = Path("functions/src/goodsEvidence/g2/storageQuota.ts").read_text()
assert "starter: 1 * GIB" in p or "starter: 1*GIB" in p
assert "professional: 3 * GIB" in p or "professional: 3*GIB" in p
assert "business: 10 * GIB" in p or "business: 10*GIB" in p
assert "professional: 5 * GIB" not in p.replace(" ", "")
assert "business: 20 * GIB" not in p.replace(" ", "")
```

Adjust the string match if T2 writes `3 * GIB` with different spacing, but
the **numeric** live lookup must still be 1 / 3 / 10.

---

## B. Live lookup INJECTED (not constant-only)

Ephemeral `/tmp` harness **or** T2-landed tests. **No**
`storageCapOverrideBytes`. Seed `quotaEnforcementEnabled: true`,
`entitlementActive: true`.

| Case | Plan | Claimed size | Required |
|---|---|---|---|
| B1 | professional | `3 * GIB` | reserve **ok** (at cap, not over) **or** documented warn-only at 100% — must **not** be `quota_exhausted` if current admit allows equality |
| B2 | professional | `3 * GIB + 1` | reserve **denied** (`quota_exhausted`); **no** evidence object created; accounting snapshot unchanged |
| B3 | professional | size that would fit in leftover **5 GiB** but exceed **3 GiB** (e.g. `4 * GIB`) | **denied** — this is the leftover-5GiB trap |
| B4 | business | `10 * GIB + 1` | **denied**; leftover **20 GiB** must not admit |
| B5 | starter | `1 * GIB + 1` | **denied** |
| B6 | starter | `1 * GIB` | same equality rule as B1 |
| B7 | status missing / `quotaEnforcementEnabled !== true` | any | still `enforcement_off` (S1/S2 identity: do not newly claim success against a corrupt counter) |

Also PURE_DOMAIN: `storageCapBytesFromStatus({quotaEnforcementEnabled:true, entitlementActive:true, plan:"professional"}, true) === 3 * GIB`.

If T2 lands equivalent tests in
`tools/goods-evidence-storage/storageQuota*.ts`, run those instead of a
throwaway harness. Record command + exit.

---

## C. 45-day grace in identityLifecycle **and** finalPurge (SOURCE)

Required clocks (`45 * 24 * 60 * 60 * 1000` = `3888000000`):

| File | Assertion |
|---|---|
| `src/domain/identityLifecycle.ts` | `DELETION_GRACE_DAYS === 45`; `DELETION_GRACE_MS === 3888000000`; `computeDeletionScheduledFor(t) === t + 3888000000` |
| `functions/src/deletion/finalPurge.ts` | exported `DELETION_GRACE_MS === 3888000000` (literal `45 * 24 * 60 * 60 * 1000` or imported from the domain constant). **Must not** remain `15 * …`. **Must not** become `180 * …` |
| `functions/src/deletion/lifecycle.ts` | still **imports** `DELETION_GRACE_MS` from `finalPurge` (no private 15-day copy) |
| `src/services/accountDeletion/accountStatus.ts` | still imports from `identityLifecycle` |
| `app/(auth)/account-pending-deletion.tsx` and `app/(app)/settings/delete.tsx` | still interpolate `DELETION_GRACE_DAYS` (i18n `{{days}}`) |

**Split-brain BLOCKER** if
`functions/src/identity/resolveOrCreateUserByPhone.ts` keeps a **local**
`const DELETION_GRACE_MS = 15 * 24 * 60 * 60 * 1000` while the two required
files move to 45. That file currently has its own copy (line 31 at
`2cebe32`). After the slice it must be **45** or import the shared constant.

Forbidden: implementing **180**. Owner superseded 180 on 2026-10-06.
Forbidden: implementing **30** (that is the subscription-expiry notice, not
account deletion).

`grinCleanup.unit.test.ts` today asserts
`DELETION_GRACE_MS = 15 * 24 * 60 * 60 * 1000` against `finalPurge.ts`.
After the slice that lock **must** assert **45**, still reject **180**, and
must not be deleted to hide the clock.

---

## D. INCLUDE_GRIN_IN_ACCOUNT_PURGE still false (SOURCE + INJECTED)

| Assertion | Required |
|---|---|
| `functions/src/deletion/grinCleanupLists.ts` | `export const INCLUDE_GRIN_IN_ACCOUNT_PURGE = false` |
| `runFinalAccountPurge` | still `if (INCLUDE_GRIN_IN_ACCOUNT_PURGE)` |
| `scheduledDeletionCleanup` / `lifecycle.ts` | **does not** import the flag |
| Default `USER_STORAGE_CATEGORIES` | `letterhead \| attachments \| pdfs` — **no** `grinEvidence` |
| Default `USER_SUBCOLLECTIONS` | still omits GRIN trees |
| P8 | remains **OPEN / FAIL**. Do **not** flip the flag to paint P8 green |

---

## E. Behavioral deletion tests — not collection-name search (INJECTED)

Re-run `npx --yes tsx functions/src/deletion/grinCleanup.unit.test.ts`.
Must still **seed** owner inventory (ledgers, receipts, events, commands,
serials, evidenceObjects, links, control, admission, uploadControl, object /
derivative keys, accounting) **plus** Storage original + derivative **plus**
a second owner, then assert behaviour:

| Case | Required |
|---|---|
| Flag off, no `force` | `attempted: false`, `detail: "grin_purge_disabled"`; **all** u1 and u2 docs/files remain |
| `force: true` (test-only) | u1 Storage originals+derivatives gone; u1 Firestore count **0**; nested children gone; **u2 isolated** |
| Second `force: true` on empty trees | `storageDeleted: 0`, `firestoreDeleted: 0`, still completed |
| First Storage delete throws | `failed/retryable`; nested Firestore still present; retry completes |

A grep that only proves collection **names** exist is **not** this test.
Inactive cleanup lists + `force: true` **≠** an operational deletion
service. Live account purge **must not** be described as GRIN-complete
while the flag is false.

---

## F. Capacity fail-closed preserves originals (INJECTED)

Re-run
`npx --yes tsx tools/goods-evidence-storage/storageQuota.injected.unit.test.ts`
and
`npx --yes tsx tools/goods-evidence-storage/storageQuota.unit.test.ts`.

Holds-map case (already in the injected file at `2cebe32`): seed one retained
original (80 bytes) + fillers to `MAX_STORAGE_HOLDS` (2500); new `reserve`
denied; **no** new evidence object; accounting snapshot **identical**;
`downloadOriginal` / `retrieveOriginal` of the kept original still **ok**.
`HOLDS_MAP_CAPACITY_DETAIL` still names **neither** `2500` **nor** GiB.
`MAX_STORAGE_HOLDS = 2500` remains a technical bound, **not** a SKU.

Byte-cap refuse must still leave the original blob/object in place (no
silent delete). Do not treat 2500 as 1/3/10.

---

## G. No advertising strings (SOURCE)

Customer-facing `src/` / `app/` / i18n **must not** name Starter/Professional/Business
storage as **1 GiB / 3 GiB / 10 GiB** (nor leftover 5/20 or 256 MiB).

Allowed:

- Server constants and tests.
- i18n `{{days}}` deletion copy (that is the grace clock, not a storage SKU).
- Freight/staff “15 days” date-entry hints (unrelated clock).

Not allowed:

- Upgrade sheet / paywall / listing copy that states GiB allowances.
- Mapping storage `quota_exhausted` to a string that names unconfirmed or
  confirmed GiB.

Scan: `rg -n "1 GiB|3 GiB|10 GiB|5 GiB|20 GiB|256 MiB" src app src/i18n -g '!*.md'`.

`src/services/grin/repository/labels.ts` today says caps are
`PROPOSED_PENDING_OWNER_CONFIRMATION`. After wiring, that sentence must not
become advertised GiB. Internal SOURCE labels may say “do not advertise.”

Website `/privacy` and `/delete-account` still describing **15 days** is
**LIVE copy**, not this T2 SOURCE slice. Record as observation. Do not
invent a website edit. Public-approved window remains UNRESOLVED; **P8
stays FAIL**.

---

## H. S1 / S2 / P3 preservation

| ID | Default this slice | Re-run only if |
|---|---|---|
| **S1** | **PASS preserved** — do **not** re-run Team 5 S1/S2 harness | Diff after `2cebe32` newly changes accounting-identity / corrupt-counter / `parseStorageAccounting` fail-closed so a new failure is suspected |
| **S2** | same | same |
| **P3** | **PASS preserved** | Diff touches G1 `adapter.ts` / `quota.ts` / register transaction. If untouched, optionally re-run `tools/goods-evidence-emulator/quota.injected.unit.test.ts` (cheap INJECTED lock). Leftover `5d5df3d` expected-FAIL copies stay uncommitted |

If S1/S2 **are** newly suspected: run the existing Team 5 post-fix harness
(`s1-s2-post-fix.injected.ts` / named G2 emulator) and record labels. Do not
green-paint from SOURCE scan.

---

## Commands to run (after T2 commit)

Work in T2 worktree or a read-only checkout of that SHA. Combined stays
read-only. Do not reset this T5 worktree.

```text
git -C /Users/shivamsaurav/vyd-worktrees/grin-t2-evidence log --oneline 2cebe32..HEAD
git -C /Users/shivamsaurav/vyd-worktrees/grin-t2-evidence diff --stat 2cebe32..HEAD
adb devices   # empty => NATIVE_DEVICE NOT RUN
```

Then, with labels:

| Command | Label |
|---|---|
| SOURCE python: 1/3/10 live table; `storageCapBytesFromStatus` wiring; flag false; grace 45 in identityLifecycle **and** finalPurge **and** phone-resolve copy; no 180 | SOURCE |
| Packager remap-parity of G2 `storageQuota` / `adapter` / `types` | SOURCE |
| Advertising scan (`src` / `app` / i18n) | SOURCE |
| `npx --yes tsx tools/goods-evidence-storage/storageQuota.unit.test.ts` | PURE_DOMAIN |
| `npx --yes tsx tools/goods-evidence-storage/storageQuota.injected.unit.test.ts` | INJECTED |
| Live-lookup INJECTED (B1–B7) if T2 did not land equivalent tests | INJECTED |
| `npx --yes tsx functions/src/deletion/grinCleanup.unit.test.ts` | INJECTED |
| `npx --yes tsx tools/goods-evidence-emulator/quota.injected.unit.test.ts` | INJECTED (P3 lock) |
| `npm run typecheck:goods-evidence-g2` if still present | SOURCE |

Do **not** run LIVE inspect/apply, EAS, Play writes, billing activation, or
phone acceptance.

---

## Verdict rules for `REVIEW_<sha>.md`

- **PASS at SOURCE + INJECTED** only if A–G hold and P8 remains FAIL.
- **FAIL** if professional still admits 5 GiB, business still admits 20 GiB,
  live lookup ignores the new table, grace is 15 in one of the two required
  files, phone-resolve stays 15 while others are 45, flag flipped true,
  originals deleted on capacity refuse, advertising GiB in customer copy, or
  deletion “tests” are name-search only.
- **NOT RUN** ≠ PASS. No phone = NATIVE_DEVICE **NOT RUN**.
- Inactive cleanup **≠** operational deletion service.

---

## Peer packets — blockers only (skimmed while T2 had not landed)

Cosmetic / stale docs **do not delay** the T2 candidate.

### T1 consolidated (`grin-t1-backend` `841f9c4`)

Read: `A1_PRESENT.md` + `A2_A7_REMAINING.md` + `PIN_UPDATE_AFTER_56f2040.diff.md`.

| Class | Finding |
|---|---|
| Unauthorized access | A1 still owner-read / client CUD **false** on added GRIN matchers. Not executed. |
| Secret leakage | A3 post-create records secret **count**, values never printed. Not executed. |
| Lost evidence | A3 rollback forbids deleting serials/receipts/originals. |
| Unsafe deploy targeting | **HOLD, correctly.** A3 `gate-off-initial` must not run on helper pin `520f9f9` (would omit T2 capacity). Isolated `--config` required; repo-root `firebase.json` forbidden. `GRIN_OPS_ALLOW_LIVE` unset. |
| Blocker for T2 candidate? | **No.** Do not execute A1–A7 from this skim. |

### T3 device (`grin-t3-offline` `d4a8197`)

Read: `DEVICE_HANDOFF.md` + `CURRENT_HEAD_VS_FREEZE.md` + `APPROVAL_B_DRAFT.md`.

| Class | Finding |
|---|---|
| NATIVE_DEVICE | Owner form blank. **NOT RUN.** Never PASS. |
| Unsafe deploy targeting | Packet freeze is still **`520f9f9` + GHA `37425360211`**. Coordinator later **retired `520f9f9` as the build target**. B1/B2 **not granted**. Building `520f9f9` after that retirement, or silently retargeting B1 to `56f2040` under the old freeze packet, would be unsafe targeting — **HOLD until a new SHA + matching CI**. |
| Blocker for T2 candidate? | **No** (B1 not granted). Coordination, not T2 source FAIL. |

### T4 billing (`grin-t4-product` `7e4ed20`)

Read: `BILLING_PLAY_HANDOFF.md` + `blockers.md` + `DELETION_15_VS_180_OWNER_SHEET.md`.

| Class | Finding |
|---|---|
| Unintended charges | Purchase-entry **`"0"`**. `PLAY_BILLING_ENABLED` key **absent** (exact `"true"`). Catalog **NOT RUN**. LIVE_STORE **NOT RUN**. |
| Broken deletion commitments | T4 sheets still present **15 vs 180 UNRESOLVED**. Coordinator recorded **45-day** (source not wired). That lag is **cosmetic until T2 lands the constant**. P8 remains FAIL (GRIN purge flag). |
| Blocker for T2 candidate? | **No.** Do not delay for T4 sheet refresh. |

Cosmetic (do not delay candidate): T4 owner sheets stale vs 1/3/10 + 45-day;
T3 freeze packet vs retired `520f9f9` build target; T1 helper pin still
`520f9f9` vs application `56f2040`; T1 A1 packet still describes application
`520f9f9`.
