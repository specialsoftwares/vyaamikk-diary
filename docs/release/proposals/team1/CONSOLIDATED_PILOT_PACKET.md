# Team 1 consolidated restricted-pilot packet

**Not authorization.** This file does not set `GRIN_OPS_ALLOW_LIVE`. Do not
deploy from this session. Combined is coordinator-owned. Do not rewrite
`docs/release/packets/grin-ops/grin-functions-op.mjs`. Do not force-push
`origin/team/grin-t1-backend`.

A1 changes Firestore access rules only. It does not deploy Functions, change
Storage Rules/IAM, seed testers, enable GRIN, build the app, enable payments,
or submit to Play. Approval of any one scope below does **not** approve the
others. Never combine A1+A2 as one grant (`--only firestore:rules,storage`).

---

## Coordinates (this session, 2026-10-06)

| Item | Value |
|---|---|
| Team 1 worktree | `/Users/shivamsaurav/vyd-worktrees/grin-t1-backend` |
| Branch | `team/grin-t1-consolidated-1310` from `841f9c405cffb0c0e1a95fd883a3c46b27a228e3` |
| Combined (read-only) | `/Users/shivamsaurav/vyd-worktrees/grin-combined` observed `c45518a89a22ac3134e1b9e56f2c9ee97142ac1f` (docs after `998f303`; still empty vs application on `functions/src`) |
| T2 worktree (read-only) | `/Users/shivamsaurav/vyd-worktrees/grin-t2-evidence` `2cebe32a8a78dc1928c5abc984a29887ccf7a954` — `git diff --stat 56f2040 HEAD -- functions src eas.json app.json app firebase.json` **empty** |
| **Selected candidate SHA** | `56f2040e30159579edc0cbfbc88e2ba706a6abd2` — **must be retargeted** when T2 commits owner 1/3/10 GiB + 45-day grace (not committed on T2 at packet time; combined `c45518a` records the choice as docs only: “Source constants are not yet wired”) |
| Combined helper `PINNED_APP_SHA` | `520f9f98bc952fd7f30a907da9e85774629a69c0` — **STALE** vs candidate |
| This worktree helper | still `5d5df3d54df08953bfb26db39a9b7f5e3d67ed47` — **not rewritten** |
| Historical ops-guard 34/34 | `228a8f58ac83d3c71e853cdccb6e4c4fa64c251f` |
| Tooling successor | `0d7aa17a6efcf3ce6874269eb57afda0a2b45559` (`PINNED_APP_SHA=520f9f9`; not byte-identical to `228a8f5`) |
| Canonical CI | GHA **`37425360211`** covers `0d7aa17` / `520f9f9` **only**, **not** `56f2040` |
| `GRIN_OPS_ALLOW_LIVE` / `GRIN_OPS_PINNED_SHA` / `GRIN_OPS_EXPORT_DIR` | **unset** |
| firebase-tools | **14.20.0** |
| `gcloud` | **ABSENT** on this host |
| This worktree vs `56f2040` DEPLOYMENT_PATHS | **non-empty** — **not** an A3 apply host |
| Combined vs `56f2040` DEPLOYMENT_PATHS | **empty** (docs-only HEAD) |

Do **not** pin this packet’s helper constant to `56f2040` in git. T2’s owner
1/3/10 GiB + 45-day wiring will create a **new** application SHA. The proposed
one-line pin (Scope 3 / pin appendix) targets the **selected candidate** and
must be retargeted to T2’s application commit when that exists.

---

## Fresh inspect (RE-RUN this session)

```bash
unset GRIN_OPS_ALLOW_LIVE GRIN_OPS_PINNED_SHA GRIN_OPS_EXPORT_DIR PINNED_APP_SHA
node docs/release/packets/grin-ops/grin-functions-op.mjs inspect
```

No mutate. No `GRIN_OPS_EXPORT_DIR`. `live-export-2026-10-06/` mtimes and
sha256 **unchanged** after inspect (not overwritten).

