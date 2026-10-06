# Team 1 executable restricted-pilot batch (A–F)

**Coordinator supersession 2026-10-06:** GHA **`37440328976` completed
success** on checkout `70bdfe4` (application then `fcda7cd`). Billing-lifecycle
correction is now combined application **`60c4bc179c46b8986ab0dbd2c95db0e4a5ceb49a`**.
C stays HOLD until T5 reviews **`60c4bc1`** and matching CI exists. Do **not**
pin `fcda7cd` or `60c4bc1` from this packet. This packet still does **not**
authorize live execute.

**Not authorization.** This file does not set `GRIN_OPS_ALLOW_LIVE`. Do not
deploy from this session. Combined is coordinator-owned. Do not rewrite
`docs/release/packets/grin-ops/grin-functions-op.mjs`. Do not force-push
`origin/team/grin-t1-backend`. Do not invent tester UIDs. Keep identifiers
out of git. Do not deploy, set `GRIN_OPS_ALLOW_LIVE=1`, run EAS, Play, or
billing activation from this packet.

A changes Firestore access rules only. B changes Storage rules only. Owner
**A and B MAY be approved in ONE owner response as TWO explicitly scoped
operations.** Execute them separately, each with its own verification and
rollback. Never run a single
`firebase deploy --only firestore:rules,storage` as one command; two
commands if both are approved.

S1 / S2 and P3 are **preserved** (not reopened here).

Coordinator will not execute until the owner letters a **COMPLETE** batch.
This packet is that batch. Rows marked HOLD are fully specified operations
that must not run until their stated blocker clears.

---

## Coordinator present this table

| Scope | Operation | Executable? | Why |
|---|---|---|---|
| **A** Firestore Rules | Isolated `--only firestore:rules` | **YES** (after owner letter + inspect still = live baseline) | Hashes, command, verification, rollback, stop conditions complete. firebase-tools **14.20.0**. |
| **B** Storage Rules | Isolated `--only storage` | **YES** (after owner letter + inspect still = live baseline) | Same isolated JSON, **separate** command and verification. May be lettered in the same owner response as A; must still run as its own command. |
| **C** Functions gate-off-initial | Seven named create, gate key **absent** | **HOLD** | Helper `PINNED_APP_SHA` is still `520f9f9` (**STALE**). Do **not** apply the pin. HOLD until the coordinator pins the **FINAL** candidate **after billing-lifecycle correction + matching CI**. Name `fcda7cd` as the GRIN Functions tree unless combined application paths move. |
| **D** Tester admission | Admin/Firestore document write | **YES** for UID grammar / validate-uids; **HOLD** for writes | Mechanism is **not** a SOURCE allowlist. Writes wait on owner UIDs supplied **privately out-of-repo**. `PLAY_BILLING_TESTER_UIDS` is a **separate** Functions env/secret and is **not** authorized to be set now. |
| **E** Gate enable / disable | gcloud `--update-env-vars` without `--source` | **HOLD — UNPROVEN** | firebase-tools **14.20.0** dotenv **REPLACE** is proven **blocked**. Helper enable/disable **intends** omitted-`--source` gcloud **only if** inspect `sourceOrigin` is `gcs` or `repo`. That preservation is **UNPROVEN** (`gcloud` **ABSENT**). Do not claim proven. |
| **F** Synthetic smoke | INJECTED harness; LIVE_BACKEND | **INJECTED YES**; **LIVE HOLD** | Case list complete. `LIVE_BACKEND` stays refused until **E is proven AND** the owner letters live smoke. Synthetic data only. |

IAM / runtime identity is **not** a row in this batch. Inspected residual:
`982505811909-compute@developer.gserviceaccount.com` already has
`roles/editor`. **Do not add roles** for this pilot.

---

## Coordinates (this session, 2026-10-06)

| Item | Value |
|---|---|
| Team 1 worktree | `/Users/shivamsaurav/vyd-worktrees/grin-t1-backend` |
| Provenance branch | `team/grin-t1-executable-batch` |
| Combined (read-only) | `/Users/shivamsaurav/vyd-worktrees/grin-combined` HEAD `70bdfe4b2ea2a7cf6a9fe5f1cf7bf08ff6ebc4e9` (docs) |
| **GRIN Functions tree** | `fcda7cd64e9622e50c38223a7156f0f6b8ca5576` unless combined `functions` / `src` / `eas.json` / `app.json` / `app` / `firebase.json` move. Billing-lifecycle correction may land **after** this packet; pin/candidate SHA is **coordinator-owned**. |
| Combined vs `fcda7cd` on those paths | **empty** (application blobs = `fcda7cd`) |
| This worktree vs `fcda7cd` on those paths | **non-empty** — **not** a C apply host |
| Combined helper `PINNED_APP_SHA` | `520f9f98bc952fd7f30a907da9e85774629a69c0` — **STALE**. **Do not apply a pin from Team 1.** |
| This worktree helper | still `5d5df3d54df08953bfb26db39a9b7f5e3d67ed47` — **not rewritten** |
| Historical ops-guard 34/34 | `228a8f58ac83d3c71e853cdccb6e4c4fa64c251f` |
| Canonical CI | GHA **`37440328976` IN_PROGRESS** on checkout **`70bdfe4`** (docs HEAD; application blobs = `fcda7cd`). Do **not** create trigger commits. Prior run `37425360211` covers `0d7aa17` / `520f9f9` **only**. |
| T5 on `fcda7cd` | `docs/release/proposals/team5/REVIEW_fcda7cd.md` (combined) SOURCE+INJECTED PASS for the billing-tester slice; helper pin recorded STALE; canonical GHA was NOT RUN in that review. |
| `GRIN_OPS_ALLOW_LIVE` / `GRIN_OPS_PINNED_SHA` / `GRIN_OPS_EXPORT_DIR` | **unset** (this session) |
| firebase-tools | **14.20.0** (`firebase --version`) |
| `gcloud` | **ABSENT** on this host |

