# A1 present — isolated Firestore Rules (not executed)

**Not authorization.** This file does not set `GRIN_OPS_ALLOW_LIVE`. Do not
deploy from this packet. Do not execute A1 from this session.

A1 changes Firestore access rules only. It does not deploy Functions, change Storage Rules/IAM, seed testers, enable GRIN, build the app, enable payments, or submit to Play.

Approval of A1 does **not** approve A2–A7. Those scopes are in
`docs/release/proposals/team1/A2_A7_REMAINING.md`.

This is a **presentation** of the existing isolated Rules packet
(`A1_PACKET_REFRESH.md`), with hashes and pin/CI facts re-verified on
combined. It is **not** a restart of A1 and **not** a live inspect.

---

## Coordinates

| Item | Value |
|---|---|
| Team 1 worktree | `/Users/shivamsaurav/vyd-worktrees/grin-t1-backend` |
| Combined (read-only) | `/Users/shivamsaurav/vyd-worktrees/grin-combined` `aea65c170adb25f09ca1045593f18847df2f3b30` (docs freeze) |
| Application SHA | `520f9f98bc952fd7f30a907da9e85774629a69c0` |
| Published CI head / tooling successor | `0d7aa17a6efcf3ce6874269eb57afda0a2b45559` |
| GHA | run **`37425360211`** job **`112143748428`** success (coordinator-recorded; not re-fetched here) |
| Helper `PINNED_APP_SHA` at `0d7aa17` | `520f9f98bc952fd7f30a907da9e85774629a69c0` |
| Historical ops-guard baseline | `228a8f58ac83d3c71e853cdccb6e4c4fa64c251f` — **34/34** (pin was `5d5df3d`). Keep citing as history. **Not** byte-identical to `0d7aa17` (one-line pin constant). |
| Tooling successor 34/34 this session | combined helper at `0d7aa17` / `aea65c1` — **34/34**, exit **0** |
| `GRIN_OPS_ALLOW_LIVE` | **unset** |
| firebase-tools | **14.20.0** (`firebase --version` on combined host) |

`git diff --stat 520f9f9 aea65c1 -- functions src eas.json app.json app firebase.json` is **empty**.
A1 Rules blobs at `520f9f9`, `0d7aa17`, and `aea65c1` are **identical**.
A1 does **not** run the Functions helper. This Team 1 worktree helper is
still `5d5df3d` and was **not** rewritten here.

---

## Re-verified hashes (combined `aea65c1`, `shasum -a 256` / SHA-256)

| Artifact | Bytes | sha256 |
|---|---|---|
| Isolated config `docs/release/rules-compat/proposed-grin/firebase.rules-only.json` | 105 | `d224b75385b451433e5c59bdbf0cc147697fbe88e773c11dab44f3b71e3e8a74` |
| Proposed merged Firestore `docs/release/rules-compat/proposed-grin/firestore.rules` | 17346 | `551203b8b11991fc1d49d42aa6a818fedeca8530654f7505de949b62a1ae298b` |
| Live baseline / rollback Firestore `docs/release/rules-compat/live-export-2026-10-06/firestore.rules` | 15313 | `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` |
| **Forbidden** repo-root `firestore.rules` | 38494 | `233b05b7b810b484171257f4dafe78fd0fdea5762ed6848cf8b49cd327fd58cc` |

Isolated JSON keys: `firestore`, `storage` only — **no** `functions`.
`--config` paths resolve from `dirname(--config)` (firebase-tools 14.20.0),
so this JSON loads `proposed-grin/firestore.rules`, **not** repo-root quota
Rules.

**Never** `firebase deploy` from repo-root `firebase.json` (that file also
has `functions` + `indexes`; repo-root Firestore is quota `233b05b7…`).

Last read-only live inspect (2026-10-06, not re-run this session): live
Firestore sha256 **=** `b13d5255…` baseline; Storage `1a912051…` baseline;
GRIN seven **ABSENT**; unrelated asia-south1 **39**. If a future inspect’s
Firestore sha256 **differs** from `b13d5255…`, **abort** — do not apply
this merged file.