| Check | Result |
|---|---|
| CLI user | `support.vyd@specialsoftwares.com` |
| Project | `vyaamikk-diary` / `982505811909` HTTP **200** `match=true` |
| Bucket | `vyaamikk-diary.firebasestorage.app` belongs HTTP **200** |
| Inventory | HTTP **200**, `complete=true`, `reason=ok`, `pages=1` |
| GRIN seven | **ABSENT** (`grin_all_absent=true`) |
| Unrelated asia-south1 | **39** |
| Runtime SA | `982505811909-compute@developer.gserviceaccount.com` `roles/editor` (residual) |
| Firestore DB IAM | HTTP **501** unsupported |
| Live Firestore sha256 | `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` **= baseline** |
| Live Storage sha256 | `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5` **= baseline** |
| Failed-inspection rule | HTTP 401/403/500, malformed JSON, invalid shape, incomplete pages → **UNKNOWN**, not ABSENT; **must not deploy** (helper tests re-run this session: 401/403/500/malformed/shape/interrupted pagination/HTTP 403 inspect) |
| Live overrides | live mode rejects `GRIN_OPS_PINNED_SHA` / endpoint fixture / `GRIN_OPS_TEST_HANG` before mutation (tests re-run this session) |

If a future inspect’s Firestore sha256 **differs** from `b13d5255…` or Storage
from `1a912051…`, **abort** the matching Rules packet. Re-export; re-merge; do
**not** overwrite `live-export-2026-10-06/` unless the new bytes are an
approved new baseline.

---

## Preservation proof (firebase-tools 14.20.0) — A6 remains UNPROVEN

Installed CLI: `firebase --version` → **14.20.0**. SOURCE inspection of
`$(dirname $(which firebase))/../lib/node_modules/firebase-tools`
(`lib/deploy/functions/prepare.js` `inferDetailsFromExisting` 197–217;
`lib/functions/env.js` `hasUserEnvs`). In-process confirmation this session:

```bash
node --test docs/release/proposals/team1/firebase-tools-14.20.0-infer-details.test.mjs
```

**PASS** (1/1). Proven properties:

| Property | Proven? | Evidence |
|---|---|---|
| Isolated `--config` paths resolve from `dirname(--config)` | YES (prior + this packet hashes) | 105-byte JSON loads `proposed-grin/*.rules`, not repo-root quota Rules |
| Create, no dotenv: new endpoint has no remote user env; gate key **absent** ⇒ off | YES | `inferDetailsFromExisting` `!haveE` → `continue`; `grinFunctionsEnabled` is exact `"true"` only |
| Re-deploy **without** dotenv on a PRESENT name **merges** remote user env (would preserve a remote `GRIN_GOODS_EVIDENCE_FUNCTIONS=true`) | YES | `usedDotenv=false` → `{...haveE.environmentVariables, ...wantE.environmentVariables}` |
| Re-deploy **with** any CLI dotenv **replaces** user env (remote-only keys dropped, including the gate) | YES | `usedDotenv=true` skips merge. **Firebase dotenv enable/disable is BLOCKED.** |
| Helper `gcloud` argv omits `--source` / `--set-env-vars` / `--clear-env-vars` | YES (argv only) | `gcloudArgsUnsafe`; `applyGcloudGateUpdate` is a **pure object transform**, not a live gcloud run |
| `gcloud functions deploy --gen2 --update-env-vars` **without** `--source` preserves source archive, secrets, ingress, runtime SA, and other user keys on a **firebase-created** gen2 callable | **UNPROVEN** | `gcloud` **ABSENT** here. Do not enable live GRIN to obtain that evidence. Scratch/non-prod function created the same way remains the required evidence. Official docs for GCS/repo origin do **not** prove firebase-CLI staging `storageSource` is treated as reusable GCS origin by this host’s (absent) gcloud. |

**A6 is refused.** Do not present omitted-`--source` gcloud as an executable
grant. Direct Cloud Run env edit is forbidden. Firebase dotenv is blocked.

---

## Scope selector (approve independently)

| Scope | Operation | Executable on paper? | Blocker if not |
|---|---|---|---|
| **1 — A1** | Isolated Firestore Rules only | **YES** (after owner grant + inspect still = baseline) | — |
| **2 — A2** | Isolated Storage Rules only | **YES** (separate grant; never with A1) | — |
| **3 — A3** | Seven Functions create, gate off | **HOLD** until coordinator pin-update to **selected candidate** (then retarget if T2 commits) + apply-host empty vs that SHA | Helper pin still `520f9f9`; this worktree is not the apply host; mixed-state resume is a **separate** packet |
| **4 — IAM** | Runtime identity | **Not required for this pilot** | Do **not** add roles to the shared Editor SA |
| **5 — Testers** | Admission writes + billing UID grammar | **YES** for format/validation; **HOLD** for writes until owner UIDs (private, not git) | Empty `PLAY_BILLING_TESTER_UIDS` already fail-closed in source |
| **6 — Gate** | Enable / disable | **UNPROVEN — REFUSED** | gcloud omitted-`--source` preservation unproven |
| **7 — Smoke** | Synthetic harness | **INJECTED YES now**; EMULATOR via existing script; **LIVE_BACKEND REFUSED** | LIVE needs proven A6 + owner UIDs + A3/A4; A6 unproven |