Do **not** pin `520f9f9`, `56f2040`, `313025f`, `b845e8a`, or combined docs
HEAD `70bdfe4`. Combined’s
`docs/release/proposals/team1/PIN_UPDATE_AFTER_fcda7cd.diff.md` is
**unapplied and coordinator-owned**. Team 1 does **not** apply it: billing
correction may supersede `fcda7cd`. C stays HOLD until the coordinator
pins the **FINAL** candidate after that correction **and** matching CI.

`PIN_UPDATE_AFTER_313025f.diff.md` and `PIN_UPDATE_AFTER_56f2040.diff.md`
on this worktree are **superseded** as apply proposals.

---

## Inspect (RE-RUN at every apply; not re-run this session)

This instruction does **not** authorize live inspect. Last recorded
read-only inspect (prior Team 1 packet / `live-export-2026-10-06/META.json`,
2026-10-06) is **not** an apply-time substitute. At apply:

```bash
unset GRIN_OPS_ALLOW_LIVE GRIN_OPS_PINNED_SHA GRIN_OPS_EXPORT_DIR PINNED_APP_SHA
node docs/release/packets/grin-ops/grin-functions-op.mjs inspect
```

No mutate. No `GRIN_OPS_EXPORT_DIR`. Do **not** overwrite
`live-export-2026-10-06/` unless the new bytes are an approved new baseline.

Last recorded result (must be re-confirmed):

| Check | Last recorded |
|---|---|
| CLI user | `support.vyd@specialsoftwares.com` |
| Project | `vyaamikk-diary` / `982505811909` HTTP **200** `match=true` |
| Bucket | `vyaamikk-diary.firebasestorage.app` belongs HTTP **200** |
| Inventory | HTTP **200**, `complete=true`, `reason=ok`, `pages=1` |
| GRIN seven | **ABSENT** (`grin_all_absent=true`) |
| Unrelated asia-south1 | **39** (ids in `live-export-2026-10-06/META.json`) |
| Runtime SA | `982505811909-compute@developer.gserviceaccount.com` `roles/editor` (residual) |
| Firestore DB IAM | HTTP **501** unsupported |
| Live Firestore sha256 | `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` **= baseline** |
| Live Storage sha256 | `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5` **= baseline** |
| Live overrides | live mode rejects `GRIN_OPS_PINNED_SHA` / endpoint fixture / `GRIN_OPS_TEST_HANG` / `GRIN_OPS_HTTP_STUB` / `FIREBASE_BIN` / `GCLOUD_BIN` before mutation |

### Inspect stop conditions (all of A–F)

Treat as **UNKNOWN**, not ABSENT / not “hash matches”. **Must not deploy or
mutate.** Re-inspect until complete. Do not infer absence from a failed list.

- HTTP **401 / 403 / 500** on project, bucket, Functions list, or Rules
  release
- Malformed JSON / `parseOk=false`
- Invalid list shape (non-object, `functions` not an array)
- Incomplete pagination (`complete=false`, `pagination_limit`, interrupted
  pages)
- Project id/number mismatch or bucket not belonging to `982505811909`
- `firebase --version` ≠ **14.20.0**
- `GRIN_OPS_ALLOW_LIVE=1` together with any live-forbidden override
- Live Firestore sha256 ≠ the **expected** hash for that step (baseline
  before A; proposed after A)
- Live Storage sha256 ≠ the **expected** hash for that step (baseline
  before B; proposed after B)
- Mixed GRIN **PRESENT / ABSENT / UNKNOWN** when the step requires a uniform
  set
- Unrelated asia-south1 count ≠ **39** (or id set changed) — **stop**; do
  not “fix” unrelated functions

---

## Preservation proof (firebase-tools 14.20.0) — E remains UNPROVEN

Installed CLI: `firebase --version` → **14.20.0**. SOURCE inspection of
`$(dirname $(which firebase))/../lib/node_modules/firebase-tools`
(`lib/deploy/functions/prepare.js` `inferDetailsFromExisting` 197–217;
`lib/functions/env.js` `hasUserEnvs`). In-process confirmation:

```bash
node --test docs/release/proposals/team1/firebase-tools-14.20.0-infer-details.test.mjs
```

**PASS** (1/1) on this host. Proven properties:

| Property | Proven? | Evidence |
|---|---|---|
| Isolated `--config` paths resolve from `dirname(--config)` | YES | 105-byte JSON loads `proposed-grin/*.rules`, not repo-root quota Rules |
| Create, no dotenv: new endpoint has no remote user env; gate key **absent** ⇒ off | YES | `inferDetailsFromExisting` `!haveE` → `continue`; `grinFunctionsEnabled` is exact `"true"` only |
| Re-deploy **without** dotenv on a PRESENT name **merges** remote user env (would preserve a remote `GRIN_GOODS_EVIDENCE_FUNCTIONS=true`) | YES | `usedDotenv=false` → `{...haveE.environmentVariables, ...wantE.environmentVariables}` |
| Re-deploy **with** any CLI dotenv **replaces** user env (remote-only keys dropped, including the gate) | YES | `usedDotenv=true` skips merge. **Firebase dotenv enable/disable is BLOCKED.** |
| Helper `gcloud` argv omits `--source` / `--set-env-vars` / `--clear-env-vars` | YES (argv + stub tests on combined helper) | `gcloudArgsUnsafe`; `applyGcloudGateUpdate` is a **pure object transform**, not a live gcloud run |
| Inspect origin `gcs` when v2 `storageSource.bucket` is set | YES (helper SOURCE) | `sourceFromV2Function`. **Not** proof that omitted-`--source` gcloud preserves that archive |
| `gcloud functions deploy --gen2 --update-env-vars` **without** `--source` preserves source archive, secrets, ingress, runtime SA, and other user keys on a **firebase-created** gen2 callable | **UNPROVEN** | `gcloud` **ABSENT** here. Do not enable live GRIN to obtain that evidence. Official docs for GCS/repo origin do **not** prove firebase-CLI staging `storageSource` is treated as reusable GCS origin by this host’s (absent) gcloud |

**E is refused until that last row is proven** on a scratch/non-prod
function created the same way as GRIN. Direct Cloud Run env edit is
forbidden. Firebase dotenv is blocked.

---

## A — Firestore Rules only

Working directory: **repository root**. firebase-tools **14.20.0**.
`GRIN_OPS_ALLOW_LIVE` stays unset for this Rules path (firebase CLI, not
the Functions helper).

```bash
firebase deploy --project vyaamikk-diary --non-interactive \
  --config docs/release/rules-compat/proposed-grin/firebase.rules-only.json \
  --only firestore:rules
```

| Artifact | Bytes | sha256 |
|---|---|---|
| Isolated config `docs/release/rules-compat/proposed-grin/firebase.rules-only.json` | 105 | `d224b75385b451433e5c59bdbf0cc147697fbe88e773c11dab44f3b71e3e8a74` |
| Proposed merged Firestore `docs/release/rules-compat/proposed-grin/firestore.rules` | 17346 | `551203b8b11991fc1d49d42aa6a818fedeca8530654f7505de949b62a1ae298b` |
| Live baseline / rollback `docs/release/rules-compat/live-export-2026-10-06/firestore.rules` | 15313 | `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` |
| **Forbidden** repo-root `firestore.rules` | 38494 | `233b05b7b810b484171257f4dafe78fd0fdea5762ed6848cf8b49cd327fd58cc` |

Isolated JSON keys: `firestore`, `storage` only — **no** `functions`.
`--config` paths resolve from `dirname(--config)`. Never `firebase deploy`
from repo-root `firebase.json`. Never `--only firestore` (indexes). Never
`--only storage` on this command (that is **B**). Never
`--only firestore:rules,storage`. Never `functions:grin*`.

Delta vs live: **+55 / −0**. Billing-off matchers unchanged. Additive nested
matchers under `match /users/{uid}` only (admission owner-read; GRIN trees
active-user read; client CUD **false**). Admin SDK / Functions remain writers.

### A apply-time (owner letter later; **not run here**)

1. `GRIN_OPS_ALLOW_LIVE` unset. `firebase --version` is **14.20.0**. Cwd repo root.
2. Read-only inspect **without** `GRIN_OPS_EXPORT_DIR`. If inspect is UNKNOWN,
   **stop**. Live Firestore sha256 must still equal
   `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c`.
   If it matches, **do not** overwrite `live-export-2026-10-06/`. If it
   differs, **abort**; re-export; re-merge; do not apply these bytes.
3. Confirm isolated config + merged Firestore hashes (`shasum -a 256`).
4. Run the exact command above. Do **not** combine with B in the same argv.
5. Re-inspect (no export overwrite unless recording a new approved live).
   Live Firestore sha256 **must** equal
   `551203b8b11991fc1d49d42aa6a818fedeca8530654f7505de949b62a1ae298b`.
   Release name remains `cloud.firestore`. Storage remains `1a912051…`
   unless B already ran as its **own** command. GRIN seven still **ABSENT**.
   Unrelated count still 39.
6. If live sha256 ≠ merged hash, **stop**. Roll forward (rollback below).
   Do not retry from repo-root `firebase.json`.

### A stop conditions

- Any inspect UNKNOWN / identity / inventory failure (above)
- Hash mismatch on isolated JSON, proposed Firestore, or live baseline
- Mix-up with repo-root `firestore.rules` (`233b05b7…`)
- Combined `--only firestore:rules,storage`
- `--only firestore` (would touch indexes)
- Post-apply Firestore sha256 ≠ `551203b8…`
- Post-apply Storage sha256 changed **without** a separate lettered B
- GRIN seven no longer all ABSENT (unexpected; **stop**, do not continue to C)

### A rollback (data-preserving) — `live-export-2026-10-06`

That directory has `firestore.rules`, `storage.rules`, and `META.json`. It
does **not** currently contain `firebase.rules-only.json`. At rollback time,
copy the **same 105-byte JSON** into that directory **without** replacing
`firestore.rules` / `storage.rules` / `META.json`.

```bash
cp docs/release/rules-compat/proposed-grin/firebase.rules-only.json \
  docs/release/rules-compat/live-export-2026-10-06/firebase.rules-only.json
firebase deploy --project vyaamikk-diary --non-interactive \
  --config docs/release/rules-compat/live-export-2026-10-06/firebase.rules-only.json \
  --only firestore:rules
```

Do **not** add that JSON in this session. Do **not** delete receipts,
serials, or Storage objects. Do **not** use Editor delete. After rollback,
live Firestore sha256 must equal `b13d5255…` again. Storage must remain
whatever B did or did not publish.

