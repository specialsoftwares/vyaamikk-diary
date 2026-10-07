# A2–A7 remaining backend packets — concrete scopes (not implied by A1)

**Not authorization.** Approval of A1 does **not** approve any row below.
Do not set `GRIN_OPS_ALLOW_LIVE=1` from this file. Do not deploy from this
file. Failed Functions inventory (HTTP 401/403/500, malformed JSON,
incomplete pagination) is **UNKNOWN**, not ABSENT, and **must not deploy**.
Live mode rejects `GRIN_OPS_PINNED_SHA`, endpoint fixtures, HTTP stubs, and
`GRIN_OPS_TEST_HANG`.

A1 changes Firestore access rules only. It does not deploy Functions, change Storage Rules/IAM, seed testers, enable GRIN, build the app, enable payments, or submit to Play.

A1 presentation remains `docs/release/proposals/team1/A1_PRESENT.md` at team
`80da828`. This file does **not** restart or substitute that packet.

---

## Coordinates (this refresh; A1 hashes re-verified, no live inspect)

| Item | Value |
|---|---|
| Team 1 worktree | `/Users/shivamsaurav/vyd-worktrees/grin-t1-backend` |
| Combined (read-only) | `/Users/shivamsaurav/vyd-worktrees/grin-combined` `28182c2ee8cf4767d3c316f4cc6b337b4bfa240a` |
| Current application | `56f2040e30159579edc0cbfbc88e2ba706a6abd2` (T2 capacity/cleanup on `520f9f9`) |
| Tooling successor | `0d7aa17a6efcf3ce6874269eb57afda0a2b45559` |
| Helper `PINNED_APP_SHA` at `0d7aa17` / `28182c2` | `520f9f98bc952fd7f30a907da9e85774629a69c0` — **STALE vs `56f2040`**. Proposed only: `PIN_UPDATE_AFTER_56f2040.diff.md`. |
| Historical ops-guard | `228a8f58ac83d3c71e853cdccb6e4c4fa64c251f` — **34/34**. **Not** byte-identical to `0d7aa17`. |
| Canonical CI | GHA **`37425360211`** covers `0d7aa17` / `520f9f9` **only**, **not** `56f2040` |
| Combined helper suite this session | **34/34** exit **0** on `28182c2` (constant still `520f9f9`). Includes UNKNOWN inventory + live override rejections. |
| `GRIN_OPS_ALLOW_LIVE` / `GRIN_OPS_PINNED_SHA` / `GRIN_OPS_EXPORT_DIR` | **unset** |
| firebase-tools | **14.20.0** |
| This Team 1 worktree helper | still `5d5df3d` — **not rewritten** |
| This Team 1 worktree vs `56f2040` DEPLOYMENT_PATHS | **non-empty** — **not** an A3 apply host |

A1 Rules blobs at `520f9f9`, `0d7aa17`, `56f2040`, `aea65c1`, and `28182c2`
are **identical** (`shasum -a 256` on combined). Isolated JSON keys remain
`firestore`, `storage` only — **no** `functions`.

Last read-only live inspect (2026-10-06, **not re-run** this session): live
Firestore sha256 **=** `b13d5255…`; Storage **=** `1a912051…`; GRIN seven
**ABSENT**; unrelated asia-south1 **39**. If a future inspect’s hashes
differ, **abort** the matching packet — do not apply these merged files.

---

## A2 — Isolated Storage Rules — HOLD (concrete, not A1)

A1 `--only firestore:rules` never publishes Storage. A2 is a **separate**
command on the **same** isolated JSON. Never
`--only storage,firestore:rules` as a single “A1” grant.

```bash
firebase deploy --project vyaamikk-diary --non-interactive \
  --config docs/release/rules-compat/proposed-grin/firebase.rules-only.json \
  --only storage
```

Working directory: **repository root**. firebase-tools **14.20.0**.
`--config` paths resolve from `dirname(--config)`, so this JSON loads
`proposed-grin/storage.rules`, **not** repo-root Storage.

