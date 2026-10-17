# Team 5 independent review — application `56f2040`

AI QA / release-gate role, not human certification. Combined
`/Users/shivamsaurav/vyd-worktrees/grin-combined` was **read-only**. This
worktree was **not** reset. Historical dirty workspace **not** edited.
**No deploy.** Parent `GRIN_OPS_ALLOW_LIVE` remained **unset**. Helper
**not** rewritten.

Scope is **only** the T2 capacity / inactive-cleanup slice after Team 5
`CLOSEOUT_0d7aa17.md` (`00fd822`). Entire GRIN history is **not**
re-reviewed. S1 / S2 / P3 are **not reopened** (no new reproduction).
Device / live backend / billing / public are **not accepted**. **P8 is not
flipped.**

Leftover dirty `POLICY_QA.md` / `issuance-monthly-allowance.regression.test.mjs`
/ `public-deletion-retention.regression.test.mjs` still describe **P3 FAIL
at `5d5df3d`**. They were **left uncommitted**.

---

## Coordinates (verified)

| Item | Value |
|---|---|
| QA worktree | `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa` `team/grin-t5-qa` @ `00fd822` before this file |
| Combined (read-only) | `/Users/shivamsaurav/vyd-worktrees/grin-combined` `integration/grin-g1-g5-source` @ `28182c2ee8cf4767d3c316f4cc6b337b4bfa240a` (docs after T2 fold) |
| Current application SHA | `56f2040e30159579edc0cbfbc88e2ba706a6abd2` (cherry-pick of `team/grin-t2-capacity` `2cebe32a8a78dc1928c5abc984a29887ccf7a954`) |
| Previous freeze application | `520f9f98bc952fd7f30a907da9e85774629a69c0` |
| T2 app blobs vs combined `56f2040` | **byte-identical** on the eleven listed application files |
| Combined HEAD vs `56f2040` on those paths | **empty** (`28182c2` is docs-only after the fold) |
| Helper `PINNED_APP_SHA` | **`520f9f9`** at `56f2040` / `28182c2` / `0d7aa17`. **STALE vs current application `56f2040`**. Not rewritten this review. |
| Helper blob | `56f2040` = `0d7aa17` = `23f71103…`. Historical `228a8f5` = `d42c74ba…`. **`0d7aa17` is not byte-identical to `228a8f5`.** |
| Historical ops-guard | `228a8f5` suite **34/34** stays **historical**. Not re-run. Not application CI. |
| Canonical GHA | Run **`37425360211`** covers **`0d7aa17` / application `520f9f9` ONLY**. It does **not** cover `56f2040`. `gh` unauthenticated here; **not re-fetched**. Inner suite counts **not invented**. Do **not** cite `37379529193` or `37351685421` for this SHA. |
| Internal AAB freeze candidate | Still **`520f9f9` + CI `37425360211`**. Current HEAD / `56f2040` is **not** that freeze. |
| `GRIN_OPS_ALLOW_LIVE` (this shell) | unset |
| `adb devices` | `List of devices attached` (empty) |

`git diff --stat 520f9f9 56f2040 -- functions/src/goodsEvidence/g1 src eas.json app.json app firebase.json tools/goods-evidence-emulator`: **empty**.

---

## Label split (keep separate)

| Host | This review |
|---|---|
| SOURCE | Slice vs `520f9f9`; flags; packager remap-parity; `MAX_STORAGE_HOLDS=2500` not a SKU |
| INJECTED / PURE_DOMAIN | Behavioral deletion + holds-capacity tests below |
| EMULATOR | **NOT RUN** (no holds-capacity emulator case landed; S1/S2 named G2 emulator **not** re-executed) |
| TOOLING | Helper pin recorded STALE; helper **not** rewritten; ops-guard **not** re-run |
| SOURCE CI | GHA `37425360211` is **`520f9f9` / `0d7aa17` only**. **No** canonical CI for `56f2040`. |
| LIVE_BACKEND | **NOT RUN** |
| NATIVE_DEVICE / PLAY_INSTALLED | **NOT RUN** (no connected phone; empty `adb`; host SQLite / mounted inert React is **not** device evidence) |
| Payment / public-submission | **NOT RUN** / **not accepted** |

---

## What landed (this slice only)

Diff vs freeze application `520f9f9` on application paths:

