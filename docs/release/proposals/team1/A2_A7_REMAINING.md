# A2–A7 remaining backend packets — concrete scopes (not implied by A1)

**Not authorization.** Approval of A1 does **not** approve any row below.
Do not set `GRIN_OPS_ALLOW_LIVE=1` from this file. Do not deploy from this
file. Failed Functions inventory (HTTP 401/403/500, malformed JSON,
incomplete pagination) is **UNKNOWN**, not ABSENT, and **must not deploy**.
Live mode rejects `GRIN_OPS_PINNED_SHA`, endpoint fixtures, HTTP stubs, and
`GRIN_OPS_TEST_HANG`.

A1 changes Firestore access rules only. It does not deploy Functions, change Storage Rules/IAM, seed testers, enable GRIN, build the app, enable payments, or submit to Play.

Coordinates (same as `A1_PRESENT.md`): application `520f9f9`; helper pin
and tooling successor `0d7aa17`; historical ops-guard `228a8f5` 34/34;
combined freeze `aea65c1`. This Team 1 worktree is **not** an A3 apply
host (`git diff 520f9f9 -- functions/src/goodsEvidence/g2` is non-empty).

---

## A2 — Isolated Storage Rules — HOLD (concrete, not A1)

A1 `--only firestore:rules` never publishes Storage. A2 is a **separate**
command on the **same** isolated JSON:

```bash
firebase deploy --project vyaamikk-diary --non-interactive \
  --config docs/release/rules-compat/proposed-grin/firebase.rules-only.json \
  --only storage
```

| Artifact | sha256 |
|---|---|
| Isolated config (same as A1) | `d224b75385b451433e5c59bdbf0cc147697fbe88e773c11dab44f3b71e3e8a74` |
| Proposed merged Storage `proposed-grin/storage.rules` | `6b8959929b86ac2eab41fc591dc1fbf5bb03b80a226226d43bf4c8e72391c76b` (7942 B) |
| Live baseline / rollback Storage `live-export-2026-10-06/storage.rules` | `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5` (1133 B) |
| Forbidden repo-root `storage.rules` | `19fcc761dc8d5a923efb45ed589a598690bd3bb2159fab827f3ce30c17a60452` |

Delta vs live: **+177 lines**. Existing letterhead / attachments / pdfs
matchers stay. Additive GRIN object paths:

- `users/{userId}/grinEvidence/{objectKey}/original`
- `users/{userId}/grinEvidence/{objectKey}/derivatives/{derivativeKey}`

Upload create is admission- and reservation-bound; update/delete **false**.
A2 does **not** write IAM, Functions, tester docs, or the GRIN gate.

Rollback: copy the isolated JSON into `live-export-2026-10-06/` without
replacing `storage.rules`, then `--config` that JSON `--only storage`.
Post-deploy: Storage sha256 must equal `6b895992…`; Firestore must remain
whatever A1 did or did not publish (`b13d5255…` or `551203b8…`); GRIN seven
still ABSENT.

Never `--only storage,firestore:rules` as a single “A1” grant.

---

## A3 — Seven-function create, gate off — HOLD (concrete, not A1)

Pin: application `520f9f98bc952fd7f30a907da9e85774629a69c0`.  
Helper constant at tooling successor `0d7aa17a6efcf3ce6874269eb57afda0a2b45559`.  
Historical baseline `228a8f5` remains the 34/34 origin; `0d7aa17` is **not**
byte-identical (pin line only). Successor suite this session on combined:
**34/34** exit **0**, including live override rejections and UNKNOWN
inventory.

Apply host must have empty
`git diff --quiet 520f9f9 -- functions src eas.json app.json app firebase.json`
(combined `aea65c1` does; this Team 1 worktree does **not**). firebase-tools
**14.20.0**. **No** CLI dotenv. **No** `GRIN_OPS_PINNED_SHA`.

Exact later command (not run):

```bash
GRIN_OPS_ALLOW_LIVE=1 node docs/release/packets/grin-ops/grin-functions-op.mjs gate-off-initial
```

`--only` is exactly the seven `functions:grin*` names. Gate key **absent**
on create ⇒ `grinFunctionsEnabled` false.

Preconditions from inspect (complete inventory required):

- Project `vyaamikk-diary` / `982505811909` match
- Bucket `vyaamikk-diary.firebasestorage.app` belongs
- All seven **ABSENT**. Any **UNKNOWN** or **PRESENT** refuses create.
- Unrelated asia-south1 count stays out of `--only` (39 on last inspect)

