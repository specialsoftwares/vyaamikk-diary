# Approval A1 packet refresh — isolated Firestore Rules only

**Not authorization.** This file does not set `GRIN_OPS_ALLOW_LIVE`. Do not
deploy from this packet. Approval of A1 would not approve A2–A7.

Scope of this offer: **Firestore Rules only**. Not Storage, not Functions,
not IAM, not tester admission, not enablement, not EAS, not billing, not
`main` merge.

Worktree: `/Users/shivamsaurav/vyd-worktrees/grin-t1-backend`  
Branch: `team/grin-t1-backend` (do **not** pull `origin/team/grin-t1-backend`)  
HEAD this packet: record after commit. Starting checkout:
`e981587b77e8598cd6ea99286f71a5afe18db08e`.

`GRIN_OPS_ALLOW_LIVE` was **unset**. `GRIN_OPS_PINNED_SHA` was **unset**.
`GRIN_OPS_EXPORT_DIR` was **unset** (inspect did not write). gcloud is
**ABSENT**. Mixed-state planner remains **unwired**. firebase-tools
**14.20.0**.

---

## Pins (honest)

| Pin | Value | Status |
|---|---|---|
| Ops-guard / helper bytes | `228a8f58ac83d3c71e853cdccb6e4c4fa64c251f` | **KEEP.** `git diff 228a8f58 -- docs/release/packets/grin-ops/grin-functions-op.mjs docs/release/packets/grin-ops/grin-functions-op.test.mjs` is **empty**. Suite **34/34** this session (`node --test docs/release/packets/grin-ops/grin-functions-op.test.mjs`). No successor tooling SHA. |
| Helper `PINNED_APP_SHA` | `5d5df3d54df08953bfb26db39a9b7f5e3d67ed47` | **STALE** vs application `b845e8a30262b9e8740fa53b55e9a0f237caea0b`. `git diff --stat 5d5df3d -- functions src eas.json app.json app firebase.json` is **non-empty** (includes `functions/src/goodsEvidence`). Do **not** bypass with `GRIN_OPS_PINNED_SHA` / fixtures / HTTP stubs. Live mode already rejects those overrides. |
| Application this tree | `b845e8a30262b9e8740fa53b55e9a0f237caea0b` | Team 2 quota/storage/lifecycle. `git diff b845e8a HEAD -- functions/src/goodsEvidence` **empty**. **Pre-S1/S2.** Do **not** pin this SHA for A3. |
| Repo-root quota Firestore | `233b05b7b810b484171257f4dafe78fd0fdea5762ed6848cf8b49cd327fd58cc` | **Never** `firebase deploy` from repo `firebase.json`. |

**A1 does not execute the Functions helper.** Isolated Rules deploy uses
firebase CLI `--config` / `--only firestore:rules` only. Stale
`PINNED_APP_SHA` does **not** block offering A1.

**A3 (`gate-off-initial`) must wait** for a **reviewed** helper pin update
**after** S1/S2 storage corrections land. Proposed (unapplied) patch:
`docs/release/proposals/team1/PIN_UPDATE_AFTER_S1_S2.diff.md`. Do **not**
rewrite `grin-functions-op.mjs` this session. Do **not** pin `b845e8a`.

### `REVIEW_AFTER_S1_S2`

S1/S2 corrected application artifact is **not** in this worktree. This
checkout still has:

- S1: `numField` can yield `NaN`; `parseStorageAccounting` rejects
  counters `< 0` but not `NaN`; `admitStorageReservation` can still admit
  past the cap on corrupt counters.
- S2: `originalHoldKey(evidenceId)` → `original:${evidenceId}` (no
  `ledgerId`).

Coordinator constraint:
`docs/release/proposals/coordinator/S1_S2_STORAGE_CONSTRAINT.md`. Re-review
the corrected SHA before any Functions pin update. A1 Rules bytes do not
depend on that SHA.

---

## Fresh read-only inspect (2026-10-06 this session)

```text
node docs/release/packets/grin-ops/grin-functions-op.mjs inspect
```

No mutate. No `GRIN_OPS_EXPORT_DIR`. Live-export directory **not**
overwritten (live sha256 still equals committed rollback bytes).

| Check | Result |
|---|---|
| CLI user | `support.vyd@specialsoftwares.com` |
| Project | `vyaamikk-diary` / `982505811909` HTTP **200** `match=true` |
| Bucket | `vyaamikk-diary.firebasestorage.app` belongs HTTP **200** |
| Inventory | HTTP **200**, `complete=true`, `reason=ok`, `pages=1` |
| GRIN seven | **ABSENT** (`grin_all_absent=true`) |
| Unrelated asia-south1 | **39** |
| Runtime SA | `982505811909-compute@developer.gserviceaccount.com` `roles/editor` |
| Firestore DB IAM | HTTP **501** unsupported |
| Live Firestore sha256 | `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` **= baseline** |
| Live Firestore ruleset | `projects/vyaamikk-diary/rulesets/a19b4a83-8b3e-4cf5-b8b8-e8d26e9704f9` (IDs are not the rollback target) |
| Live Storage sha256 | `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5` **= baseline** (A1 does not change Storage) |