---

## Scope 1 — A1 Firestore Rules only

Working directory: **repository root**. firebase-tools **14.20.0**.

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

Isolated JSON keys: `firestore`, `storage` only — **no** `functions`. Never
`firebase deploy` from repo-root `firebase.json`. Never `--only firestore`
(indexes). Never `--only storage` (that is A2). Never `functions:grin*`.
`GRIN_OPS_ALLOW_LIVE` stays unset for this Rules path.

Delta vs live: **+55 / −0**. Billing-off matchers unchanged. Additive nested
matchers under `match /users/{uid}` only (admission owner-read; GRIN trees
active-user read; client CUD **false**). Admin SDK / Functions remain writers.

### A1 apply-time (owner grant later; **not run here**)

1. `GRIN_OPS_ALLOW_LIVE` unset. `firebase --version` is **14.20.0**. Cwd repo root.
2. Read-only inspect **without** `GRIN_OPS_EXPORT_DIR`. Live Firestore sha256 must
   still equal `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c`.
   If it matches, **do not** overwrite `live-export-2026-10-06/`.
3. Confirm isolated config + merged Firestore hashes (`shasum -a 256`).
4. Run the exact command above.
5. Re-inspect (no export overwrite unless recording a new approved live). Live
   Firestore sha256 **must** equal `551203b8…`. Release name remains
   `cloud.firestore`. Storage remains `1a912051…`. GRIN seven still **ABSENT**.
   Unrelated count still 39.
6. If live sha256 ≠ merged hash, **stop**. Roll forward. Do not retry from
   repo-root `firebase.json`.

### A1 rollback (data-preserving) — `live-export-2026-10-06`

That directory has `firestore.rules`, `storage.rules`, and `META.json`. It does
**not** currently contain `firebase.rules-only.json`. At rollback time, copy the
**same 105-byte JSON** into that directory **without** replacing
`firestore.rules` / `storage.rules` / `META.json`.

```bash
cp docs/release/rules-compat/proposed-grin/firebase.rules-only.json \
  docs/release/rules-compat/live-export-2026-10-06/firebase.rules-only.json
firebase deploy --project vyaamikk-diary --non-interactive \
  --config docs/release/rules-compat/live-export-2026-10-06/firebase.rules-only.json \
  --only firestore:rules
```

Do **not** add that JSON in this session. Do **not** delete receipts, serials,
or Storage objects. Do **not** use Editor delete. After rollback, live Firestore
sha256 must equal `b13d5255…` again. Storage must remain `1a912051…`.

---

## Scope 2 — A2 Storage Rules (separate grant)

Never `--only firestore:rules,storage` as one “A1” grant. Same isolated JSON,
**separate** command. firebase-tools **14.20.0**. Cwd repo root.

```bash
firebase deploy --project vyaamikk-diary --non-interactive \
  --config docs/release/rules-compat/proposed-grin/firebase.rules-only.json \
  --only storage
```

| Artifact | Bytes | sha256 |
|---|---|---|
| Isolated config (same as A1) | 105 | `d224b75385b451433e5c59bdbf0cc147697fbe88e773c11dab44f3b71e3e8a74` |
| Proposed merged Storage `proposed-grin/storage.rules` | 7942 | `6b8959929b86ac2eab41fc591dc1fbf5bb03b80a226226d43bf4c8e72391c76b` |
| Live baseline / rollback `live-export-2026-10-06/storage.rules` | 1133 | `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5` |
| Forbidden repo-root `storage.rules` | 1390 | `19fcc761dc8d5a923efb45ed589a598690bd3bb2159fab827f3ce30c17a60452` |

Delta vs live: **+177 lines**. Existing letterhead / attachments / pdfs matchers
stay. Additive GRIN paths:

- `users/{userId}/grinEvidence/{objectKey}/original`
- `users/{userId}/grinEvidence/{objectKey}/derivatives/{derivativeKey}`

Upload create is admission- and reservation-bound; update/delete **false**.

### A2 apply-time (owner grant later; **not run here**)

1. `GRIN_OPS_ALLOW_LIVE` unset. `firebase --version` **14.20.0**.
2. Inspect without `GRIN_OPS_EXPORT_DIR`. Live Storage sha256 must equal
   `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5`. If it
   differs, **abort**. Do not overwrite `live-export-2026-10-06/`.
