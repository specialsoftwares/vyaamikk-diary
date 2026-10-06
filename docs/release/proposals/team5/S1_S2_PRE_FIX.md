# Team 5 independent S1 / S2 pre-fix reproduction

AI QA / release-gate role, not human certification. Not a fix. Combined
`/Users/shivamsaurav/vyd-worktrees/grin-combined` was **read-only** evidence
(and the import root for the real G2 adapter). This worktree was **not**
reset (prior dirty Team 5 notes left in place). Historical dirty workspace
**not** edited. **No deploy.**

**WAITING_FOR_FIX.** Team 2 has not landed an S1/S2 application change on
combined. Coordinator HEAD after `41b05a4` is docs-only (`e981587`, then
`28ec816` A1 packet). Do not invent a pass. Native / live backend / billing
/ public release remain **not accepted**.

S1 and S2 are reported **separately** from **P8** and from device
acceptance. **P3 remains ACCEPTED** (no new issuance-quota failure this
session). **P8 remains FAIL.**

---

## Coordinates

| Item | Value |
|---|---|
| QA worktree | `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa` `team/grin-t5-qa` |
| Combined (read-only) | `/Users/shivamsaurav/vyd-worktrees/grin-combined` |
| Application SHA (pre-fix) | `b845e8a30262b9e8740fa53b55e9a0f237caea0b` |
| PR head GHA verified | `41b05a49e8e60597b63a35f22825878bc1945dee` |
| GitHub Actions | run **`37379529193`**, job **`111997702708`**, workflow head **`41b05a4`**, verify / canonical CI **success**. Recorded from the coordinator register matching this checkout. `gh` unauthenticated here; **not re-fetched**. Do **not** cite `37351685421` for this tree. |
| Combined HEAD when executed | `28ec816904646ce8a0890b6b5bf4c22096986a67` (`docs(grin): fold refreshed A1 Firestore-only packet`) |
| Application blobs at that HEAD | `tools/goods-evidence-storage/{adapter,storageQuota}.ts` git blobs **identical** to `b845e8a` (`3ca2df5d…` / `3ff0217c…`) |
| Constraint | `docs/release/proposals/coordinator/S1_S2_STORAGE_CONSTRAINT.md` (combined; read-only) |
| Team 2 worktree HEAD | `e981587` — **no** G2/storageQuota diff vs combined. No S1/S2 implementation landed. |
| `GRIN_OPS_ALLOW_LIVE` | unset |

`git diff b845e8a HEAD -- functions src tools/goods-evidence-storage` on
combined: **empty**. `git diff 41b05a4 HEAD` on combined: docs only
(board/register/A1 packet/S1–S2 constraint).

Packaged Functions G2 vs tools: GENERATED header + import remap
(`../../src/goodsEvidence/…` → `../…`) + trailing-newline on
`storageQuota.ts`. Not an S1/S2 fix.

---

## What was executed

Proof is the **real** `GoodsEvidenceStorageAdapter.reserve` against
`FAKE_injectedFirestore` persistence. `admitStorageReservation` is a
labelled helper, **not** the sole proof. Existing
`storageQuota.injected.unit.test.ts` **exit 0** does **not** mean S1/S2
are absent.