| Artifact | Bytes | sha256 |
|---|---|---|
| Isolated config (same as A1) | 105 | `d224b75385b451433e5c59bdbf0cc147697fbe88e773c11dab44f3b71e3e8a74` |
| Proposed merged Storage `proposed-grin/storage.rules` | 7942 | `6b8959929b86ac2eab41fc591dc1fbf5bb03b80a226226d43bf4c8e72391c76b` |
| Live baseline / rollback Storage `live-export-2026-10-06/storage.rules` | 1133 | `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5` |
| Forbidden repo-root `storage.rules` | 1390 | `19fcc761dc8d5a923efb45ed589a598690bd3bb2159fab827f3ce30c17a60452` |

Delta vs live: **+177 lines**. Existing letterhead / attachments / pdfs
matchers stay. Additive GRIN object paths:

- `users/{userId}/grinEvidence/{objectKey}/original`
- `users/{userId}/grinEvidence/{objectKey}/derivatives/{derivativeKey}`

Upload create is admission- and reservation-bound; update/delete **false**.
A2 does **not** write IAM, Functions, tester docs, or the GRIN gate.

### A2 apply-time (owner grant later; **not run**)

1. `GRIN_OPS_ALLOW_LIVE` still unset (firebase CLI, not the Functions helper).
2. `firebase --version` is **14.20.0**. Cwd is repo root.
3. Read-only inspect **without** `GRIN_OPS_EXPORT_DIR`. Live Storage sha256
   must still equal `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5`.
   If it differs, **abort**. Do not overwrite `live-export-2026-10-06/`.
4. Confirm isolated config + merged Storage hashes still equal the table.
5. Run the exact `--config` / `--only storage` command above.
6. Re-inspect. Live Storage sha256 **must** equal `6b895992…`. Firestore must
   remain whatever A1 did or did not publish (`b13d5255…` or `551203b8…`).
   Release name for Storage must remain
   `firebase.storage/vyaamikk-diary.firebasestorage.app`. GRIN seven still
   **ABSENT**. Unrelated count still 39.
7. If live Storage sha256 ≠ `6b895992…`, **stop**. Roll forward (below). Do
   not retry from repo-root `firebase.json`.

### A2 rollback (data-preserving; concrete command)

That directory has `firestore.rules`, `storage.rules`, and `META.json`. It
does **not** currently contain `firebase.rules-only.json`. At rollback time,
copy the **same 105-byte JSON** into that directory **without** replacing
`firestore.rules` / `storage.rules` / `META.json`. `dirname(--config)` then
loads the rollback Storage bytes.

```bash
cp docs/release/rules-compat/proposed-grin/firebase.rules-only.json \
  docs/release/rules-compat/live-export-2026-10-06/firebase.rules-only.json
firebase deploy --project vyaamikk-diary --non-interactive \
  --config docs/release/rules-compat/live-export-2026-10-06/firebase.rules-only.json \
  --only storage
```

Do **not** add that JSON in this session. Do **not** delete receipts,
serials, or Storage objects. Do **not** use Editor delete. After rollback,
live Storage sha256 must equal `1a912051…` again. Firestore must remain
whatever it was (`b13d5255…` or `551203b8…`).

---

## A3 — Seven-function create, gate off — HOLD (concrete, not A1)

**Pin is stale.** A3 must not run until
`PIN_UPDATE_AFTER_56f2040.diff.md` is applied by the coordinator **and**
Team 5 has independently reviewed `56f2040`. Canonical CI `37425360211`
does **not** cover `56f2040`. Do not infer A3 readiness from A1 or from
the historical `228a8f5` 34/34.

| Pin item | Required for A3 |
|---|---|
| Application | `56f2040e30159579edc0cbfbc88e2ba706a6abd2` |
| Helper constant | **after** the proposed one-line pin update |
| Apply-host check | `git diff --quiet 56f2040 -- functions src eas.json app.json app firebase.json` empty (combined `28182c2` **does**; this Team 1 worktree **does not**) |
| firebase-tools | **14.20.0** |
| CLI dotenv | **none** |
| `GRIN_OPS_PINNED_SHA` | **unset** (live mode rejects it) |

