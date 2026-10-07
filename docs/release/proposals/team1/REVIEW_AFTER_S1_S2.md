# Team 1 — REVIEW_AFTER_S1_S2 (source / tooling boundary)

**Not authorization.** This file does not set `GRIN_OPS_ALLOW_LIVE`. Do not
deploy from this review. Do not rewrite
`docs/release/packets/grin-ops/grin-functions-op.mjs`. Do not set
`GRIN_OPS_PINNED_SHA`, fixtures, HTTP stubs, or `GRIN_OPS_ALLOW_LIVE=1`.
Do not pin `b845e8a`. A1 was **not** restarted. Combined was **not**
pushed. Historical workspace was **not** edited.

Team 1 verdict is at the **SOURCE / TOOLING** boundary only. Native device,
Play, live Functions/Rules/IAM, billing, and public-release remain out of
scope.

---

## Verdict

| Boundary | Verdict | Meaning |
|---|---|---|
| **SOURCE** | **PASS** | Application SHA `520f9f98bc952fd7f30a907da9e85774629a69c0` satisfies the S1/S2 storage constraints on the real G2 helper + adapter (tools) and the packager-generated Functions copies. Malformed accounting cannot admit past the cap. Hold identity includes `ledgerId`. Admission does not silently repair. |
| **TOOLING** | **PASS** | Ops-guard bytes still `228a8f58ac83d3c71e853cdccb6e4c4fa64c251f`. Suite **34/34** this session. Helper `PINNED_APP_SHA` is still frozen `5d5df3d54df08953bfb26db39a9b7f5e3d67ed47`. Tooling pin ≠ application pin. |
| **Pin apply** | **HOLD** | Propose `PINNED_APP_SHA = 520f9f98bc952fd7f30a907da9e85774629a69c0` only as an **unapplied** patch. Coordinator applies only after an independent **Team 5** post-fix pass at this same SHA. |
| **A1 isolated Firestore Rules** | **Still independently offerable: YES** | `firebase.rules-only.json --only firestore:rules`. A1 is not permission for Storage, Functions, IAM, tester seed, or enablement. Stale Functions pin does not block offering A1. |

A3 (`gate-off-initial`) remains **HOLD** until the pin is applied on a tree
whose deployment paths match `520f9f9` **and** Team 5 has recorded pass.

---

## Coordinates

| Item | Value |
|---|---|
| Team 1 worktree | `/Users/shivamsaurav/vyd-worktrees/grin-t1-backend` |
| Team 1 starting checkout | `3efd762b3762112aba19af15dbd545d9590c41af` (`team/grin-t1-backend`; origin **ahead 13, behind 2** — cannot ff-push) |
| Combined (read-only) | `/Users/shivamsaurav/vyd-worktrees/grin-combined` `1ca33d613f85ebd8be6e70d5f3a614028979413a` |
| Application SHA reviewed | `520f9f98bc952fd7f30a907da9e85774629a69c0` — S1/S2; cherry-pick of `0cd3473ab5aee2d88d31662e29794839bd9ee8aa` |
| Pre-fix (do **not** pin) | `b845e8a30262b9e8740fa53b55e9a0f237caea0b` |
| Frozen helper `PINNED_APP_SHA` (still live constant) | `5d5df3d54df08953bfb26db39a9b7f5e3d67ed47` |
| Ops-guard / helper bytes | `228a8f58ac83d3c71e853cdccb6e4c4fa64c251f` |
| Constraint | `docs/release/proposals/coordinator/S1_S2_STORAGE_CONSTRAINT.md` |
| Team 2 handoff | `docs/release/proposals/team2/S1_S2_HANDOFF.md` |
| Unapplied pin patch | `docs/release/proposals/team1/PIN_UPDATE_AFTER_S1_S2.diff.md` |
| `GRIN_OPS_ALLOW_LIVE` | **unset** (this session; never set to `1`) |
| `GRIN_OPS_PINNED_SHA` | **unset** |
| Canonical GHA for `520f9f9` | **NOT YET**. Do **not** cite `37379529193` (`41b05a4` only) or `37351685421`. |