- `functions/src/deletion/{grinCleanup.ts,grinCleanup.unit.test.ts,grinCleanupLists.ts}`
- `functions/src/goodsEvidence/g2/{adapter,storageQuota,types}.ts`
- `tools/goods-evidence-storage/{adapter,storageQuota,storageQuota.unit.test.ts,storageQuota.injected.unit.test.ts,types}.ts`

Plus T2 docs `HOLDS_MAP_BOUND.md` and `CAPACITY_ECONOMICS_DELETION_HANDOFF.md`.

Packager (SOURCE, packager **not** executed): Functions G2 copies keep the GENERATED header. After remapping `../time|evidence|ports|entitlementLifecycle` → `../../src/goodsEvidence/…`, bodies match tools. Exit **0**.

`src/` has **no** `holdCount` / `holdsCapacity` / `holdsAtCapacity` / `MAX_STORAGE_HOLDS`. Ledger telemetry is adapter `storageStatus` only — **not** a customer SKU.

---

## 1. Source correctness — holds map (PASS at SOURCE + INJECTED)

`MAX_STORAGE_HOLDS = 2500` is a **technical entry limit** on one accounting
document. It is **not** a storage SKU, not advertised GiB, not proof every
write will be accepted by live Firestore.

Observed:

- `admitStorageReservation` refuses a **new** hold when `holdCount >= 2500`
  (`holds_map_at_capacity` → adapter `quota_state_invalid` +
  `HOLDS_MAP_CAPACITY_DETAIL`). Replay of an existing key is allowed
  **before** that check.
- `accountingConsistencyError` uses `holdCount > 2500` so a **full** 2500-entry
  map remains readable. Existing holds are not discarded.
- User-facing detail names **neither** `2500` **nor** GiB. Existing files
  “can still be viewed, downloaded, or exported.”
- PURE_DOMAIN: 15 MiB-PDF originals fill of proposed 20 GiB = **1365** slots,
  `blocked: false`, estimate **under** 1 MiB. Starter / professional same.
  2500 max-id originals **and** 2500 max-id derivatives **under** 1 MiB.
  277+2216 mixed fan-out **under**. 660+5280 derivative fill of proposed
  20 GiB **over** 1 MiB (estimator). Integer **not** raised — correct for
  this document shape.
- INJECTED adapter: seed one retained original (80 bytes) + fillers to
  2500 holds; new `reserve` denied; **no** new evidence object; accounting
  snapshot **identical**; `storageStatus.holdsAtCapacity === true`;
  `downloadOriginal` / `retrieveOriginal` of the kept original still **ok**.
- Estimator is the published field-name + 32 B model, **not** a live
  Firestore measurement.

GiB maps remain `PROPOSED_PENDING_OWNER_CONFIRMATION`. Economics **HOLD**.
Do not advertise.

S1/S2 identity / corrupt-counter paths were **not** changed in a way that
produced a new failure here. Those findings stay closed at the prior
INJECTED + named G2 EMULATOR boundary (`1e33894`). **Not re-run. Not
reopened.**

---

## 2. Source correctness — inactive GRIN cleanup (PASS as inactive lists; P8 FAIL)

`INCLUDE_GRIN_IN_ACCOUNT_PURGE` remains **`false`**.
`DELETION_GRACE_MS` remains **15 days**. Neither was flipped to paint P8
green.

Default `USER_STORAGE_CATEGORIES` still `letterhead | attachments | pdfs`
(no `grinEvidence`). Default `USER_SUBCOLLECTIONS` still omits GRIN trees.
`runFinalAccountPurge` still gates GRIN behind `if (INCLUDE_GRIN_IN_ACCOUNT_PURGE)`.
`scheduledDeletionCleanup` does **not** import the flag.

This is **not** an operational deletion service. Lists + `force: true` exist
for tests. Live account purge **must not** be described as GRIN-complete
while the flag is false. **P8 remains OPEN / FAIL.** Public-approved window
still UNRESOLVED (15 implemented / 180 requested / not Play-certified).

Behavioral INJECTED (`grinCleanup.unit.test.ts`, not a collection-name
search):

- Flag off, full owner inventory present (ledgers, receipts, events,
  commands, serials, evidenceObjects, links, control, admission,
  uploadControl, object/derivative keys, accounting) **plus** Storage
  original + derivative **plus** a second owner: `attempted: false`,
  `detail: "grin_purge_disabled"`; **all** u1 and u2 docs/files remain.
- `force: true` (test-only): u1 Storage originals+derivatives gone; u1
  Firestore count **0**; nested children gone; **u2 isolated**.