If a future inspect’s Firestore sha256 **differs** from
`b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c`, **abort**.
Do not apply the merged file from this packet. Re-export; re-merge; do not
overwrite `live-export-2026-10-06/` unless the new bytes are an approved
new baseline.

---

## Exact isolated apply (owner-approved later; **not run**)

Working directory: **repository root**. firebase-tools **14.20.0**.
`--config` paths resolve from `dirname(--config)` (firebase-tools 14.20.0),
so this JSON loads
`docs/release/rules-compat/proposed-grin/firestore.rules`, **not** repo-root
quota Rules.

```bash
firebase deploy --project vyaamikk-diary --non-interactive \
  --config docs/release/rules-compat/proposed-grin/firebase.rules-only.json \
  --only firestore:rules
```

| Item | sha256 |
|---|---|
| Isolated config `docs/release/rules-compat/proposed-grin/firebase.rules-only.json` (105 bytes) | `d224b75385b451433e5c59bdbf0cc147697fbe88e773c11dab44f3b71e3e8a74` |
| Proposed merged Firestore `docs/release/rules-compat/proposed-grin/firestore.rules` (17346 bytes) | `551203b8b11991fc1d49d42aa6a818fedeca8530654f7505de949b62a1ae298b` |
| Live baseline / rollback Firestore `docs/release/rules-compat/live-export-2026-10-06/firestore.rules` (15313 bytes) | `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` |
| **Forbidden** repo-root `firestore.rules` | `233b05b7b810b484171257f4dafe78fd0fdea5762ed6848cf8b49cd327fd58cc` |

Never:

- `firebase deploy` without this `--config` (repo-root quota `233b05b7…`)
- `--only firestore` (includes indexes)
- `--only storage` / `--only firestore:rules,storage` (that is A2)
- `--only functions` or any `functions:grin*`
- IAM writes, tester seed, `GRIN_OPS_ALLOW_LIVE=1`

Merged matchers keep GRIN **client create/update/delete `false`**. Admin SDK
/ Functions remain the writers. A1 does not make client GRIN writes live.

---

## Apply-time verification (after a later owner grant; **not run**)

1. Confirm `GRIN_OPS_ALLOW_LIVE` still unset for this Rules-only path (Rules
   apply is firebase CLI, not the Functions helper).
2. `firebase --version` is **14.20.0**. Cwd is repo root.
3. Re-run read-only `inspect` **without** `GRIN_OPS_EXPORT_DIR`. Live
   Firestore sha256 must still equal
   `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c`. If it
   matches, **do not** overwrite
   `docs/release/rules-compat/live-export-2026-10-06/`.
4. Confirm isolated config and merged source hashes still equal the table
   above (`shasum -a 256`).
5. Run the exact `--config` / `--only firestore:rules` command.
6. Re-inspect (still no export overwrite unless hashes will be recorded as
   a new approved live). Live Firestore sha256 **must** equal
   `551203b8b11991fc1d49d42aa6a818fedeca8530654f7505de949b62a1ae298b`.
   Release name must remain `cloud.firestore`. Storage sha256 must still
   equal `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5`.
   GRIN seven must still be **ABSENT**. Unrelated count must still be 39.
7. If live sha256 ≠ merged hash, **stop**. Roll forward (below). Do not
   retry from repo-root `firebase.json`.

---

## Rollback bytes (data-preserving)

Path:
`docs/release/rules-compat/live-export-2026-10-06/firestore.rules`  
sha256 `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c`.

Roll **forward** to those bytes via an isolated config whose
`dirname(--config)` is that directory and whose `firestore.rules` is that
file (same JSON shape as `firebase.rules-only.json`). Example, only after
copying the **config JSON** into that directory **without** replacing
`firestore.rules` / `storage.rules` / `META.json`:

```bash
firebase deploy --project vyaamikk-diary --non-interactive \
  --config docs/release/rules-compat/live-export-2026-10-06/firebase.rules-only.json \
  --only firestore:rules
```

Do **not** add that JSON this session. Do **not** delete receipts, serials,
or Storage objects. Do **not** use Editor delete. Ruleset IDs in `META.json`
are identifiers, not the rollback bytes.

---

## Still HOLD (not this packet)

| Item | State |
|---|---|
| A2 Storage Rules | HOLD. Merged Storage `6b8959929b86ac2eab41fc591dc1fbf5bb03b80a226226d43bf4c8e72391c76b`. |
| A3 seven-function create, gate off | HOLD. Pin `5d5df3d` is **STALE**. Wait for reviewed pin **after S1/S2**. |
| Mixed-state `create-absent-only` | Planner exists (`grin-functions-absent-only.mjs`); **not wired** into `grin-functions-op.mjs`. Do not blindly retry all-seven create. |
| A6 enable / disable | gcloud `--update-env-vars` without `--source` on a firebase-created gen2 callable remains **UNPROVEN**. gcloud **ABSENT** here. Firebase dotenv remains **blocked**. |
| A4 tester seed / A5 IAM / A7 smoke | HOLD. Do not alter shared Editor. |
| `GRIN_OPS_ALLOW_LIVE=1` | **unset** / HOLD |

---

**Owner grant requested later:** A1 only, using the exact command and hashes
in this file, after a fresh inspect that still matches the live baseline.