3. Confirm hashes. Run the exact `--only storage` command.
4. Re-inspect. Live Storage sha256 **must** equal `6b895992…`. Firestore remains
   whatever A1 did or did not publish (`b13d5255…` or `551203b8…`). Storage
   release remains `firebase.storage/vyaamikk-diary.firebasestorage.app`. GRIN
   seven still **ABSENT**. Unrelated still 39.

### A2 rollback

```bash
cp docs/release/rules-compat/proposed-grin/firebase.rules-only.json \
  docs/release/rules-compat/live-export-2026-10-06/firebase.rules-only.json
firebase deploy --project vyaamikk-diary --non-interactive \
  --config docs/release/rules-compat/live-export-2026-10-06/firebase.rules-only.json \
  --only storage
```

After rollback, live Storage sha256 must equal `1a912051…`. Firestore remains
whatever it was. Do not Editor-delete objects.

---

## Scope 3 — A3 seven Functions, gate-off-initial

Region **`asia-south1`**, codebase `default`, project **`vyaamikk-diary`**.
Helper command (apply host **after** pin-update; **not this worktree**):

```bash
GRIN_OPS_ALLOW_LIVE=1 node docs/release/packets/grin-ops/grin-functions-op.mjs gate-off-initial
```

`--only` is exactly (no dotenv, no repo-root extra targets):

```text
functions:grinRegisterGoodsReceipt,functions:grinReconcileCommand,functions:grinMutateGoodsReceipt,functions:grinReadGoodsReceipt,functions:grinReserveEvidence,functions:grinBeginEvidenceUpload,functions:grinUploadEvidence
```

Equivalent firebase argv the helper constructs:

```bash
firebase deploy --project vyaamikk-diary --non-interactive \
  --only functions:grinRegisterGoodsReceipt,functions:grinReconcileCommand,functions:grinMutateGoodsReceipt,functions:grinReadGoodsReceipt,functions:grinReserveEvidence,functions:grinBeginEvidenceUpload,functions:grinUploadEvidence
```

Gate key **`GRIN_GOODS_EVIDENCE_FUNCTIONS`**. Absent on create ⇒
`grinFunctionsEnabled` false. Exact `"true"` is on; `"false"` / missing / `"1"` /
`"TRUE"` are off.

**Pin must match the selected candidate.** Combined helper is still `520f9f9`
(STALE). Proposed pin (unapplied, appendix) currently names `56f2040`. **Retarget
that one-liner to T2’s new application SHA when T2 commits 1/3/10 GiB + 45-day
grace.** Do not env-override (`GRIN_OPS_PINNED_SHA` is rejected in live mode).

Apply-host check after pin:

```bash
git diff --quiet <SELECTED_CANDIDATE_SHA> -- functions src eas.json app.json app firebase.json
```

Combined HEAD is empty vs `56f2040` today. This Team 1 worktree is **not**.

Preconditions from inspect (complete inventory required; this session: all seven
**ABSENT**, unrelated 39, project/bucket match). Failed inspect = **UNKNOWN**,
not ABSENT — **must not deploy**. Any PRESENT name refuses `gate-off-initial`
(no-dotenv merge would preserve a remote gate-on key).

A3 does not change Rules, IAM, testers, or enable the gate.

### A3 post-create verification (later; **not run**)

Re-inspect without `GRIN_OPS_EXPORT_DIR`. Require all seven **PRESENT**, each
`gate=off`, unrelated ids still the same 39, runtime SA still the default
Compute SA, secret binding **count** recorded (values never printed).

### A3 rollback / mixed state (not this grant)

| Situation | In-scope | Forbidden |
|---|---|---|
| Create succeeded; enable not done | Leave seven PRESENT, gate off. Callables exist and deny. That **is** A3 success. | Delete the seven; delete serials/receipts/originals; Editor delete |
| Mixed PRESENT/ABSENT | `inspect` until complete. Record each name PRESENT / ABSENT / UNKNOWN. **Stop.** | Blind all-seven retry; treat UNKNOWN as ABSENT |
| Inspect UNKNOWN | UNKNOWN, not ABSENT. Do not deploy. Re-inspect until complete. | Infer absence from a failed list |
| Mixed-state resume | **Separate packet.** Planner `docs/release/proposals/team1/grin-functions-absent-only.mjs` is **not wired**. Helper has **no** `functions:delete`. | Wiring `create-absent-only` into `grin-functions-op.mjs` from this file |