---

## B — Storage Rules (separate command)

Same isolated JSON, **separate** command. firebase-tools **14.20.0**. Cwd
repo root. Owner may letter B in the **same response** as A; still execute
B only with `--only storage` and its own inspect/verify/rollback.

```bash
firebase deploy --project vyaamikk-diary --non-interactive \
  --config docs/release/rules-compat/proposed-grin/firebase.rules-only.json \
  --only storage
```

| Artifact | Bytes | sha256 |
|---|---|---|
| Isolated config (same as A) | 105 | `d224b75385b451433e5c59bdbf0cc147697fbe88e773c11dab44f3b71e3e8a74` |
| Proposed merged Storage `proposed-grin/storage.rules` | 7942 | `6b8959929b86ac2eab41fc591dc1fbf5bb03b80a226226d43bf4c8e72391c76b` |
| Live baseline / rollback `live-export-2026-10-06/storage.rules` | 1133 | `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5` |
| Forbidden repo-root `storage.rules` | 1390 | `19fcc761dc8d5a923efb45ed589a598690bd3bb2159fab827f3ce30c17a60452` |

Delta vs live: **+177 / −0**. Existing letterhead / attachments / pdfs
matchers stay. Additive GRIN paths:

- `users/{userId}/grinEvidence/{objectKey}/original`
- `users/{userId}/grinEvidence/{objectKey}/derivatives/{derivativeKey}`

Upload create is admission- and reservation-bound; update/delete **false**.

### B apply-time (owner letter later; **not run here**)

1. `GRIN_OPS_ALLOW_LIVE` unset. `firebase --version` **14.20.0**.
2. Inspect without `GRIN_OPS_EXPORT_DIR`. UNKNOWN → **stop**. Live Storage
   sha256 must equal
   `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5`.
   If it differs, **abort**. Do not overwrite `live-export-2026-10-06/`.
3. Confirm hashes. Run the exact `--only storage` command.
4. Re-inspect. Live Storage sha256 **must** equal
   `6b8959929b86ac2eab41fc591dc1fbf5bb03b80a226226d43bf4c8e72391c76b`.
   Firestore remains whatever A did or did not publish (`b13d5255…` or
   `551203b8…`). Storage release remains
   `firebase.storage/vyaamikk-diary.firebasestorage.app`. GRIN seven still
   **ABSENT**. Unrelated still 39.

### B stop conditions

- Inspect UNKNOWN / hash mismatch / repo-root Storage (`19fcc761…`)
- Combined `--only firestore:rules,storage` (forbidden even if A and B are
  both lettered)
- Post-apply Storage sha256 ≠ `6b895992…`
- Post-apply Firestore sha256 changed **without** a separate lettered A
- GRIN seven no longer all ABSENT

### B rollback

```bash
cp docs/release/rules-compat/proposed-grin/firebase.rules-only.json \
  docs/release/rules-compat/live-export-2026-10-06/firebase.rules-only.json
firebase deploy --project vyaamikk-diary --non-interactive \
  --config docs/release/rules-compat/live-export-2026-10-06/firebase.rules-only.json \
  --only storage
```

After rollback, live Storage sha256 must equal `1a912051…`. Firestore
remains whatever it was. Do not Editor-delete objects.

---

## C — Seven Functions, gate-off-initial

**HOLD.** Selected artifact SHA for the GRIN Functions tree is
`fcda7cd64e9622e50c38223a7156f0f6b8ca5576` **unless** combined application
paths move. Pin/candidate SHA after billing-lifecycle correction is
**coordinator-owned**. Helper `PINNED_APP_SHA` is still
`520f9f98bc952fd7f30a907da9e85774629a69c0` (**STALE**). Do **not** apply
the pin from this packet. C does not run until the coordinator pins the
**FINAL** candidate after billing correction **and** matching CI, then a
later owner letter.

Region **`asia-south1`**, codebase `default`, project **`vyaamikk-diary`**.
Runtime identity stays
`982505811909-compute@developer.gserviceaccount.com` with residual
`roles/editor`. **Do not add roles** for this pilot.

Exact seven names (helper `GRIN_FUNCTIONS` / `functions/src/index.ts`
re-export from `productionExports.ts`):

```text
grinRegisterGoodsReceipt
grinReconcileCommand
grinMutateGoodsReceipt
grinReadGoodsReceipt
grinReserveEvidence
grinBeginEvidenceUpload
grinUploadEvidence
```

Apply-host command **after** pin-update, on a tree whose
`functions` / `src` / `eas.json` / `app.json` / `app` / `firebase.json`
diff vs the **pinned** SHA is empty (combined `70bdfe4` is empty vs
`fcda7cd` today; this Team 1 worktree is **not**). **Not this session:**

```bash
unset GRIN_OPS_PINNED_SHA GRIN_OPS_EXPORT_DIR PINNED_APP_SHA
# GRIN_OPS_ALLOW_LIVE=1 is set only after the owner letter for C
GRIN_OPS_ALLOW_LIVE=1 node docs/release/packets/grin-ops/grin-functions-op.mjs gate-off-initial
```

`--only` is exactly (no dotenv, no repo-root extra targets):

```text
functions:grinRegisterGoodsReceipt,functions:grinReconcileCommand,functions:grinMutateGoodsReceipt,functions:grinReadGoodsReceipt,functions:grinReserveEvidence,functions:grinBeginEvidenceUpload,functions:grinUploadEvidence
```

Equivalent firebase argv the helper constructs (`buildFirebaseSevenOnlyArgs`):

