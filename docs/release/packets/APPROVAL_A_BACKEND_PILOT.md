# Approval A — Restricted GRIN backend pilot

**Not authorization until the owner writes which sub-operations are approved.**
Approval of A1 does not approve A2–A7. Do not set `GRIN_OPS_ALLOW_LIVE=1`
from this file.

Pinned GRIN Functions application: `5d5df3d54df08953bfb26db39a9b7f5e3d67ed47`
is **STALE** vs application `b845e8a` (pre-S1/S2). A1 does **not** run the
Functions helper, so A1 can still be offered. **A3 waits** for a reviewed
pin after S1/S2 — do **not** pin `b845e8a`; do **not** env-override
`PINNED_APP_SHA`. Ops helper: `228a8f58ac83d3c71e853cdccb6e4c4fa64c251f`
(34/34). Fresh inspect 2026-10-06: GRIN seven **ABSENT**, Firestore
`b13d5255…` = baseline. Packet:
`docs/release/proposals/team1/A1_PACKET_REFRESH.md`.

---

## Supported enable/disable method (source + CLI review; not live-proven)

| Phase | Method | Proven? |
|---|---|---|
| Initial create, gate **off** | `firebase deploy --project vyaamikk-diary --non-interactive --only` the exact seven `functions:grin*` names. **No dotenv.** Helper `gate-off-initial`. CLI `--version` must be **14.20.0**. | Command construction + stub tests. Live create **not executed**. |
| Later enable / disable | `gcloud functions deploy NAME --gen2 --region=asia-south1 --project=vyaamikk-diary --update-env-vars=GRIN_GOODS_EVIDENCE_FUNCTIONS=true\|false` **without** `--source`, only after inspect. | `applyGcloudGateUpdate` is a **pure helper**, not proof. **gcloud is absent here.** After firebase create, v2 `storageSource` is GCF’s staging zip — **not** proof gcloud will skip cwd. Treat omitted-`--source` preservation on a **firebase-created** gen2 callable as **UNPROVEN**. Do **not** enable live GRIN to obtain that evidence. A scratch/non-prod function created the same way is the remaining evidence. |
| Firebase dotenv enable/disable | **Blocked.** firebase-tools 14.20.0 `inferDetailsFromExisting` **replaces** user env on selected endpoints when any CLI dotenv is loaded. | SOURCE |

Do **not** infer original provenance solely from `storageSource`. After create,
inspect: source origin, service account, secret binding **count** (not values),
ingress. Unrelated 39 functions stay outside `--only`.

If `gcloud` origin is `local`, refuse (cwd upload). Direct Cloud Run env edit
is forbidden.

---

## Partial deployment

`gate-off-initial` already **refuses** if any of the seven is PRESENT or
UNKNOWN. Do not blindly retry create after a mixed result.

If firebase deploy fails after some endpoints exist:

1. `inspect` (complete inventory required).
2. Record each name: PRESENT / ABSENT / UNKNOWN + revision if present.
3. Do **not** re-run all-seven create (`assertAllAbsent` will refuse PRESENT names).
4. `enable`/`disable` also refuse unless **all seven** are PRESENT.
5. That mixed state is **stuck** in the current helper. Remaining ABSENT names need a **new bounded approval** for a subset `--only` list. A fail-closed planner exists at `docs/release/proposals/team1/grin-functions-absent-only.mjs` (**not wired** into `grin-functions-op.mjs`; do not run it live). UNKNOWN blocks.

`enable`/`disable` are sequential; a mid-loop gcloud failure leaves already-updated names updated and **deletes** the temp session journal. Record names by inspect, not by assuming PASS.

---

## Sub-operations (approve independently)

### A1 — Isolated Firestore Rules only (ready to offer now)

| Item | Value |
|---|---|
| Config | `docs/release/rules-compat/proposed-grin/firebase.rules-only.json` sha256 `d224b75385b451433e5c59bdbf0cc147697fbe88e773c11dab44f3b71e3e8a74` |
| Source | merged Firestore `551203b8b11991fc1d49d42aa6a818fedeca8530654f7505de949b62a1ae298b` |
| Live baseline now | `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` |
| Rollback | `docs/release/rules-compat/live-export-2026-10-06/firestore.rules` |
| Apply-time | re-export live; abort if sha256 ≠ baseline; then deploy; re-export; must equal merged hash; release still `cloud.firestore`. `--only firestore:rules` (**not** `--only firestore`, which includes indexes). Never repo-root `firebase deploy`. |