| Command | Label | Exit |
|---|---|---|
| `git -C …/grin-combined rev-parse HEAD` → `28ec816…` | SOURCE | **0** |
| `git -C …/grin-combined rev-parse {HEAD,b845e8a}:tools/goods-evidence-storage/adapter.ts` → both `3ca2df5d…` | SOURCE | **0** |
| `git -C …/grin-combined rev-parse {HEAD,b845e8a,41b05a4}:tools/goods-evidence-storage/storageQuota.ts` → all `3ff0217c…` | SOURCE | **0** |
| `git -C …/grin-combined diff --stat b845e8a HEAD -- functions src tools/goods-evidence-storage` empty | SOURCE | **0** |
| Inspect `originalHoldKey` / `numField` / `adapter.reserve` holdKey (below) | SOURCE | **0** |
| `INCLUDE_GRIN_IN_ACCOUNT_PURGE = false`; `DELETION_GRACE_MS = 15 * 24 * 60 * 60 * 1000` | SOURCE | **0** (P8 unchanged; not S1/S2) |
| `npx --yes tsx tools/goods-evidence-storage/storageQuota.injected.unit.test.ts` (combined) | INJECTED | **0** — existing suite; **does not cover S1/S2** |
| `GRIN_QA_REPO_ROOT=/Users/shivamsaurav/vyd-worktrees/grin-combined npx --yes tsx docs/release/proposals/team5/s1-s2-pre-fix.injected.ts` (from `grin-t5-qa`) | INJECTED | **0** — defects **reproduced** |
| G1/G2/Functions/Rules emulator / Firestore transaction | EMULATOR | **NOT RUN** |
| NATIVE_DEVICE / PLAY_INSTALLED / LIVE_BACKEND | — | **NOT RUN** |

Harness:

```bash
cd /Users/shivamsaurav/vyd-worktrees/grin-t5-qa
GRIN_QA_REPO_ROOT=/Users/shivamsaurav/vyd-worktrees/grin-combined \
  npx --yes tsx docs/release/proposals/team5/s1-s2-pre-fix.injected.ts
# exit 0
```

Exit **0** on this file means the **pre-fix defects reproduced**. It is
not a product pass. After a real fix the same assertions must fail until
the harness is replaced by a post-fix review.

---

## SOURCE (pre-fix mechanism)

`tools/goods-evidence-storage/storageQuota.ts` at `b845e8a`:

- `originalHoldKey(evidenceId)` → `` `original:${evidenceId}` `` — **no
  ledgerId, no kind beyond the prefix, no owner** (owner is the document
  path `users/{uid}/goodsEvidenceStorage/accounting`).
- `numField` returns `Number.NaN` for non-integer numbers (including
  `undefined`, `"900"`, `0.5`).
- `parseStorageAccounting` rejects counters with `< 0`. **`NaN < 0` is
  false**, so those documents are not `{ malformed: true }`.
- Integer `retainedOriginalBytes: 0` with a 900-byte retained hold is
  also accepted (inconsistent inventory vs counters).
- `admitStorageReservation` charges **counter fields** via
  `chargedStorageBytes` **before** `recount` of holds. `NaN + 200 > 1000`
  is false, so a 200-byte reservation is admitted. Inconsistent `0` yields
  `0 + 200 > 1000` false. After admit, `recount` writes **1100**.

`tools/goods-evidence-storage/adapter.ts` `reserve` (and packaged
`functions/src/goodsEvidence/g2/adapter.ts` line 380):

```text
holdKey: originalHoldKey(parsed.evidenceId),
replay: objectSnap.exists,
```

Object path is `users/{uid}/goodsEvidenceLedgers/{ledgerId}/evidenceObjects/{evidenceId}`
(ledger-scoped). Hold key is **not**. Occupied-key “replay” in
`admitStorageReservation` returns `ok: true` without checking ledger,
size, or kind. Adapter `replay` is only `objectSnap.exists`, so a
**second ledger** is a new object write plus a colliding hold.

Zero reservation/accounting writes on malformed state is the **post-fix
bar**, not what this tree does.

---

## S1 — malformed / inconsistent accounting bypasses the cap

Setup (INJECTED persistence, then **real** `adapter.reserve`):

- retained hold `original:ev_s1_retained` = 900 bytes, phase `retained`
- cap override **1000** (test override; not advertised GiB)
- new original `ev_s1_new` claimed **200** bytes
- `retainedOriginalBytes` injected as omitted/`undefined`, `"900"`,
  `0.5`, or inconsistent `0`

| Variant | Label | `reserve.ok` | evidence object written | `appliedWrites` delta | persisted charged |
|---|---|---|---|---|---|
| omitted / undefined | INJECTED | **true** | yes | **4** | **1100** |
| `"900"` | INJECTED | **true** | yes | **4** | **1100** |
| `0.5` | INJECTED | **true** | yes | **4** | **1100** |
| inconsistent `0` | INJECTED | **true** | yes | **4** | **1100** |