```bash
firebase deploy --project vyaamikk-diary --non-interactive \
  --only functions:grinRegisterGoodsReceipt,functions:grinReconcileCommand,functions:grinMutateGoodsReceipt,functions:grinReadGoodsReceipt,functions:grinReserveEvidence,functions:grinBeginEvidenceUpload,functions:grinUploadEvidence
```

Gate key **`GRIN_GOODS_EVIDENCE_FUNCTIONS`**. Absent on create ⇒
`grinFunctionsEnabled` false (`functions/src/goodsEvidence/callables.ts`:
exact `"true"` is on; `"false"` / missing / `"1"` / `"TRUE"` are off).

No CLI dotenv (`.env`, `.env.vyaamikk-diary`, `.env.production`,
`.env.local` under `functions/`). Helper `assertNoCliDotenv` aborts if any
exist; do not create, move, or delete operator-owned dotenv to proceed.

Do not env-override (`GRIN_OPS_PINNED_SHA` is rejected in live mode).

Apply-host check after coordinator pin of FINAL `PIN`:

```bash
git diff --quiet "$PIN" -- functions src eas.json app.json app firebase.json
```

### C preconditions from inspect (complete inventory required)

- Project / bucket match
- All seven **ABSENT**. Any **UNKNOWN** or **PRESENT** refuses
  `gate-off-initial` (no-dotenv merge would preserve a remote gate-on key)
- Unrelated asia-south1 count stays out of `--only` (39 on last inspect)
- `assertPinnedSource` + clean DEPLOYMENT_PATHS + no CLI dotenv
- firebase-tools **14.20.0**
- Live A/B hashes are whatever those lettered steps published; C does not
  change Rules

C does not change Rules, IAM, testers, or enable the gate.

### C post-create verification (later; **not run**)

Re-inspect without `GRIN_OPS_EXPORT_DIR`. Require:

- all seven **PRESENT**
- each `gate=off` (gate key not exact `"true"`; absent or `"false"` both off)
- `sourceOrigin` recorded (`gcs` / `repo` / `unknown` / `local`) — needed
  later for E; **do not** treat `gcs` from v2 `storageSource` as E proof
- unrelated ids still the same 39
- runtime SA still the default Compute SA
- secret binding **count** recorded (values never printed)

### C stop conditions

- Pin still `520f9f9` or any SHA other than the coordinator FINAL candidate
- Canonical CI not matching the FINAL candidate (run `37440328976` is
  **IN_PROGRESS** on docs HEAD `70bdfe4`; do not treat IN_PROGRESS as PASS)
- This worktree used as apply host (DEPLOYMENT_PATHS vs pin **non-empty**)
- Inspect UNKNOWN
- Any of the seven PRESENT before create
- Mixed PRESENT/ABSENT after a failed deploy
- CLI dotenv present
- Dirty DEPLOYMENT_PATHS
- firebase CLI ≠ 14.20.0
- Live overrides set
- Blind all-seven retry after mixed result

### C rollback / mixed state (not this grant)

| Situation | In-scope | Forbidden |
|---|---|---|
| Create succeeded; enable not done | Leave seven PRESENT, gate off. Callables exist and deny. That **is** C success. | Delete the seven; delete serials/receipts/originals; Editor delete |
| Mixed PRESENT/ABSENT | `inspect` until complete. Record each name PRESENT / ABSENT / UNKNOWN. **Stop.** Do not describe as rolled back. | Blind all-seven retry; treat UNKNOWN as ABSENT |
| Inspect UNKNOWN | UNKNOWN, not ABSENT. Do not deploy. Re-inspect until complete. | Infer absence from a failed list |
| Mixed-state resume | **Separate packet.** Planner `docs/release/proposals/team1/grin-functions-absent-only.mjs` is **not wired**. Helper has **no** `functions:delete`. | Wiring `create-absent-only` into `grin-functions-op.mjs` from this file |

---

## D — Tester admission (Admin/Firestore document; **not** a SOURCE allowlist)

**HOLD for writes** until the owner supplies Firebase Auth UIDs privately
(out of repo). Grammar / validator is **YES** now. Do not invent UIDs.
Values **never** enter git and are **never printed**.

This is **not**:

- a SOURCE allowlist in `functions/` or `src/`
- Play licence-tester email
- Internal-track membership
- `EXPO_PUBLIC_*`
- **`PLAY_BILLING_TESTER_UIDS`**

### D mechanism (real path)

Admin SDK / Firestore Admin (Rules CUD stay **false**; client cannot seed).
A only allows **owner read** of this document after A is published.

Path (fixed document id `runtime`):

```text
users/{uid}/goodsEvidenceAdmission/runtime
```

JSON (JavaScript / Admin `set`; `schemaVersion` is integer **1**, not
string `"1"`):

```json
{ "schemaVersion": 1, "newCommands": "allow", "reconciliation": "allow" }
```

Parser (`functions/src/goodsEvidence/g1/adapter.ts` and `g2/adapter.ts`
`parsePolicy`):

- missing document → no policy → `policy_denied`
- `schemaVersion !== 1` (including string `"1"`, `1.0` stored as double in
  some consoles, or omitted) → no policy → `policy_denied`
- `newCommands` / `reconciliation` not exact `"allow"` or `"deny"`
  (including `"ALLOW"`, `"true"`, `"1"`) → no policy → `policy_denied`
- `newCommands: "deny"` with valid schema → `policy_denied` for new
  commands / uploads; do not Editor-delete

### D validate (executable now; no write)

