# Team 5 independent S1 / S2 post-fix review

AI QA / release-gate role, not human certification. Combined
`/Users/shivamsaurav/vyd-worktrees/grin-combined` was **read-only**. This
worktree was **not** reset (prior dirty notes left in place). Historical
dirty workspace **not** edited. **No deploy.** `GRIN_OPS_ALLOW_LIVE` unset.

Pre-fix FAIL at `b845e8a` remains on record (`4c1e8a7`, `S1_S2_PRE_FIX.md`).
This file is PHASE 2 only. **Do not cite GHA `37379529193` for `520f9f9`.**
That run is `41b05a4` only. Do **not** cite `37351685421`.

**PASS at the stated INJECTED + EMULATOR (G2 `127.0.0.1:8091` /
`127.0.0.1:9200`, project `demo-vyaamikk-grin-g2`) boundary.** Not
NATIVE_DEVICE. Not LIVE_BACKEND. Not billing. Not public. Canonical GHA
for `520f9f9` **NOT RUN**.

S1 / S2 are **separate** from **P8** and from device acceptance.
**P3 remains ACCEPTED** (no new issuance failure on this SHA).
**P8 remains FAIL.**

---

## Coordinates (verified, not invented)

| Item | Value |
|---|---|
| QA worktree | `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa` `team/grin-t5-qa` |
| Combined (read-only) | `/Users/shivamsaurav/vyd-worktrees/grin-combined` `integration/grin-g1-g5-source` |
| Combined HEAD | `1ca33d613f85ebd8be6e70d5f3a614028979413a` |
| Application SHA (S1/S2) | `520f9f98bc952fd7f30a907da9e85774629a69c0` (cherry-pick of Team 2 `0cd3473`) |
| Pre-fix | `b845e8a30262b9e8740fa53b55e9a0f237caea0b` |
| Constraint | `docs/release/proposals/coordinator/S1_S2_STORAGE_CONSTRAINT.md` (combined; read-only) |
| `GRIN_OPS_ALLOW_LIVE` | unset |

`git diff 520f9f9 HEAD -- functions/src/goodsEvidence/g2 tools/goods-evidence-storage` on combined: **empty**. `1ca33d6` is docs + `package.json` test wiring only.

### Application blobs (HEAD == `520f9f9` ≠ `b845e8a`)

| File | HEAD / `520f9f9` blob | Pre-fix `b845e8a` blob |
|---|---|---|
| `tools/goods-evidence-storage/adapter.ts` | `e8f1c316c3ce033442115af581f72f6f45284872` | `3ca2df5d…` |
| `tools/goods-evidence-storage/storageQuota.ts` | `0aa95e71ada84c5a48469bebf2fec421b8d760e8` | `3ff0217c…` |
| `functions/src/goodsEvidence/g2/adapter.ts` | `a5070dc356fe6340d48cde0c01d34112adb01484` | `37a114d1…` |
| `functions/src/goodsEvidence/g2/storageQuota.ts` | `c04ce0e175493e6920d477e42eb17d99f37d4931` | `2587ac0b…` |

Packager parity (SOURCE, read-only; packager **not** executed so combined stayed clean): Functions copies have the GENERATED header; after remapping `../time|evidence|ports|entitlementLifecycle` back to `../../src/goodsEvidence/…`, bodies match tools. Exit **0**.

`MAX_STORAGE_HOLDS = 2500` in tools + packaged `storageQuota.ts`. Documented as the smallest reviewable bound for a ~1 MiB Firestore holds map (15 MiB-PDF fill of proposed 20 GiB ≈ 1,365 originals). **Not** indefinite scale. **Not** a product file-count SKU.

---

## Commands actually run (labels + exits)

Import root for Team 5 harnesses: `GRIN_QA_REPO_ROOT=/Users/shivamsaurav/vyd-worktrees/grin-combined`. Combined application tests were executed **in** combined (read-only git; no files committed there). Emulator debug logs were not left dirty (`git status` on combined stayed clean).