---

## Scope 4 — IAM (not required for this pilot)

Actual runtime SA (inspect this session):

`982505811909-compute@developer.gserviceaccount.com` already has **`roles/editor`**
(residual: `storage_delete=true`, `editor_residual_delete=true`). Identity /
email / deletion / billing share that principal.

**Do not “fix” by adding more roles.** Do not tighten Editor as a pilot change.

A **scoped GRIN SA**
`grin-functions@vyaamikk-diary.iam.gserviceaccount.com` is **not required** for
this restricted pilot (Functions still ABSENT; gate stays off; Editor already
runs existing callables). Name it only if a later public least-privilege packet
binds the seven GRIN gen2 functions after they exist. Residual even then:
`roles/datastore.user` on `(default)` is database-wide (no document-path cage).
GCS prefix conditions must be read back on apply. **No**
`storage.objects.delete` / objectAdmin.

Proposal (still unapplied, not this grant):
`docs/release/proposals/unapplied/GRIN_RUNTIME_IDENTITY_PROPOSAL.md`.

---

## Scope 5 — Tester admission (UIDs private; none invented)

Two different lists. Do not mix them.

### 5a. GRIN admission (Admin write; not a Rules deploy)

A1 only allows **owner read** of `goodsEvidenceAdmission`; client CUD stay
**false**. Seeding is an Admin SDK / console write.

Path: `users/{uid}/goodsEvidenceAdmission/runtime`

```json
{ "schemaVersion": 1, "newCommands": "allow", "reconciliation": "allow" }
```

Malformed (`newCommands: "ALLOW"`, missing `schemaVersion: 1`) parses as no
policy ⇒ `policy_denied`. Rollback (data-preserving, per named uid):

```json
{ "schemaVersion": 1, "newCommands": "deny", "reconciliation": "deny" }
```

Do not Editor-delete the document if receipts may exist.

**Owner supplies Firebase Auth UIDs privately (not in git).** Empty owner list
⇒ **fail-closed** (write nothing; admit nobody). Do not invent UIDs.

Input format (validator:
`docs/release/proposals/team1/grin-pilot-smoke.mjs` `parseFirebaseAuthUids`):

- One UID per line, or comma-separated. `#` comments allowed.
- Trim whitespace. Drop empty tokens.
- Each UID: Firebase Auth id, **1–128** of `[A-Za-z0-9_-]` (console ids are
  typically 28 alphanumeric). Reject emails (`@`), `/`, whitespace inside,
  `.` / `..` path tokens.
- Duplicates collapsed. Values **never printed** by the harness.
- File must live **outside** the git worktree.

```bash
node docs/release/proposals/team1/grin-pilot-smoke.mjs validate-uids /absolute/path/outside/repo/uids.txt
```

Prints `count=` only. Empty file ⇒ fail-closed.

Not Play licence testers. Not Internal-track membership.

### 5b. `PLAY_BILLING_TESTER_UIDS` (already in source; fail-closed)

Env: comma-separated Firebase Auth UIDs
(`functions/src/billing/google/playConstants.ts`). Empty / absent / whitespace
-only ⇒ empty set ⇒ **deny every caller**. Invalid tokens fail closed (do not
silently drop). This packet does **not** set that env and does **not** invent
billing UIDs. Billing enablement (`PLAY_BILLING_ENABLED === "true"`) is **out of
scope**.

---

## Scope 6 — Enable / disable GRIN gate — UNPROVEN, REFUSED

Env key: **`GRIN_GOODS_EVIDENCE_FUNCTIONS`**. On = exact `"true"`. Rollback
target = **absent** or `"false"` (both off). `"1"` / `"TRUE"` are off.

**Intended later method (NOT a grant; NOT executable):** helper `enable` /
`disable` would loop gcloud `--update-env-vars=GRIN_GOODS_EVIDENCE_FUNCTIONS=true|false`
without `--source` on the seven names, only after inspect origin `gcs` or
`repo`. That preservation property on a firebase-created gen2 callable is
**UNPROVEN**. This packet **refuses** that operation.

Proven-safe related facts:

- **A3 create with key absent** is the supported gate-off initial (Scope 3),
  after pin + owner grant.
- **Firebase dotenv enable/disable is BLOCKED** (14.20.0 replace, not
  update-one-key).
- Origin `local` would refuse (cwd upload) **if** A6 were ever proven.
- `--source` / `--set-env-vars` / `--clear-env-vars` are rejected by
  `gcloudArgsUnsafe`.