Owner UID file must live **outside** the git worktree. Validator:
`docs/release/proposals/team1/grin-pilot-smoke.mjs` `parseFirebaseAuthUids`.

- One UID per line, or comma-separated. `#` comments allowed.
- Trim whitespace. Drop empty tokens.
- Each UID: Firebase Auth id, **1–128** of `[A-Za-z0-9_-]`. Reject emails
  (`@`), `/`, whitespace inside, `.` / `..` path tokens.
- Duplicates collapsed. Values **never printed**.
- Empty file ⇒ **fail-closed** (write nothing; admit nobody).

```bash
node docs/release/proposals/team1/grin-pilot-smoke.mjs validate-uids /absolute/path/outside/repo/uids.txt
```

Prints `count=` only. Invalid tokens abort. Inside-repo path abort.

### D write (later; **not run**; not authorized without owner UIDs + letter)

Per named uid only, Admin `set` (merge allowed **only** for the three
keys below) or Firestore REST PATCH. Token from firebase CLI login — **never
print** the token.

REST (uid substituted from the private file; never logged):

```text
PATCH https://firestore.googleapis.com/v1/projects/vyaamikk-diary/databases/(default)/documents/users/{uid}/goodsEvidenceAdmission/runtime?updateMask.fieldPaths=schemaVersion&updateMask.fieldPaths=newCommands&updateMask.fieldPaths=reconciliation
```

Body:

```json
{
  "fields": {
    "schemaVersion": { "integerValue": "1" },
    "newCommands": { "stringValue": "allow" },
    "reconciliation": { "stringValue": "allow" }
  }
}
```

Empty owner list ⇒ write **zero** documents. Do not seed “example” uids.
Do not write from this packet’s INJECTED labels (`owner_pilot_inj`, etc.).

Admin write **bypasses** Rules (does not require A to succeed). Owner
**client read** of the seeded doc **does** require A. Sequence A then D
for a coherent pilot. D does not enable the Functions gate (that is E).

### D verification (later)

- Admin get of each named path: integer `schemaVersion=1`,
  `newCommands=allow`, `reconciliation=allow`. Print `count=` and
  `fields_ok=true|false` only — **never** the uid.
- A client SDK create/update/delete of the same path must still **fail**.
- A uid **not** on the owner list must have **no** allow document (omit or
  deny).
- Malformed probe (out of band, synthetic uid only if owner so letters):
  `newCommands: "ALLOW"` must parse as no policy.

### D rollback (data-preserving)

Same path, same three fields:

```json
{ "schemaVersion": 1, "newCommands": "deny", "reconciliation": "deny" }
```

REST `stringValue` `"deny"` / `integerValue` `"1"`. Do **not**
Editor-delete the document if receipts may exist. Deny-write is the scoped
rollback. Missing doc is also deny for new commands, but delete is
forbidden when receipts exist. Do not Editor-delete receipts, serials, or
Storage originals.

### D stop conditions

- UID file missing, inside the worktree, empty (fail-closed: **do not
  write**), or parse failure
- Any uid with `@`, `/`, whitespace, or outside `FIREBASE_AUTH_UID`
- Attempt to set `PLAY_BILLING_TESTER_UIDS` as a substitute
- Printing or committing UID values
- Editor-delete of admission or receipts as “rollback”
- `schemaVersion` stored as string `"1"` (will fail closed; **stop** and
  rewrite as integer `1`, do not delete)

### `PLAY_BILLING_TESTER_UIDS` (separate; **not this operation**)

Functions env/secret (private runtime config) parsed by
`functions/src/billing/google/playConstants.ts`. Empty / absent /
whitespace-only ⇒ empty set ⇒ **deny every billing caller**. Invalid
tokens fail closed. This is **not** the GRIN admission document.

**Not authorized to be set now.** Do not `firebase functions:secrets:set`,
dotenv, or gcloud `--update-env-vars=PLAY_BILLING_TESTER_UIDS=…` as part of
A–F. Billing enablement (`PLAY_BILLING_ENABLED === "true"`) is out of
scope. GRIN admission **allow** does not admit Play billing testers.

---

## E — Gate enable / disable — UNPROVEN, HOLD

Env key: **`GRIN_GOODS_EVIDENCE_FUNCTIONS`**.

| Stored value | `grinFunctionsEnabled` |
|---|---|
| exact `"true"` | **on** |
| `"TRUE"` / `"1"` / `"false"` / missing / other | **off** |

Rollback target after a proven enable: **`"false"`** or **absent** (both
off). Absent key is off.

**Firebase dotenv enable/disable is BLOCKED** (14.20.0 replace, not
update-one-key). `GRIN_OPS_METHOD=firebase-dotenv` aborts in the helper.
Direct Cloud Run env edit is forbidden. `--source` / `--set-env-vars` /
`--clear-env-vars` are rejected by `gcloudArgsUnsafe`.

### Intended operation (NOT a grant; NOT executable until preservation is proven)

Helper `enable` / `disable` (combined
`docs/release/packets/grin-ops/grin-functions-op.mjs`; **do not rewrite**
that file from this packet) intends, **only if** inspect `sourceOrigin` is
`gcs` or `repo` for **all seven**, sequential gcloud **without**
`--source`:

Enable:

```bash
unset GRIN_OPS_PINNED_SHA GRIN_OPS_EXPORT_DIR PINNED_APP_SHA
# only after owner letter for E AND preservation proof
GRIN_OPS_ALLOW_LIVE=1 node docs/release/packets/grin-ops/grin-functions-op.mjs enable
```