- Second `force: true` on empty trees: `storageDeleted: 0`,
  `firestoreDeleted: 0`, still completed.
- First Storage delete throws timeout → `failed/retryable`; nested
  Firestore still present; retry completes and trees empty.
- Delete order: event **before** receipt **before** ledger.

Independent (ephemeral `/tmp` harness, **not** committed):
`listSubcollections` always `[]` while nested docs exist. Flag-off still
leaves 5 docs. `force: true` still visits `GRIN_KNOWN_NESTED_COLLECTION_IDS`
and deletes child-before-parent to empty. Exit **0**.

---

## Commands actually run (labels + exits)

Tests executed **in** combined (read-only git; application paths stayed
clean). Combined also had unrelated T4 packet dirt; **not** edited.

| Command | Label | Exit |
|---|---|---|
| python remap-parity of G2 `storageQuota` / `adapter` / `types` | SOURCE | **0** |
| python SOURCE flags (`INCLUDE_GRIN_IN_ACCOUNT_PURGE=false`, `DELETION_GRACE_MS` 15d, `MAX_STORAGE_HOLDS=2500`, pin `520f9f9`, default lists omit GRIN, capacity detail has no 2500/GiB) | SOURCE | **0** |
| `npx --yes tsx functions/src/deletion/grinCleanup.unit.test.ts` | INJECTED | **0** |
| `npx --yes tsx tools/goods-evidence-storage/storageQuota.unit.test.ts` | PURE_DOMAIN | **0** |
| `npx --yes tsx tools/goods-evidence-storage/storageQuota.injected.unit.test.ts` | INJECTED | **0** |
| `npx --yes tsx tools/goods-evidence-emulator/quota.injected.unit.test.ts` | INJECTED (P3) | **0** |
| `npx --yes tsx /tmp/t5-56f2040-incomplete-subs.ts` (ephemeral; not committed) | INJECTED | **0** (first attempt exit **1** was harness top-level-await / CJS, not product) |
| `npm run typecheck:goods-evidence-g2` | SOURCE | **0** |
| `adb devices` | NATIVE_DEVICE | empty list — **NOT RUN** |

---

## P3 / P8 / S1 / S2

| ID | Result | Notes |
|---|---|---|
| **S1** | **PASS preserved** | Prior `1e33894` INJECTED + named G2 EMULATOR. This slice does not newly reproduce a failure. **Not re-run.** |
| **S2** | **PASS preserved** | Same. **Not re-run.** |
| **P3** | **ACCEPTED** | G1 / emulator quota **not** in `520f9f9..56f2040`. Re-ran `quota.injected.unit.test.ts` exit **0**. No new issuance failure. |
| **P8** | **OPEN / FAIL** | Flag false; 15-day grace; default purge lists omit GRIN; 180 not implemented; public window UNRESOLVED. Inactive cleanup **≠** operational deletion. Do **not** flip the flag. |

---

## NOT RUN

LIVE_BACKEND inspect/apply, A1, live mutations, EAS, Play writes, billing
activation / catalog / purchases, public submission, NATIVE_DEVICE /
PLAY_INSTALLED, G2 Firestore/Storage emulator (including
`storageQuota.emulator.test.ts` / `rules.emulator.test.ts`), G1 emulator
`8088`, T1 Functions emulator `8090`, S1/S2 Team 5 harness re-exec,
canonical GHA API re-fetch for any SHA, ops-guard 34/34 re-exec, leftover
`5d5df3d` expected-FAIL regression copies.

**PASS at SOURCE + INJECTED** for this slice’s stated behaviors (fail-closed
holds capacity; inactive GRIN cleanup remains off). **Not** a freeze.
**Not** device, live, billing, or public Done.

---

## Verdict

**PASS at SOURCE + INJECTED** for application `56f2040` vs freeze
`520f9f9` on holds-map capacity and inactive GRIN cleanup. Helper pin
remains **`520f9f9` (STALE)**. Canonical GHA `37425360211` does **not**
cover this SHA. Internal AAB freeze remains **`520f9f9` + `37425360211`**.

**P3 ACCEPTED. P8 FAIL. S1/S2 preserved.** No new defect with a
reproduction. Do not enable GRIN. Do not flip `INCLUDE_GRIN_IN_ACCOUNT_PURGE`.
Do not treat 2500 as a SKU. Do not mark device / billing / public Done.