This Team 1 worktree **HEAD application tree is still pre-S1/S2**
(`git diff --stat 520f9f9 -- functions/src/goodsEvidence/g2/{storageQuota,adapter}.ts`
non-empty). Inspection of the corrected artifact used combined
`1ca33d6`, whose `functions src eas.json app.json app firebase.json` and
`tools/goods-evidence-storage` blobs match `520f9f9` (`git diff` empty).
Cherry-pick identity: `git diff 0cd3473 520f9f9 -- functions/src/goodsEvidence tools/goods-evidence-storage src eas.json app.json app firebase.json` is **empty**. Git blobs:

| Path at `520f9f9` (= `0cd3473`) | blob |
|---|---|
| `tools/goods-evidence-storage/storageQuota.ts` | `0aa95e71ada84c5a48469bebf2fec421b8d760e8` |
| `tools/goods-evidence-storage/adapter.ts` | `e8f1c316c3ce033442115af581f72f6f45284872` |
| `functions/src/goodsEvidence/g2/storageQuota.ts` | `c04ce0e175493e6920d477e42eb17d99f37d4931` |
| `functions/src/goodsEvidence/g2/adapter.ts` | `a5070dc356fe6340d48cde0c01d34112adb01484` |

Helper blobs at this worktree HEAD **equal** `228a8f5`:
`grin-functions-op.mjs` `d42c74bab669e10c250cb72446d80523d8e010a5`,
`grin-functions-op.test.mjs` `e23b1ef30e6ba58c14badaeabe55b59af554cf7b`.
`git diff 228a8f58 --` those two files is **empty** on both this worktree
and combined `1ca33d6`.

---

## Packager — generated, not independently hand-edited

Authoritative sources: `tools/goods-evidence-storage/{storageQuota,adapter}.ts`.
Generated copies: `functions/src/goodsEvidence/g2/{storageQuota,adapter}.ts`
via `tools/goods-evidence-emulator/packageFunctionsGoodsEvidence.ts`
(`expectedGeneratedAdapterSource`: GENERATED header + rewrite
`../../src/goodsEvidence/…` → `../…`).

Evidence this session (combined, **packager not executed** — it would write):

1. Both tools and packaged files changed **together** in `520f9f9` (same
   98-line adapter / 500-line `storageQuota` stats).
2. Reconstructing `expectedGeneratedAdapterSource(tools)` equals the
   committed Functions copies (**PACKAGER_PARITY** for both files).
3. `npx --yes tsx tools/goods-evidence-emulator/packaging.unit.test.ts`
   exit **0** — includes byte-equal `g2/storageQuota.ts` and `g2/adapter.ts`
   vs tools.

Packaged adapter starts with the GENERATED header and
`from "../time"`; tools adapter has no GENERATED header and
`from "../../src/goodsEvidence/time"`. That is the packager rewrite, not a
second implementation.

---

## S1 — malformed accounting cannot bypass the cap (SOURCE PASS)

Pre-fix (`b845e8a`): `numField` could yield `NaN`; `< 0` did not reject
`NaN`; counters were charged before hold recount. Helper + real
`adapter.reserve` admitted retained-900 / cap-1000 / new-200 with
`retainedOriginalBytes` undefined / `"900"` / `0.5` / inconsistent `0` →
`ok: true`, charged **1100**.

At `520f9f9`:

- `numField` is **gone**. Bytes and counters require
  `Number.isSafeInteger` and `>= 0` (`isNonNegativeSafeInteger` /
  `isPositiveSafeInteger`). Sums use `addSafeNonNegativeIntegers`.
- `parseStorageAccounting` classifies those four seeds **malformed**.
  Absent document (`undefined`) is still **null** (empty), not malformed.
- `admitStorageReservation` runs `accountingConsistencyError` on any
  existing document **before** adding a hold. Mismatch, unparseable keys
  (including legacy `original:{evidenceId}`), `NaN`, and overflow →
  `{ ok: false, code: "quota_state_invalid" }`.