which constructs, for each name in order
`grinRegisterGoodsReceipt` → `grinReconcileCommand` →
`grinMutateGoodsReceipt` → `grinReadGoodsReceipt` →
`grinReserveEvidence` → `grinBeginEvidenceUpload` →
`grinUploadEvidence`:

```bash
gcloud functions deploy NAME \
  --project=vyaamikk-diary \
  --region=asia-south1 \
  --gen2 \
  --update-env-vars=GRIN_GOODS_EVIDENCE_FUNCTIONS=true
```

Disable (helper wired path uses **`false`**, not remove):

```bash
GRIN_OPS_ALLOW_LIVE=1 node docs/release/packets/grin-ops/grin-functions-op.mjs disable
```

```bash
gcloud functions deploy NAME \
  --project=vyaamikk-diary \
  --region=asia-south1 \
  --gen2 \
  --update-env-vars=GRIN_GOODS_EVIDENCE_FUNCTIONS=false
```

`buildGcloudGateArgs(name, null)` would emit
`--remove-env-vars=GRIN_GOODS_EVIDENCE_FUNCTIONS` (absent key = off). That
argv is **not** what helper `disable` runs today. **`--remove-env-vars` is
an allowed rollback only after the same omitted-`--source` preservation is
proven.** Do not run remove as a shortcut around unproven gcloud.

Inspect `sourceOrigin=gcs` from firebase-created v2 `storageSource.bucket`
**allows** the helper to attempt the loop; it does **not** prove
preservation. Origin `local` or `unknown` **refuses** (cwd upload risk).
All seven must be **PRESENT**. Any UNKNOWN or ABSENT refuses enable/disable.

### What is proven vs not

| Claim | Status |
|---|---|
| Dotenv REPLACE on firebase-tools 14.20.0 | **Proven blocked** (SOURCE + in-process test) |
| Helper argv omits `--source` / `--set-env-vars` / `--clear-env-vars` | **Proven** (stub tests on combined helper) |
| `gcloud` omitted-`--source` preserves firebase-created gen2 source/secrets/ingress/SA/other keys | **UNPROVEN** — `gcloud` **ABSENT**. Do not claim proven. Do not enable live GRIN to obtain that evidence. Scratch/non-prod function created the same way remains the required evidence. Apply host must also record `gcloud version` (helper does not pin it). |

### E stop conditions

- Preservation UNPROVEN (current state) — **do not run**
- `gcloud` absent on the apply host
- Inspect UNKNOWN
- Mixed PRESENT/ABSENT, or any origin not `gcs`/`repo`
- CLI dotenv present
- Pin mismatch / dirty DEPLOYMENT_PATHS
- firebase CLI ≠ 14.20.0
- Live overrides set
- `GRIN_OPS_METHOD=firebase-dotenv`
- Mid-loop non-zero gcloud status (below)

### E mid-loop failure — **must not be described as rolled back**

The helper updates names **one-by-one**. First non-zero status throws.
Already-updated names **stay** updated. Temp session journal is **deleted**
in `finally` — record state by **inspect**, not by assuming PASS or
ROLLBACK.

Example: enable fails on the 4th name → names 1–3 may be `gate=on`, names
4–7 `gate=off` or unchanged. That is **mixed gate**, not a rollback.
**Stop.** Inspect. Do not claim rolled back. Do not re-run
`gate-off-initial`. Do not firebase-dotenv “to fix”.

In-scope recovery **after preservation is proven**: `disable` (or proven
`--remove-env-vars`) on names that are PRESENT **and** `gate=on`. Until
preservation is proven, mixed-gate recovery is a **separate packet**.

### E rollback of a **successful** enable (only after preservation proven)

1. Helper `disable` → `--update-env-vars=GRIN_GOODS_EVIDENCE_FUNCTIONS=false`, **or**
2. `--remove-env-vars=GRIN_GOODS_EVIDENCE_FUNCTIONS` (absent = off)

same omitted-`--source` constraint. Disable does **not** cancel in-flight
calls and does **not** stop Storage PUT of an already-reserved original
while D admission is still `allow`. Callable disable ≠ Storage-upload
disable ≠ data delete. Do not Editor-delete receipts.

---

## F — Synthetic smoke harness

Files already at:

- `docs/release/proposals/team1/grin-pilot-smoke.mjs` (gate + labels)
- `docs/release/proposals/team1/grin-pilot-smoke.injected.ts` (INJECTED)
- `docs/release/proposals/team1/grin-pilot-smoke.test.mjs`

`LIVE_BACKEND` is refused in source until E is proven **and** the owner
letters live smoke. This session does **not** flip
`liveBackendAdmission({ gcloudProven })` off its default `false`.

| Label | Command | Status |
|---|---|---|
| **INJECTED** | `node docs/release/proposals/team1/grin-pilot-smoke.mjs injected` (default) or `npx --yes tsx docs/release/proposals/team1/grin-pilot-smoke.injected.ts` | **Executable now** — synthetic data only; no live project |
| Gate / UID tests | `node --test docs/release/proposals/team1/grin-pilot-smoke.test.mjs` | **Executable now** |
| **EMULATOR** | `npm run test:goods-evidence-g1-functions-emulator` or `node …/grin-pilot-smoke.mjs emulator` inside `emulators:exec` | Existing EMULATOR coverage; **not** LIVE_BACKEND |
| **LIVE_BACKEND** | `node docs/release/proposals/team1/grin-pilot-smoke.mjs live` | **REFUSED** (exit 2) even with `GRIN_OPS_ALLOW_LIVE=1` / `GRIN_PILOT_SMOKE_LIVE=1` until E proven **and** owner letters live smoke |