| Command | Label | Exit |
|---|---|---|
| blob / packager-parity / `MAX_STORAGE_HOLDS` / P8 flag / `originalsBundled` / `wouldClobberVerifiedOrLinked` / `persisted.original` / `confirmation_refresh` inspect (python + `git rev-parse`) | SOURCE | **0** |
| `GRIN_QA_REPO_ROOT=…/grin-combined npx --yes tsx docs/release/proposals/team5/s1-s2-post-fix.injected.ts` (from `grin-t5-qa`) | INJECTED | **0** |
| `npx --yes tsx tools/goods-evidence-storage/storageQuota.unit.test.ts` | SOURCE / PURE_DOMAIN helper | **0** — helper regression; **not** sole S1/S2 proof |
| `npx --yes tsx tools/goods-evidence-storage/storageQuota.injected.unit.test.ts` | INJECTED | **0** — existing suite; **not** treated as absence of defects by itself |
| `npx --yes tsx tools/goods-evidence-emulator/quota.injected.unit.test.ts` | INJECTED | **0** (P3) |
| `GRIN_QA_REPO_ROOT=…/grin-combined npx --yes tsx …/issuance-non-register-no-consume.injected.ts` | INJECTED | **0** (P3) |
| `npx --yes tsx tools/goods-evidence-storage/injected.unit.test.ts` | INJECTED | **0** — includes interrupted-upload cases (re-run, not old logs) |
| `npx --yes tsx tools/goods-evidence-emulator/mutations.injected.unit.test.ts` | INJECTED | **0** — immutable receipt original path |
| `npx --yes tsx src/services/grin/repository/GrinApplicationRepository.test.ts` | SQLITE_HOST | **0** — `originalsBundled=false` |
| `npx --yes tsx src/services/grin/outbox/outbox.sqliteHost.test.ts` | SQLITE_HOST | **0** — confirmation-refresh still in outbox; **not reopened** |
| `firebase emulators:exec --only firestore,storage --project demo-vyaamikk-grin-g2 --config tools/goods-evidence-storage/firebase.json -- 'storage.emulator.test.ts && storageQuota.emulator.test.ts && s1-s2-post-fix.emulator.ts'` | EMULATOR | **0** |
| `rules.emulator.test.ts` / full `test:goods-evidence-g2-emulator` string | EMULATOR | **NOT RUN** (only the three scripts above) |
| G1 `8088` / T1 Functions `8090` | EMULATOR | **NOT USED** |
| Canonical GHA for `520f9f9` | — | **NOT RUN** |
| NATIVE_DEVICE / PLAY_INSTALLED / LIVE_BACKEND / billing / public | — | **NOT RUN** |

Named emulator host this session (printed by the harness):

```text
FIRESTORE_EMULATOR_HOST=127.0.0.1:8091
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9200
PROJECT_ID=demo-vyaamikk-grin-g2
```

Existing-suite greens are listed because they were executed. They are **not** a substitute for the Team 5 adapter/emulator cases below.

---

## S1 — PASS (INJECTED + EMULATOR)

Retained hold 900 (`1.o.{len}.{ledger}.{len}.ev_s1_retained` / `ev_old` on emulator), cap 1000, new 200. `retainedOriginalBytes` omitted/`undefined`, `"900"`, `0.5`, inconsistent `0`.

| Variant | INJECTED `reserve` | writes | accounting | EMULATOR `127.0.0.1:8091` |
|---|---|---|---|---|
| undefined | `ok:false` `quota_state_invalid` | **0** | untouched | same; field remains absent |
| `"900"` | `ok:false` `quota_state_invalid` | **0** | untouched | same; field still `"900"` |
| `0.5` | `ok:false` `quota_state_invalid` | **0** | untouched | same; field still `0.5` |
| inconsistent `0` | `ok:false` `quota_state_invalid` | **0** | untouched | same; counters still `0` / hold 900 |

No evidence object created. Admission does not call `repairAccounting`. Absent-document empty path was not the S1 seed (corrupt **existing** docs).