- Adapter `readAccountingAdmission`: malformed parse → deny
  `quota_state_invalid` **before any** `tx.set`. `reserve` returns that
  deny before writing evidence, object-key, control, or accounting.
- INJECTED proof: four corrupt seeds; `appliedWrites` unchanged; evidence
  path absent; accounting snapshot bytes identical.

Admission does **not** call `repairStorageAccounting` /
`repairAccounting`. Repair remains a separate authorized method that
rebuilds from an explicit inventory. No live migration / backfill of v1
keys.

---

## S2 — hold identity includes durable `ledgerId` (SOURCE PASS)

Pre-fix: `originalHoldKey(evidenceId)` → `original:${evidenceId}`. Same
`evidenceId` on two owned ledgers under one cap collided; occupied-key
short-circuit treated the second reserve as success without charging.

At `520f9f9`:

- Codec: `1.o.{ledgerLen}.{ledgerId}.{evidenceLen}.{evidenceId}` and
  `1.d.{…}.{derivLen}.{derivativeKey}`. Length-prefixed; empty ids
  rejected; `ab`/`c` ≠ `a`/`bc`.
- Example: `originalHoldKey("ledger_s2_a", "ev_shared_s2")` =
  `1.o.11.ledger_s2_a.12.ev_shared_s2`. `parseStorageHoldKey("original:ev_shared_s2")`
  is **null** (legacy keys fail closed).
- Adapter reserve / derivative / retain / release pass
  `{ kind, ledgerId, evidenceId [, derivativeKey] }` into admission.
  Replay succeeds only when the occupied hold’s kind + bytes match; size
  mismatch or occupied key without `replay` → `hold_conflict`, no writes.
- INJECTED: two owned ledgers, shared `evidenceId` → **two** hold keys,
  charged **700**; identical replay charges once; cross-owner isolated;
  concurrent 600+600 / cap 1000 admits exactly one; reject of another item
  does not move the retained hold.

`MAX_STORAGE_HOLDS = 2500` is the documented Firestore document bound, not
a store SKU. Dense tiny files / full derivative fan-out hit it before the
byte cap (`holds_map_at_capacity`). Proposed 1/5/20 GiB remain
**PROPOSED_PENDING_OWNER_CONFIRMATION** — do not advertise.

Unchanged and out of S1/S2 pin scope: `INCLUDE_GRIN_IN_ACCOUNT_PURGE=false`
(P8 still open); `DELETION_GRACE_MS` 15 days; P3 issuance quota not
regressed (INJECTED `quota.injected.unit.test.ts` exit **0** this session).

Observation (not an S1/S2 admission fail): `commitState` skips accounting
write when `retainStorageHold` returns `hold_missing` and still may
transition the evidence object. That is not silent repair of counters.
Team 5 may still inspect it; it does not reopen cap-bypass on corrupt
docs or ledger-colliding hold keys.

---

## Pin recommendation (apply vs hold)

| Action | Decision |
|---|---|
| Record exact artifact | **`520f9f98bc952fd7f30a907da9e85774629a69c0`** |
| Substitute `b845e8a` | **Forbidden** |
| Env-override `GRIN_OPS_PINNED_SHA` / `PINNED_APP_SHA` | **Forbidden** |
| Rewrite helper this session | **Not done** |
| Apply `PINNED_APP_SHA = 520f9f9` now | **HOLD** |
| Why hold | Team 5 independent post-fix review of this SHA is **pending**. Applying the constant is a helper-byte change and would need a fresh 34/34 before anyone cites a tooling successor. Until then keep citing **`228a8f5`**. |
| After Team 5 PASS | Coordinator may apply the one-line patch on a checkout whose `DEPLOYMENT_PATHS` match `520f9f9`, then re-run ops-guard **34/34**. That new helper commit is only then a **candidate** ops-guard successor. Live mode must still reject `GRIN_OPS_PINNED_SHA`. |