Exact later command (not run):

```bash
GRIN_OPS_ALLOW_LIVE=1 node docs/release/packets/grin-ops/grin-functions-op.mjs gate-off-initial
```

`--only` is exactly:

```text
functions:grinRegisterGoodsReceipt,functions:grinReconcileCommand,functions:grinMutateGoodsReceipt,functions:grinReadGoodsReceipt,functions:grinReserveEvidence,functions:grinBeginEvidenceUpload,functions:grinUploadEvidence
```

Region `asia-south1`, codebase `default`, project `vyaamikk-diary`. Gate key
**absent** on create ⇒ `grinFunctionsEnabled` false (exact `"true"` is on;
`"false"` / missing / `"1"` / `"TRUE"` are off).

Preconditions from inspect (complete inventory required; **not re-run** here):

- Project `vyaamikk-diary` / `982505811909` match
- Bucket `vyaamikk-diary.firebasestorage.app` belongs
- All seven **ABSENT**. Any **UNKNOWN** or **PRESENT** refuses create.
- Unrelated asia-south1 count stays out of `--only` (39 on last inspect)
- `assertPinnedSource` + clean DEPLOYMENT_PATHS + no CLI dotenv

Do **not** blindly retry all-seven create after a mixed result.
`create-absent-only` planner exists
(`docs/release/proposals/team1/grin-functions-absent-only.mjs`) and is
**not wired**. UNKNOWN blocks that planner too.

A3 does not change Rules, IAM, testers, or enable the gate.

### A3 post-create verification (after a later owner grant; **not run**)

Re-inspect without `GRIN_OPS_EXPORT_DIR`. Require:

- all seven **PRESENT**
- each `gate=off` (gate key not exact `"true"`)
- unrelated ids still the same 39
- runtime SA still the default Compute SA unless A5 already bound a new one
  (A5 is **after** A3 and is not implied)
- secret binding **count** recorded, values never printed

### A3 rollback (concrete scope; no delete command in the helper)

| Situation | In-scope rollback | Forbidden |
|---|---|---|
| Create succeeded; enable not yet done | Leave the seven PRESENT with gate off. Callables exist and deny. That **is** A3 success. | Delete the seven; delete serials/receipts/originals; Editor delete |
| firebase seven-deploy fails; inspect mixed PRESENT/ABSENT | `inspect` until complete. Record each name PRESENT / ABSENT / UNKNOWN. Stop. Current helper is **stuck** (`gate-off-initial` refuses PRESENT; enable/disable refuse unless all seven PRESENT). | Blind all-seven retry; treat UNKNOWN as ABSENT; `create-absent-only` (unwired); env-override pin |
| Inspect UNKNOWN (401/403/500/malformed/incomplete pages) | UNKNOWN, not ABSENT. Do not deploy. Re-inspect until complete. | Infer absence from a failed list |
| Owner later wants the created functions removed | **Separate packet.** Helper has **no** `functions:delete`. Named-list delete is not A3 and is not granted by A1. | Console/Editor delete; deleting receipts/serials/objects as “cleanup” |

Do not delete serials/receipts/originals (none should exist yet at first
create). Mixed-state resume remains a later bounded approval, not this packet.

---

## A4 — Tester admission writes — HOLD (concrete write/rollback; UIDs not supplied)

A1 only allows **owner read** of `goodsEvidenceAdmission`; client
create/update/delete stay **false**. Seeding testers is an **Admin SDK /
console write**, not a Rules deploy. Not Play licence testers. Not
`PLAY_BILLING_TESTER_UIDS`. Not Internal-track membership.

**Remaining gap:** owner has not named Firebase Auth UIDs. Team 1 will not
invent them. A4 cannot execute until that list exists.

Exact write, per owner-named uid only:

Path: `users/{uid}/goodsEvidenceAdmission/runtime`