---

## Exact Rules delta (A1 vs live baseline)

`git diff --no-index` live-export `firestore.rules` → proposed-grin
`firestore.rules`: **55 insertions, 0 deletions**.

Live billing-off matchers (`_saveLocks` missing-doc owner read;
`subscription/status` and `usageCurrent` owner read / client write false)
are **unchanged**. A1 only **adds** nested matchers under
`match /users/{uid}`:

| Path | Client |
|---|---|
| `goodsEvidenceAdmission/{docId}` | owner **read**; create/update/delete **false** |
| `goodsEvidenceUploadControl/{docId}` | read/write **false** |
| `grinEvidenceObjectKeys/{objectKey}` | active-user **read**; CUD **false** |
| `grinEvidenceDerivativeKeys/{derivativeKey}` | active-user **read**; CUD **false** |
| `goodsEvidenceLedgers/{ledgerId}` and nested `commands`, `serials`, `evidenceObjects`, `receipts`, `events`, `evidenceLinks`, `evidenceControl` | active-user **read**; CUD **false** |

Admin SDK / Functions remain the writers. A1 does **not** make client GRIN
writes live. `users/{uid}/goodsEvidenceStorage/accounting` is **not** in
this additive set (client default-deny; Admin still writes). That is not an
A1 Storage or Functions change.

Storage Rules are **not** in this delta (A2: +177 lines, hash
`6b895992…`). Indexes are **not** in this command (`--only firestore:rules`,
not `--only firestore`).

---

## Exact later apply (owner grant; **not run**)

Working directory: **repository root**. firebase-tools **14.20.0**.

```bash
firebase deploy --project vyaamikk-diary --non-interactive \
  --config docs/release/rules-compat/proposed-grin/firebase.rules-only.json \
  --only firestore:rules
```

Never:

- `firebase deploy` without this `--config`
- `--only firestore` (includes indexes)
- `--only storage` / `--only firestore:rules,storage` (that is **A2**)
- `--only functions` or any `functions:grin*`
- IAM writes, tester seed, `GRIN_OPS_ALLOW_LIVE=1`

---

## Post-deploy verification (after a later owner grant; **not run**)

1. `GRIN_OPS_ALLOW_LIVE` still unset for this Rules-only path (firebase CLI,
   not the Functions helper).
2. `firebase --version` is **14.20.0**. Cwd is repo root.
3. Before apply: read-only inspect **without** `GRIN_OPS_EXPORT_DIR`. Live
   Firestore sha256 must still equal `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c`.
   If it matches, **do not** overwrite `live-export-2026-10-06/`.
4. Confirm isolated config and merged source hashes still equal the table
   (`shasum -a 256`).
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

## Rollback (data-preserving)

Path:
`docs/release/rules-compat/live-export-2026-10-06/firestore.rules`  
sha256 `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c`.

That directory has `firestore.rules`, `storage.rules`, and `META.json`. It
does **not** currently contain `firebase.rules-only.json`. At rollback time,
copy the **same 105-byte JSON** into that directory **without** replacing
`firestore.rules` / `storage.rules` / `META.json`. `dirname(--config)` then
loads the rollback Firestore bytes.

```bash
cp docs/release/rules-compat/proposed-grin/firebase.rules-only.json \
  docs/release/rules-compat/live-export-2026-10-06/firebase.rules-only.json
firebase deploy --project vyaamikk-diary --non-interactive \
  --config docs/release/rules-compat/live-export-2026-10-06/firebase.rules-only.json \
  --only firestore:rules
```

Do **not** add that JSON in this session. Do **not** delete receipts,
serials, or Storage objects. Do **not** use Editor delete. Ruleset IDs in
`META.json` are identifiers, not the rollback bytes. After rollback, live
Firestore sha256 must equal `b13d5255…` again. Storage must remain
`1a912051…`.

---

## Owner grant requested

**A1 only**, using the exact command and hashes in this file, after a fresh
inspect that still matches the live baseline. A2–A7 stay HOLD until each is
granted on its own packet.