---

## S2 — PASS (INJECTED + EMULATOR)

Same owner, two owned ledgers, distinct receipts, same `evidenceId`. Real `adapter.reserve` twice (200 then 250).

INJECTED persisted evidence:

- `users/owner_t5_pf/goodsEvidenceLedgers/ledger_t5_pf_a/evidenceObjects/ev_s2_shared` (200)
- `users/owner_t5_pf/goodsEvidenceLedgers/ledger_t5_pf_b/evidenceObjects/ev_s2_shared` (250)

Hold identities (ledger included):

- `1.o.14.ledger_t5_pf_a.12.ev_s2_shared`
- `1.o.14.ledger_t5_pf_b.12.ev_s2_shared`

Charged total **450** (sum of both). Identical replay of ledger A: `replayed: true`, charged still **450**. Other owner isolated (120 vs 80). Occupied key + different size after object delete: `quota_state_invalid`, **zero** writes. Concurrent 600+600 near cap 1000: one `ok`, one `quota_exhausted`, used **600**.

EMULATOR (`owner_t5_pf_emu`, host `127.0.0.1:8091`): two docs, two `1.o.…` keys, charged **450**; replay 450; other owner 50; conflict no writes; contention charged **600**. Team 2 `storageQuota.emulator.test.ts` also exit **0** on the same named host (300+400=700 in that file’s seeds).

---

## Verify / reject / retry / interrupted upload

INJECTED Team 5: verify retain 150-byte hold; reject/release a second reservation; `retryInterruptedUpload` on the verified original is `ok:false`; keep hold **150 retained**; drop hold gone; charged **150**.

Existing G2 `injected.unit.test.ts` re-run exit **0**, including labelled cases `interrupted upload retries via reserved` and `W2-03 interrupted upload recovers without duplicate evidence`. `storage.emulator.test.ts` re-run exit **0** (stale complete cannot clobber newer verification; replaced generation after verify rejected). Not inferred from prior logs.

---

## Confirmation-refresh and immutable-original

Re-checked on `520f9f9` / combined HEAD; **not reopened** (no new reproduction):

- SOURCE: `outbox.ts` still sets `lastErrorCode: "confirmation_refresh"` when confirmation is pending.
- SQLITE_HOST: `outbox.sqliteHost.test.ts` exit **0**.
- SOURCE: G2 `wouldClobberVerifiedOrLinked` still present; G1 `persisted.original = cloneSnapshot(receipt.original)` still present; repository `originalsBundled: false`.
- INJECTED: `mutations.injected.unit.test.ts` exit **0**.
- SQLITE_HOST: `GrinApplicationRepository.test.ts` exit **0**.

The older Team 5 `wave2evidence-confirmation-refresh.ts` inspects **this** worktree’s application tree (not `520f9f9`) and was **not** used as post-fix proof.

---

## P3 / P8

| ID | Result | Notes |
|---|---|---|
| **P3** issuance monthly allowance | **ACCEPTED** | `quota.injected.unit.test.ts` exit **0**; Team 5 `issuance-non-register-no-consume.injected.ts` exit **0**. First register consumes one slot; mutate / evidence / reconcile do not. No new failure. |
| **P8** public deletion/retention | **FAIL** | `INCLUDE_GRIN_IN_ACCOUNT_PURGE = false` unchanged. `DELETION_GRACE_MS` still 15 days. Not closed by S1/S2. Do not flip the flag. |

Device acceptance is **NOT RUN** and is not implied by INJECTED/EMULATOR PASS.

---

## NOT RUN

NATIVE_DEVICE, PLAY_INSTALLED, LIVE_BACKEND, billing catalog/purchases, public submission, canonical GitHub Actions on `520f9f9`, G1 emulator `8088`, T1 Functions emulator `8090`, `rules.emulator.test.ts`, live IAM, advertised GiB.

**PASS (S1/S2) at INJECTED + named G2 EMULATOR boundary only.**