```json
{ "schemaVersion": 1, "newCommands": "allow", "reconciliation": "allow" }
```

Everyone else omit or deny. Wipe warning while public retention is unset.
Synthetic evidence only.

Rollback (per named uid; data-preserving):

```json
{ "schemaVersion": 1, "newCommands": "deny", "reconciliation": "deny" }
```

Do not Editor-delete the document to “roll back” if receipts may already
exist; deny-write is the scoped rollback. Do not Editor-delete receipts.

---

## A5 — IAM / runtime identity — HOLD (concrete proposal; apply commands not verified live)

Do **not** alter
`982505811909-compute@developer.gserviceaccount.com` (`roles/editor` today).
A1 does not touch IAM. Shared Editor remains on identity / email / deletion /
billing.

Proposal (still unapplied):
`docs/release/proposals/unapplied/GRIN_RUNTIME_IDENTITY_PROPOSAL.md` and
`docs/release/proposals/unapplied/IAM_PERMISSION_MATRIX.md`.

| Item | Concrete later scope |
|---|---|
| New SA | `grin-functions@vyaamikk-diary.iam.gserviceaccount.com` (**name TBD on apply** — remaining gap) |
| Bind | The seven GRIN gen2 functions only, **after they exist** (A5 after A3) |
| Firestore | `roles/datastore.user` on `(default)` — residual: Admin can still read/write any doc in that database. No document-path cage exists. |
| Storage | `roles/storage.objectViewer` on `vyaamikk-diary.firebasestorage.app` with a GCS condition on `users/*/grinEvidence/` **if** the condition reads back on apply. **No** `storage.objects.delete` / objectAdmin. |
| Invoker | Firebase callable default; do not add App Check only on GRIN while identity callables lack it |

**Remaining gap:** live GCS condition string has **not** been read back on
this project (prior packet: verify-on-apply, not already configured). Do not
infer a prefix cage from emulator Storage Rules.

Rollback: leave the shared Editor unchanged throughout. If the new SA fails,
GRIN functions stay gated off; identity functions keep Editor. Do not
tighten the shared Editor as an A5 rollback.

Least-privilege is for **public** GRIN, not implied by A1.

---

## A6 — Enable / disable gate — HOLD (concrete argv; gcloud preservation UNPROVEN)

Requires **all seven PRESENT** (after A3). Firebase dotenv enable/disable is
**blocked** (firebase-tools 14.20.0 `inferDetailsFromExisting` replaces user
env when any CLI dotenv is loaded). Direct Cloud Run env edit is forbidden.
Origin `local` refuses (cwd upload). `--source` / `--set-env-vars` /
`--clear-env-vars` are rejected by `gcloudArgsUnsafe`.

Documented later method (helper `enable` / `disable`; **not run**):

```text
gcloud functions deploy NAME --gen2 --region=asia-south1 \
  --project=vyaamikk-diary \
  --update-env-vars=GRIN_GOODS_EVIDENCE_FUNCTIONS=true|false
```

**without** `--source`, only after inspect shows origin `gcs` or `repo`.
Sequential over exactly:

1. `grinRegisterGoodsReceipt`
2. `grinReconcileCommand`
3. `grinMutateGoodsReceipt`
4. `grinReadGoodsReceipt`
5. `grinReserveEvidence`
6. `grinBeginEvidenceUpload`
7. `grinUploadEvidence`

`gcloud` omitted-`--source` preservation on a **firebase-created** gen2
callable remains **UNPROVEN**. Do not enable live GRIN to obtain that
evidence. Scratch/non-prod function created the same way remains the
required evidence. Helper `enable`/`disable` do **not** pin `gcloud`
version; apply host must record `gcloud version` separately.

Live helper still rejects pin/fixture/HTTP stubs.

### A6 mid-loop / rollback (concrete)

The helper loop updates names one-by-one. First non-zero status throws.
Already-updated names **stay** updated. Temp session journal is **deleted**
in `finally` — record by inspect, not by assuming PASS.