### F case list (required; synthetic data only)

`SMOKE_SCENARIOS` in `grin-pilot-smoke.mjs`. INJECTED implements all eight.
LIVE (when later lettered) must run the **same** eight against
`asia-south1` / project `vyaamikk-diary` with **synthetic** ledger /
receipt / evidence ids only. Do not reuse production diary data.

| Case | Setup | Expected |
|---|---|---|
| **authenticated_success** | Admitted owner uid (D allow). Gate on for LIVE; INJECTED env exact `"true"`. Register a **new** synthetic receipt. | `ok=true`, `replayed=false`, `confirmed` present |
| **unauthenticated_denial** | `auth=null` register | `ok=false`, `code=unauthenticated` |
| **non_admitted_denial** | Authenticated uid with deny/missing/malformed admission | `ok=false`, `code=policy_denied` |
| **cross_owner_denial** | Other admitted uid reads owner receipt; other registers into owner ledger | read `forbidden` **or** `policy_denied` **or** `not_found`; register `forbidden` |
| **register_replay** | Same frozen commandId as authenticated_success | `ok=true`, `replayed=true`, same `issuedNumber` |
| **upload_verification** | reserve → begin → PUT reserved original → `grinUploadEvidence`. Client `claimedSha256` is a **claim**; verify **stored bytes**. | `ok=true`, `originalDurable=true`, `actualSha256` equals stored-byte sha256 |
| **confirmation** | Register and owner `grinReadGoodsReceipt` | `confirmed` on register/read (`receiptId`, events) |
| **read_export** | `assembleEvidencePackInputs` after verified original | `originalBytesBundled=false`; original **remains** in the blob store (do not bundle bytes; do not delete) |

INJECTED synthetic labels (`owner_pilot_inj`, `ledger_pilot`, …) are
**not** production UIDs and must **not** be written to live Firestore.

### F LIVE_BACKEND (would-run after E proof **and** owner letter; **not run**)

Still refused by `runLive()` today (`gcloudProven` default false). After E
is proven, a **later** Team 1 change may pass `gcloudProven: true` into
`liveBackendAdmission`. Until that change **and** the owner letter:

```bash
node docs/release/proposals/team1/grin-pilot-smoke.mjs live
```

exits **2** and must not call `asia-south1-vyaamikk-diary`.

Would-run (later; not this session):

```bash
unset GRIN_OPS_PINNED_SHA GRIN_OPS_ENDPOINT_FIXTURE GRIN_OPS_TEST_HANG GRIN_OPS_HTTP_STUB
GRIN_OPS_ALLOW_LIVE=1 GRIN_PILOT_SMOKE_LIVE=1 \
  node docs/release/proposals/team1/grin-pilot-smoke.mjs live
```

Preconditions for that later run:

1. E omitted-`--source` preservation **proven** (not merely inspect origin
   `gcs`)
2. Owner letters **live smoke** (separate from A–E)
3. C: all seven **PRESENT**
4. E: all seven `gate=on` (exact `"true"`)
5. D: owner-named UIDs admitted; file still outside git
6. Inspect complete; not UNKNOWN; unrelated still 39
7. Synthetic ids only; no production receipt mutation

### F stop conditions

- LIVE requested while E UNPROVEN — refuse (current harness)
- Owner has not lettered live smoke — refuse
- Inspect UNKNOWN; mixed PRESENT/ABSENT; mixed `gate=on`/`off`
- UID file inside repo / empty / parse fail
- Live overrides (`GRIN_OPS_PINNED_SHA`, fixtures, HTTP stubs, test-hang)
- Non-synthetic data / missing `confirmed` / hash mismatch on stored bytes
- Cross-owner unexpectedly succeeds
- Unauthenticated unexpectedly succeeds
- Pack bundles original bytes (`originalBytesBundled=true`)

### F data-preserving rollback (LIVE, if a later lettered run wrote)

- Do **not** Editor-delete receipts, serials, or Storage originals
- D rollback: same admission path `newCommands` / `reconciliation` **deny**
- E disable to `"false"` or proven `--remove-env-vars` (separate E rules)
- Leave Functions **PRESENT**
- A failed mid-case LIVE run is **not** “rolled back” until those deny /
  disable steps are verified by inspect + Admin get

---

## Owner letters requested

Owner may letter **A and B in one response** as two explicitly scoped
operations. Still two firebase commands, two verifications, two rollbacks.

1. **A** — exact Firestore command + hashes in A, after inspect still =
   `b13d5255…`.
2. **B** — exact Storage command + hashes in B, after inspect still =
   `1a912051…`. Not implied by A. Never
   `--only firestore:rules,storage`.
3. **C** — HOLD until coordinator pin of the **FINAL** candidate after
   billing correction + matching CI, then owner letter. Mixed-state resume
   not included. Do not pin `520f9f9` / `313025f` / `56f2040` / docs HEAD.
4. **D** — HOLD for writes until owner-named UIDs (private file). Grammar
   is ready. `PLAY_BILLING_TESTER_UIDS` is **not** lettered here.
5. **E** — **HOLD / UNPROVEN**. Do not letter enable until omitted-`--source`
   preservation is proven. Dotenv remains blocked.
6. **F LIVE_BACKEND** — **HOLD** until E is proven **and** a separate owner
   letter for live smoke. INJECTED is already executable.

IAM: no grant needed for this pilot; do not add roles to the shared Editor
SA.