`git diff --stat 5d5df3d 520f9f9 -- functions src eas.json app.json app firebase.json`
is **non-empty** (40 files, including `functions/src/goodsEvidence`). Empty
vs `5d5df3d` is **not** the goal.

---

## A1 still independently offerable — YES

A1 scope is unchanged: isolated Firestore Rules only.

```bash
firebase deploy --project vyaamikk-diary --non-interactive \
  --config docs/release/rules-compat/proposed-grin/firebase.rules-only.json \
  --only firestore:rules
```

| Item | sha256 (this worktree; unchanged) |
|---|---|
| Isolated config `firebase.rules-only.json` | `d224b75385b451433e5c59bdbf0cc147697fbe88e773c11dab44f3b71e3e8a74` |
| Proposed merged Firestore `firestore.rules` | `551203b8b11991fc1d49d42aa6a818fedeca8530654f7505de949b62a1ae298b` |

S1/S2 did not change those Rules bytes. A1 is **not** Storage, Functions,
IAM, tester seed, enablement, EAS, or billing. Do not restart A1 from this
review. Do not run the command here.

---

## Commands + exits (this session)

Env: `GRIN_OPS_ALLOW_LIVE` unset, `GRIN_OPS_PINNED_SHA` unset. Combined
left **clean**. Packager **not** run. No live inspect/deploy.

| Command | Tree | Label | Exit |
|---|---|---|---|
| `git -C grin-combined rev-parse HEAD` → `1ca33d613f85ebd8be6e70d5f3a614028979413a` | combined | SOURCE | **0** |
| `git diff --stat 520f9f9 HEAD -- functions src eas.json app.json app firebase.json tools/goods-evidence-storage` empty | combined | SOURCE | **0** |
| `git diff --stat 0cd3473 520f9f9 -- functions/src/goodsEvidence tools/goods-evidence-storage src eas.json app.json app firebase.json` empty | combined | SOURCE | **0** |
| Reconstruct `expectedGeneratedAdapterSource` vs `functions/src/goodsEvidence/g2/{storageQuota,adapter}.ts` | combined | SOURCE packaging | **PACKAGER_PARITY** |
| `npx --yes tsx tools/goods-evidence-storage/storageQuota.unit.test.ts` | combined @ `520f9f9` blobs | PURE_DOMAIN helper | **0** |
| `npx --yes tsx tools/goods-evidence-storage/storageQuota.injected.unit.test.ts` | combined | INJECTED G2 adapter (S1 zero writes, S2 two ledgers) | **0** |
| `npx --yes tsx tools/goods-evidence-emulator/packaging.unit.test.ts` | combined | INJECTED packager parity | **0** |
| `npx --yes tsx tools/goods-evidence-emulator/quota.injected.unit.test.ts` | combined | INJECTED P3 no regression | **0** |
| `unset GRIN_OPS_ALLOW_LIVE GRIN_OPS_PINNED_SHA PINNED_APP_SHA; node --test docs/release/packets/grin-ops/grin-functions-op.test.mjs` | t1-backend helper `228a8f5` | TOOLING | **0** — `# tests 34` `# pass 34` `# fail 0` |
| Firestore/Storage emulator S1/S2 | — | FIRESTORE_EMULATOR | **NOT RUN** this session (coordinator recorded PASS at fold; Team 1 used helper + injected adapter) |
| Canonical GitHub Actions `ci:verify` on `520f9f9` | — | SOURCE CI | **NOT YET** |
| Live Rules / Functions / IAM / env | — | LIVE_BACKEND | **NOT RUN** (forbidden) |

---

## HOLDs

1. **Apply Functions pin** — HOLD until Team 5 post-fix PASS at `520f9f9`.
2. **A3 gate-off-initial** — HOLD; uses helper constant, not env override.
3. **Ops-guard successor SHA** — none. Keep `228a8f5`.
4. **Advertising 1/5/20 GiB** — HOLD (Team 2 economics).
5. **P8 / `INCLUDE_GRIN_IN_ACCOUNT_PURGE`** — stays false.
6. **Canonical CI / device / billing / public release** — not this review.