| Situation | In-scope action | Forbidden |
|---|---|---|
| Enable succeeded | Later `disable` (gate `false`) — surface A | `--clear-env-vars`; firebase dotenv; object delete |
| Mid-loop gcloud failure | Inspect. `disable` names that are PRESENT **and** `gate=on`. Do not claim PASS. | Re-run full `gate-off-initial`; assume remaining names updated |
| Disable | Same argv with `=false`. Does **not** cancel in-flight calls. Does **not** stop Storage PUT of an already-reserved original while A4 admission is still allow. | Treating disable as data delete |

A6 does not deploy Rules, IAM, or testers.

**Remaining gap:** no reviewed scratch-function evidence that omitted
`--source` preserves source archive, secrets, ingress, runtime SA, and other
user keys on a firebase-created gen2 callable.

---

## A7 — Synthetic smoke — HOLD (concrete sequence; no LIVE_BACKEND harness)

**LIVE_BACKEND**, only after A3 + A4 + A6. Not an emulator substitute.
EMULATOR/INJECTED coverage in `AUTH_ADMISSION_COVERAGE.md` is **not** A7.

Named callables (same seven):

`grinRegisterGoodsReceipt` → `grinReserveEvidence` →
`grinBeginEvidenceUpload` + client PUT of the reserved original → stored-byte
verify (`grinUploadEvidence` confirmation) → `grinReadGoodsReceipt` reopen →
`grinMutateGoodsReceipt` amend/QC/return → pack summary (client; originals
not bundled). Interruption/retry. Original receipt/serial integrity.
`grinReconcileCommand` on the same owner/admission.

Callable disable ≠ Storage-upload disable ≠ retained data. In-flight calls
are **not** cancelled by disable. A1 Rules-only grant does **not** make
this runnable (Functions still ABSENT).

**Remaining gap:** no reviewed LIVE_BACKEND script, fixture ledger ids, or
named tester uids. A7 cannot be executed until A3, owner-named A4 uids, and
A6 exist. Do not invent those.

---

## Remaining gaps still missing a concrete executable scope

These are **named HOLDs**, not inferences from A1:

| Packet | Still missing before execute |
|---|---|
| A2 | Nothing in command/hashes/rollback. Waiting owner grant + fresh inspect matching Storage baseline. |
| A3 | Coordinator pin-update to `56f2040`; Team 5 review of `56f2040`; CI covering `56f2040` (not `37425360211`); owner grant. Mixed-state resume **and** named-list function delete are **separate later packets** (planner unwired; helper has no delete). |
| A4 | Owner-named Firebase Auth UIDs. Write/rollback JSON is scoped; identities are not. |
| A5 | Final SA id on apply; live read-back of the GCS prefix condition. Role residuals are documented. |
| A6 | Scratch/non-prod proof that gcloud omitted-`--source` preserves firebase-created gen2 source/secrets/ingress/SA/other keys. `gcloud` version pin on apply host. |
| A7 | LIVE_BACKEND harness + A4 identities + A3/A6 in place. |

---

## Status snapshot

| Packet | Status | Implied by A1? |
|---|---|---|
| A1 Firestore Rules | **Presented — waiting owner grant** (`80da828`; hashes still match on `28182c2`) | — |
| A2 Storage Rules | **HOLD** — command, hashes, rollback scoped | **No** |
| A3 Functions create, gate off | **HOLD** — pin **STALE** (`520f9f9` at helper `0d7aa17`); require `56f2040` after proposed pin-update | **No** |
| A4 Tester admission | **HOLD** — Admin write/rollback scoped; **identities not supplied** | **No** |
| A5 IAM | **HOLD** — proposal only; do not alter shared Editor; SA name / GCS condition verify still apply-time | **No** |
| A6 Enable/disable | **HOLD** — argv scoped; gcloud preservation **UNPROVEN**; dotenv blocked | **No** |
| A7 Smoke | **HOLD** — needs A3+A4+A6; no LIVE_BACKEND harness | **No** |