```bash
firebase deploy --project vyaamikk-diary --non-interactive \
  --config docs/release/rules-compat/proposed-grin/firebase.rules-only.json \
  --only firestore:rules
```

Not Storage. Not Functions. Not IAM.

### A2 — Isolated Storage Rules

Same config `--only storage`. Merged Storage
`6b8959929b86ac2eab41fc591dc1fbf5bb03b80a226226d43bf4c8e72391c76b`.
Rollback: `live-export-2026-10-06/storage.rules`. Separate approval.

### A3 — Initial seven-function create, gate off

`GRIN_OPS_ALLOW_LIVE=1 node docs/release/packets/grin-ops/grin-functions-op.mjs gate-off-initial`
only if inspect still shows complete genuine absence, verified project/bucket,
clean deployment tree vs `5d5df3d`, no CLI dotenv, firebase 14.20.0.
Rollback: do not delete serials/receipts/originals (none should exist yet);
undeploy of failed create is a **separate** later approval if needed.

### A4 — Tester admission writes

Owner-named Firebase uids only:

`users/{uid}/goodsEvidenceAdmission/runtime` =
`{ schemaVersion: 1, newCommands: "allow", reconciliation: "allow" }`.

Everyone else omit or deny. Not Play licence testers. Wipe warning while
retention is unset. Synthetic evidence only.

### A5 — IAM / runtime identity (optional, not on shared Editor)

Do **not** alter `982505811909-compute@developer.gserviceaccount.com`.
Proposal: new GRIN-only SA with `roles/datastore.user` on `(default)`
(database-level residual: Admin can still read all docs — honest) and
Storage `objectViewer` with a prefix condition on
`users/*/grinEvidence/` if GCS conditions verify on apply. No
`storage.objects.delete`. Separate approval. Least-privilege before
**public** GRIN.

### A6 — Enable callables (`GRIN_GOODS_EVIDENCE_FUNCTIONS=true`)

gcloud path on apply host after A3 inspect shows gcs/repo origin.
Keep enablement approval **separate** until post-operation inspect proves
gate on, other user-key counts unchanged, secrets unchanged, SA unchanged.
Do not execute enablement to obtain that evidence.

### A7 — Synthetic smoke (LIVE_BACKEND, after A3+A4+A6)

register → reserve → upload → stored-byte verify → confirmation →
reopen/read → amend/QC/return → pack summary. Interruption/retry.
Original receipt/serial integrity. Callable disable ≠ Storage-upload
disable ≠ retained data. In-flight calls are **not** cancelled by disable.

---

## Auth/admission on production composition (EMULATOR, not LIVE_BACKEND)

Honest table: `docs/release/proposals/team1/AUTH_ADMISSION_COVERAGE.md`.
`production-compose.gates.emulator.test.ts` is **register-heavy**. Do not treat
EMULATOR as LIVE_BACKEND. These GAPs are **not** passing tests.

| Scenario | Production compose |
|---|---|
| Unauthenticated register | COVERED |
| Unauthenticated on the other six names | **GAP** |
| `auth: null` through `runProductionGrinCallable` | **GAP** (SOURCE) |
| Non-admitted / missing / malformed admission | COVERED (register; mutate/reserve after deny) |
| Inactive / pending_deletion | COVERED (register only) |
| Cross-owner read / wrong ledger | COVERED (loose codes) |
| OTHER register on OWNER ledger | **GAP** |
| Replay / digest_conflict | COVERED (register) |
| Concurrent register | COVERED |
| Admission deny after originals linked | COVERED (originals survive) |
| Retired ledger | **GAP** here; COVERED on adapter `register.emulator.test.ts` |
| mutate `version_conflict` | **GAP** here; COVERED INJECTED `mutations.injected.unit.test.ts` |

Smallest later adds (not this packet’s live apply): retired ledger
register+reserve; pending reconcile; mutate `version_conflict`; unauth on all
seven; OTHER register; SOURCE `auth: null` on register and uploadEvidence.

---

## Rollback (data-preserving)

| Surface | Action |
|---|---|
| Rules | Roll **forward** to `live-export-2026-10-06` via isolated config |
| Callables | A6 disable (`gate=false`); does not cancel in-flight |
| Uploads | A4 `newCommands: deny` per uid |
| Receipts / serials / originals | Do nothing destructive. Do not use Editor delete. |

---

**Owner approvals requested:** A1 can be granted alone. A2–A7 remain HOLD.