Do **not** blindly retry all-seven create after a mixed result.
`create-absent-only` planner exists
(`docs/release/proposals/team1/grin-functions-absent-only.mjs`) and is
**not wired**. UNKNOWN blocks that planner too.

Rollback of a failed create is a **separate** later approval. Do not delete
serials/receipts/originals (none should exist yet). A3 does not change
Rules, IAM, testers, or enable the gate.

---

## A4 — Tester admission writes — HOLD (concrete, not A1)

A1 only allows **owner read** of `goodsEvidenceAdmission`; client
create/update/delete stay **false**. Seeding testers is an **Admin SDK /
console write**, not a Rules deploy.

Owner-named Firebase uids only:

`users/{uid}/goodsEvidenceAdmission/runtime` =
`{ schemaVersion: 1, newCommands: "allow", reconciliation: "allow" }`.

Everyone else omit or deny. Not Play licence testers. Wipe warning while
public retention is unset. Synthetic evidence only.

Rollback: write `newCommands: "deny"` (and/or `reconciliation: "deny"`) per
named uid. Do not Editor-delete receipts.

---

## A5 — IAM / runtime identity — HOLD (concrete, not A1)

Do **not** alter
`982505811909-compute@developer.gserviceaccount.com` (`roles/editor` today).
A1 does not touch IAM.

Proposal (still unapplied):
`docs/release/proposals/unapplied/GRIN_RUNTIME_IDENTITY_PROPOSAL.md`.

New GRIN-only SA bound to the seven gen2 functions **after they exist**
(so A5 is after A3). Firestore `roles/datastore.user` on `(default)` —
honest residual: Admin can still read all docs in that database. Storage
prefix condition on `users/*/grinEvidence/` **if** GCS conditions verify on
apply. **No** `storage.objects.delete`. Least-privilege is for **public**
GRIN, not implied by A1.

---

## A6 — Enable / disable gate — HOLD (concrete, not A1; gcloud UNPROVEN)

Requires **all seven PRESENT** (after A3). Firebase dotenv enable/disable
is **blocked** (firebase-tools 14.20.0 `inferDetailsFromExisting` replaces
user env when any CLI dotenv is loaded).

Documented later method:

```text
gcloud functions deploy NAME --gen2 --region=asia-south1 \
  --project=vyaamikk-diary \
  --update-env-vars=GRIN_GOODS_EVIDENCE_FUNCTIONS=true|false
```

**without** `--source`, only after inspect shows origin `gcs` or `repo`.
`gcloud` omitted-`--source` preservation on a **firebase-created** gen2
callable remains **UNPROVEN**. Do not enable live GRIN to obtain that
evidence. Direct Cloud Run env edit is forbidden. Origin `local` refuses
(cwd upload).

Live helper still rejects pin/fixture/HTTP stubs. Mid-loop gcloud failure
leaves already-updated names updated and deletes the temp session journal —
record by inspect, not by assuming PASS.

A6 does not deploy Rules, IAM, or testers.

---

## A7 — Synthetic smoke — HOLD (concrete, not A1)

**LIVE_BACKEND**, only after A3 + A4 + A6. Not an emulator substitute.

register → reserve → upload → stored-byte verify → confirmation →
reopen/read → amend/QC/return → pack summary. Interruption/retry. Original
receipt/serial integrity.

Callable disable ≠ Storage-upload disable ≠ retained data. In-flight calls
are **not** cancelled by disable. A1 Rules-only grant does **not** make
this runnable (Functions still ABSENT).

---

## Status snapshot

| Packet | Status | Implied by A1? |
|---|---|---|
| A1 Firestore Rules | **Presented — waiting owner grant** | — |
| A2 Storage Rules | **HOLD** — packet ready | **No** |
| A3 Functions create, gate off | **HOLD** — pin `520f9f9` / helper `0d7aa17`; 34/34 successor | **No** |
| A4 Tester admission | **HOLD** — Admin write; identities not supplied | **No** |
| A5 IAM | **HOLD** — proposal only; do not alter shared Editor | **No** |
| A6 Enable/disable | **HOLD** — gcloud **UNPROVEN**; dotenv blocked | **No** |
| A7 Smoke | **HOLD** — needs A3+A4+A6 | **No** |