Persisted accounting after each variant (adapter, not helper):

```json
{
  "schemaVersion": 1,
  "reservedOriginalBytes": 200,
  "retainedOriginalBytes": 900,
  "reservedDerivativeBytes": 0,
  "retainedDerivativeBytes": 0,
  "holds": {
    "original:ev_s1_retained": { "kind": "original", "bytes": 900, "phase": "retained" },
    "original:ev_s1_new": { "kind": "original", "bytes": 200, "phase": "reserved" }
  }
}
```

Helper `admitStorageReservation` on the same four documents: `ok: true`,
charged **1100** (HELPER; not sole proof).

**Pre-fix result: S1 FAIL (defect reproduced).** Cap 1000 is bypassed;
usage becomes 1100; reservation and accounting **are written**. Post-fix
bar: `quota_state_invalid`, **zero** reservation/accounting writes, no
silent repair inside admission.

EMULATOR Firestore transaction: **NOT RUN**.

---

## S2 — hold identity omits ledger; same evidenceId across owned ledgers

Same owner `owner_t5_s1s2`, two **valid owned** ledgers
(`ledger_t5_s2_a`, `ledger_t5_s2_b`), distinct issued receipts
(`receipt_t5_s2_a`, `receipt_t5_s2_b`), **same** `evidenceId`
`ev_s2_shared`. Two real `adapter.reserve` calls (claimed 200 then 250).

| | Ledger A | Ledger B |
|---|---|---|
| `reserve.ok` | true | true |
| `replayed` | false | false (new object; not object replay) |
| `objectKey` | `…0001` | `…0002` |
| claimed bytes | 200 | 250 |

Persisted evidence documents (both exist):

- `users/owner_t5_s1s2/goodsEvidenceLedgers/ledger_t5_s2_a/evidenceObjects/ev_s2_shared`
  — ledger A, receipt A, 200 bytes, state `reserved`
- `users/owner_t5_s1s2/goodsEvidenceLedgers/ledger_t5_s2_b/evidenceObjects/ev_s2_shared`
  — ledger B, receipt B, 250 bytes, state `reserved`

Hold identities after both reserves: **one** key,
`original:ev_s2_shared` `{ kind: "original", bytes: 200, phase: "reserved" }`.

Charged total: **200** after first, **200** after second. If hold identity
included ledger, charged would be **450**. Second reservation is admitted
as occupied-key success and still **writes** a second evidence object
(`appliedWrites` 4 → 8).

**Pre-fix result: S2 FAIL (defect reproduced).** Cross-ledger adapter
case **was executed** (not inferred from `originalHoldKey` alone).

EMULATOR: **NOT RUN**.

---

## P3 / P8 (not reopened as new S1/S2 work)

| ID | This session | Notes |
|---|---|---|
| **P3** issuance monthly allowance | **ACCEPTED** (unchanged) | No new failure. Not re-executed; prior Team 5 INJECTED register proof at `b845e8a` stands. |
| **P8** public deletion/retention | **FAIL** (unchanged) | `INCLUDE_GRIN_IN_ACCOUNT_PURGE = false`. Default storage prefixes still omit quoted `"grinEvidence"`. Default Firestore purge still omits GRIN trees. `DELETION_GRACE_MS` still 15 days. **Not** closed by S1/S2. Do not flip the flag in a storage-accounting fix. |

Device acceptance is **NOT RUN** and is **not** implied by S1/S2
INJECTED results.

---

## PHASE 2

**WAITING_FOR_FIX.** Combined application tree is still `b845e8a`. No
post-fix SHA was provided. This session did **not** implement a fix and
did **not** mark zero-write, identity-across-ledgers, contention, replay,
interrupted upload, generated-source parity, confirmation-refresh, or
immutable-original as passed.

When a later coordinator resume names a post-fix SHA, re-exercise those
items on that SHA. Do not equate a green existing quota suite with
absence of defects.