- Mid-loop gcloud failure would leave already-updated names updated and delete
  the temp journal — another reason not to run an unproven loop.

Do not enable live GRIN to obtain gcloud evidence. Do not set
`GRIN_OPS_ALLOW_LIVE=1` from this file.

---

## Scope 7 — Smoke harness (written now; LIVE gated)

| Label | Command | Status |
|---|---|---|
| **INJECTED** | `node docs/release/proposals/team1/grin-pilot-smoke.mjs injected` (default) or `npx --yes tsx docs/release/proposals/team1/grin-pilot-smoke.injected.ts` | **PASS this session** — synthetic data only |
| Gate / UID tests | `node --test docs/release/proposals/team1/grin-pilot-smoke.test.mjs` | **PASS** 6/6 |
| **EMULATOR** | `npm run test:goods-evidence-g1-functions-emulator` (includes `production-compose.gates.emulator.test.ts`) or `node …/grin-pilot-smoke.mjs emulator` inside `emulators:exec` | Existing EMULATOR coverage; **not** LIVE_BACKEND |
| **LIVE_BACKEND** | `node …/grin-pilot-smoke.mjs live` | **REFUSED** (exit 2) — A6 UNPROVEN; even with `GRIN_OPS_ALLOW_LIVE=1` / `GRIN_PILOT_SMOKE_LIVE=1` |

Scenarios (synthetic INJECTED this session): authenticated success,
unauthenticated denial, non-admitted denial, cross-owner denial, register
replay, upload verification (stored-byte hash; client hash is a claim),
confirmation (`confirmed` on register/read), read/export
(`assembleEvidencePackInputs` `originalBytesBundled: false`; original remains
in the blob store).

LIVE_BACKEND execution stays gated on an **approved pilot** after A3 + owner
A4 UIDs + a **proven** A6. Until then the harness refuses rather than calling
`asia-south1-vyaamikk-diary`. Do not invent tester UIDs for live.

---

## Proposed helper pin (unapplied; do not rewrite the helper in this commit)

Current combined constant:

```js
export const PINNED_APP_SHA = "520f9f98bc952fd7f30a907da9e85774629a69c0";
```

Selected candidate **today**: `56f2040e30159579edc0cbfbc88e2ba706a6abd2`.
**Must be retargeted** to T2’s application SHA when
`/Users/shivamsaurav/vyd-worktrees/grin-t2-evidence` has a non-empty
DEPLOYMENT_PATHS diff vs `56f2040` (owner 1/3/10 GiB + 45-day grace). Do not
pin combined docs HEAD. Do not pin `520f9f9`. Do not pin `b845e8a`. Do not
apply this from Team 1.

```diff
--- a/docs/release/packets/grin-ops/grin-functions-op.mjs
+++ b/docs/release/packets/grin-ops/grin-functions-op.mjs
@@ -24,7 +24,7 @@ import { createHash } from "node:crypto";
 
 const require = createRequire(import.meta.url);
 
-export const PINNED_APP_SHA = "520f9f98bc952fd7f30a907da9e85774629a69c0";
+export const PINNED_APP_SHA = "56f2040e30159579edc0cbfbc88e2ba706a6abd2";
 export const PROJECT_ID = "vyaamikk-diary";
```

After coordinator apply (on combined, after Team 5 pass on the **then-current**
candidate): `unset GRIN_OPS_ALLOW_LIVE GRIN_OPS_PINNED_SHA PINNED_APP_SHA; node --test docs/release/packets/grin-ops/grin-functions-op.test.mjs` must be **34/34**, including UNKNOWN ≠ ABSENT and live override rejections. Canonical CI `37425360211` does **not** cover `56f2040`.

---

## Owner grants requested (separately)

1. **A1** — exact Firestore command + hashes in Scope 1, after inspect still = `b13d5255…`.
2. **A2** — exact Storage command + hashes in Scope 2, after inspect still = `1a912051…`. Not implied by A1.
3. **A3** — HOLD until pin-update to the selected (possibly retargeted) candidate. Mixed-state resume not included.
4. **IAM** — no grant needed for this pilot.
5. **Testers** — HOLD for writes until owner-named UIDs (private file). Grammar is ready.
6. **Gate enable/disable** — **REFUSED / UNPROVEN**.
7. **LIVE_BACKEND smoke** — **REFUSED** until A6 is proven and A3/A4 exist. INJECTED harness is already executable.
