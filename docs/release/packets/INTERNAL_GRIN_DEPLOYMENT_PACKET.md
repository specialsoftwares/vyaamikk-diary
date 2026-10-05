# Internal GRIN — operational preflight packet (not authorization)

Do **not** execute live deploy, Rules/IAM/env writes, tester seeding, main
merge, EAS/native build, OTA, Play writes, or billing activation from this
packet. Encrypted PDF backup stays backlog. Public pricing, storage caps, and
account-deletion/GRIN retention remain **unset** (Packet D). Internal evidence
stays synthetic while retention is unset.

This revision replaces the earlier bare
`gcloud functions deploy … --update-env-vars=…` loop. That command is a
Functions **deploy**, not a config-only operation.

Team 5 source-wiring review (application, not this packet):
`docs/release/proposals/team5/INTERNAL_GRIN_SOURCE_WIRING_REVIEW.md`.
Team 5 packet-only review:
`docs/release/proposals/team5/INTERNAL_GRIN_PREFLIGHT_PACKET_REVIEW.md`.
Wave 2 is **not** accepted. Not G6.

---

## 1. Frozen source and CI

| Ref | Value |
|---|---|
| Branch | `integration/grin-g1-g5-source` (draft PR #31) |
| **Application SHA** (CI-validated) | `5d5df3d54df08953bfb26db39a9b7f5e3d67ed47` |
| Application parent | `29c6b71` (docs) ← `4409366` (wiring) ← `3b030c9` |
| Merge-base / `origin/main` | `0da2f58970f23c7ce6cbefae6efffd49c731f44b` |
| Confirmation-refresh (preserved) | `dcc325a9fb0d0094ab8bc05cc7ea3d27a7e2ab7a` |
| Admin config resolution (preserved) | `4aac867af015d83f6ec3badb0748ff3b4bcc1a22` |
| Canonical CI | run **`37351685421`**, job **`111903806888`**, `ci:verify` **success** on `5d5df3d` |
| Do **not** reuse | failed run `37344993645`; earlier-head runs `37337067895`, `37330701057` |
| **Docs-only SHA** | the commit on this branch that contains this packet revision; distinct from `5d5df3d`. Record `git rev-parse HEAD` after it lands. Do not treat that SHA as application CI. |

`app.json` remains version **1.0.0** / `android.versionCode` **23** (unreserved).
`eas.json` `internal-grin` has both GRIN visibility flags `"1"` and
`EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` / `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED`
`"0"`. Ordinary `production` / `preview` stay GRIN-off.

Pin Functions source to application `5d5df3d`. A later docs-only HEAD is
acceptable **only if** this is empty:

```bash
git diff --stat 5d5df3d54df08953bfb26db39a9b7f5e3d67ed47 -- \
  functions src eas.json app.json app firebase.json
```

---

## 2. Tooling (this workstation, 2026-10-05)

| Tool | Version / note |
|---|---|
| firebase-tools | **14.20.0** (`firebase --version`; same pin as `.github/workflows/ci.yml`) |
| Node | v20.19.4 |
| gcloud | **not installed** on this workstation |

Apply-host must re-record `firebase --version` (require 14.20.0 or a later
owner-reviewed pin) immediately before any authorized deploy.

**Functions working directory:** repository root (the `firebase.json` that
names codebase `default` / source `functions/`).

**Rules working directory:** repository root, with `--config` pointing at the
isolated file in §4. firebase-tools 14.20.0
`detectProjectRoot(--config)` sets the project directory to the config file's
directory, so Rules paths resolve next to the merged artifacts — not to
repo-root quota Rules.

Official env docs used:
https://firebase.google.com/docs/functions/config-env
(file-based dotenv; parameterized `defineString` is recommended by Firebase
but would be an **application** change — out of scope here).

Official gcloud source-selection (why it is not the method):
https://cloud.google.com/sdk/gcloud/reference/functions/deploy
`--source` omitted: new function uses **cwd**; previously local-path source
updates from **cwd**; previously GCS/repo source is left unchanged. That is
still `gcloud functions deploy` (a new revision), cwd-sensitive, and does not
pin `5d5df3d`. Direct Cloud Run env edits are not used.

---

## 3. Gate-off Functions deploy (rebuild of seven callables)

This is a **Firebase CLI redeploy** of seven 2nd-gen `onCall` services from
the pinned application source. It is not config-only.

Target: project **`vyaamikk-diary`** (number `982505811909` — last live read
2026-10-01; **not** re-confirmed this session), region **`asia-south1`**,
codebase **`default`**, entry `functions/lib/index.js` after predeploy
`npm --prefix "$RESOURCE_DIR" run build`. Storage bucket last recorded:
**`vyaamikk-diary.firebasestorage.app`**. Do **not** deploy
`tools/goods-evidence-emulator/functions-entry`.

Exports (lazy `productionExports`; fail-closed Admin):
`grinRegisterGoodsReceipt`, `grinReconcileCommand`, `grinMutateGoodsReceipt`,
`grinReadGoodsReceipt`, `grinReserveEvidence`, `grinBeginEvidenceUpload`,
`grinUploadEvidence`.

Global options already in this codebase (`cpu: gcf_gen1`, `concurrency: 1`,
`maxInstances: 3`) apply. Adding seven services increases regional CPU
reservation; if asia-south1 total-CPU quota blocks rollout, raise quota or
lower `maxInstances` in a later approval — do not silently drop identity
functions.

Identity/email/deletion/billing stay on their current revisions because
`--only` lists only the seven names. Those callables bind `defineSecret`
email secrets; GRIN `onCall` does not list `secrets`.

### 3.1 Preflight so the resolved deploy does **not** supply `GRIN_GOODS_EVIDENCE_FUNCTIONS=true`

firebase-tools 14.20.0 loads, from `functions/`, any of:

1. `.env`
2. `.env.vyaamikk-diary` (project id)
3. `.env.production` (`.firebaserc` alias `production`)

It does **not** load `.env.example`. Having **both** `.env.vyaamikk-diary` and
`.env.production` is a CLI error.

Those files are included in **every function deployed in that command**
(official config-env). `functions/.env*` except `.env.example` are gitignored.
This worktree on 2026-10-05: only `functions/.env.example` exists;
`GRIN_GOODS_EVIDENCE_FUNCTIONS` is **absent** from it.

Before the gate-off deploy, on the apply host (print **presence only**, never
file bodies or other keys):

```bash
cd /path/to/vyaamikk-diary   # repo root at application 5d5df3d
python3 - <<'PY'
import os
from pathlib import Path
base = Path("functions")
key = "GRIN_GOODS_EVIDENCE_FUNCTIONS"
names = [".env", ".env.vyaamikk-diary", ".env.production", ".env.local"]
for name in names:
    p = base / name
    if not p.exists():
        print(f"{name}: ABSENT")
        continue
    exact_true = False
    present = False
    for raw in p.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k.strip() == key:
            present = True
            if v.strip().strip('"').strip("'") == "true":
                exact_true = True
    print(f"{name}: present=yes GRIN_key={present} exact_true={exact_true}")
    if exact_true:
        raise SystemExit("REFUSE: gate-off deploy would supply GRIN_GOODS_EVIDENCE_FUNCTIONS=true")
print("gate-off env check: PASS")
PY
```

Abort if `exact_true` is true. Do not print environment contents.

If the CLI prints `Loaded environment variables from …` during deploy, that
line must not include a file that earlier checked `exact_true`.

### 3.2 Gate-off command (later authorization only)

```bash
cd /path/to/vyaamikk-diary
test "$(git rev-parse HEAD)" = "5d5df3d54df08953bfb26db39a9b7f5e3d67ed47" \
  || git diff --quiet 5d5df3d54df08953bfb26db39a9b7f5e3d67ed47 -- \
       functions src eas.json app.json app firebase.json
firebase --version   # expect 14.20.0
firebase deploy --project vyaamikk-diary --non-interactive --only \
functions:grinRegisterGoodsReceipt,\
functions:grinReconcileCommand,\
functions:grinMutateGoodsReceipt,\
functions:grinReadGoodsReceipt,\
functions:grinReserveEvidence,\
functions:grinBeginEvidenceUpload,\
functions:grinUploadEvidence
```

Do **not** create `functions/.env` / `.env.vyaamikk-diary` / `.env.production`
for this step.

Smoke after this step (still not authorization): unauthenticated →
`unauthenticated`; authenticated non-seeded uid → `policy_denied`.
`"1"` and `"TRUE"` remain deny. Do not seed testers at this step.

---

## 4. Isolated Rules deployment configuration (undeployed)

Repo-root `firebase.json` still points at quota `firestore.rules` /
`storage.rules` plus functions. **Do not change it** as a shortcut. Do **not**
deploy repo-root quota Firestore (`233b05b7…`).

Isolated config (no `functions`, no indexes, no hosting):

`docs/release/rules-compat/proposed-grin/firebase.rules-only.json`

firebase-tools 14.20.0 with `--config` that file: project directory becomes
`docs/release/rules-compat/proposed-grin/`, so `firestore.rules` /
`storage.rules` in the JSON are the **merged** files in that folder (verified
with `Config.load` this session: `has functions false`; resolved paths are
the proposed-grin artifacts, not repo-root).

| Artifact | sha256 | Role |
|---|---|---|
| Isolated config `firebase.rules-only.json` | `d224b75385b451433e5c59bdbf0cc147697fbe88e773c11dab44f3b71e3e8a74` | Rules-only Firebase CLI config |
| `proposed-grin/firestore.rules` | `551203b8b11991fc1d49d42aa6a818fedeca8530654f7505de949b62a1ae298b` | Additive GRIN + live-compat diary/save |
| `proposed-grin/storage.rules` | `6b8959929b86ac2eab41fc591dc1fbf5bb03b80a226226d43bf4c8e72391c76b` | Additive GRIN + letterhead/PDF |
| Last **successful** live Firestore bytes (2026-10-01 export) / `proposed/firestore.rules` | `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` | Merge **base**; not a 2026-10-05 live re-export |
| Last **successful** live Storage bytes (2026-10-01 export) / `proposed/storage.rules` | `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5` | Merge **base**; not a 2026-10-05 live re-export |
| Repo-root `firestore.rules` | `233b05b7b810b484171257f4dafe78fd0fdea5762ed6848cf8b49cd327fd58cc` | Quota copy — **do not deploy** |
| Repo-root `storage.rules` | `19fcc761dc8d5a923efb45ed589a598690bd3bb2159fab827f3ce30c17a60452` | Not the live-compat base |

Emulator: `npm run test:live-rules-grin-merged` is the merged-file check.
Not a live deploy.

**Later-authorized Rules command** (after a successful live re-export and
hash compare; one product at a time is still allowed):

```bash
cd /path/to/vyaamikk-diary
shasum -a 256 docs/release/rules-compat/proposed-grin/firebase.rules-only.json \
  docs/release/rules-compat/proposed-grin/firestore.rules \
  docs/release/rules-compat/proposed-grin/storage.rules
firebase deploy --project vyaamikk-diary --non-interactive \
  --config docs/release/rules-compat/proposed-grin/firebase.rules-only.json \
  --only firestore:rules,storage
```

Use `--only firestore:rules,storage` (not `--only firestore`, which would
include indexes). `--project vyaamikk-diary` is required: the isolated
config's directory has no `.firebaserc`.

Always `--project vyaamikk-diary`, never the alias alone, when using this
`--config`.

---

## 5. Read-only live preflight (2026-10-05) — **blocked**

One probe, not retried:

| Check | Result |
|---|---|
| `firebase login:list --non-interactive` | Logged in as `support.vyd@specialsoftwares.com` |
| `firebase projects:list --non-interactive` | exit 2: credentials no longer valid; `firebase login --reauth` required |
| Project `vyaamikk-diary` / number `982505811909` | **not** re-confirmed |
| Bucket `vyaamikk-diary.firebasestorage.app` membership | **not** re-confirmed |
| Runtime service account + IAM | **not** read |
| Fresh Firestore/Storage releases, ruleset IDs, timestamps, SHA-256 | **not** exported |

No credentials, refresh tokens, or OTPs were requested in chat. `gcloud` is
not on this workstation.

**Owner login action (once):** on the machine that already has the Firebase
CLI user `support.vyd@specialsoftwares.com` (or the Cloud owner account that
can access `vyaamikk-diary`), run `firebase login --reauth` in that terminal.
Complete the browser/Google login there. Then a later assignment can
re-export releases/rulesets and read the runtime SA.

Until that succeeds, treat 2026-10-01
`docs/release/rules-compat/live-export-2026-10-01/META.json` as the last
**successful** live export, not as today's live state. On-disk
`proposed/firestore.rules` and `proposed/storage.rules` still hash to the
§4 base table; that is a disk check, not a live re-export.

After a successful re-export: compare SHA-256 to the §4 base table. If they
differ, inspect the drift and preserve unrelated live diary/save/PDF
behaviour; do **not** overwrite live with the October 1 files and do **not**
deploy repo-root quota Firestore. Recopy GRIN matchers onto the **fresh**
live bytes, emulator-test, then use the isolated config. Capture the fresh
export (release IDs, ruleset IDs, timestamps, hashes) as the rollback
artifacts — **do not** hardcode October 1 ruleset IDs
`a19b4a83-8b3e-4cf5-b8b8-e8d26e9704f9` /
`a2a0ddf7-9746-4dd2-bd48-29c9abc0e41f` as the universal rollback target.

Proposed runtime identity (from the existing unapplied matrix; **not** live
this session): reuse the asia-south1 Functions runtime SA that already serves
identity/deletion/billing. Do not add `storage.objects.delete` or
`storage.admin` on first export. Do not add App Check only on GRIN. Firestore
Admin remains database-level `roles/datastore.user` on `(default)` — residual
Admin read/write of diary documents. Full matrix:
`docs/release/proposals/unapplied/IAM_PERMISSION_MATRIX.md`.

---

## 6. Enablement and disablement (later approval; seven-function **redeploy**)

Method: Firebase CLI 14.20.0, same `--only` list as §3.2, same pinned
application source. Env is applied from dotenv at deploy time.

firebase-tools 14.20.0 `inferDetailsFromExisting` (prepare.js):

- **No** loaded dotenv (`functions/.env` / `.env.<projectId>` /
  `.env.<alias>` absent): existing Cloud Run env on a function **merges
  forward** on redeploy.
- **Any** of those dotenv files present: env on the functions **being
  deployed** is taken from dotenv + Firebase reserved vars; previous user
  env on those instances is **not** merged.

Therefore:

| Intent | Do this | Do **not** do this |
|---|---|---|
| First export, gate **off** | §3.2 with **no** dotenv | Create `.env.vyaamikk-diary` with `=true` |
| Later **enable** (A on) | Ephemeral dotenv `=true`, redeploy the seven, **delete** the dotenv | Bare `gcloud functions deploy --update-env-vars`; Cloud Run env edit |
| Later **disable** callables (A off) | Ephemeral dotenv with a value **other than** `true`, redeploy the seven, **delete** the dotenv | Redeploy the seven with **no** dotenv hoping the key disappears (merge would **keep** `true`) |

Parameterized `defineString` would pin at deploy-prompt time; it is an
application change and is not this method.

`firebase.json` functions `ignore` does not list `.env`. An ephemeral dotenv
left in `functions/` can be zipped into that revision's source archive. It is
a gate flag, not a secret; still delete the file immediately after deploy.

Do not copy `functions/.env.example` to `.env` for these operations (that
would mark the codebase as dotenv-using and replace env on deployed
endpoints).

Do not set the GRIN key on identity/email/deletion/billing. Using `--only`
the seven names is what keeps those services off this command. A later
`firebase deploy --only functions` (all functions) **while** a GRIN dotenv
exists would attach that key to **every** function in the deploy and would
replace their user env — never leave the ephemeral file on disk.

### 6.1 Enable (A on) — still a rebuild

```bash
cd /path/to/vyaamikk-diary
# same SHA pin as §3.2
printf 'GRIN_GOODS_EVIDENCE_FUNCTIONS=true\n' > functions/.env.vyaamikk-diary
# refuse if functions/.env or functions/.env.production also exist
test ! -e functions/.env && test ! -e functions/.env.production
firebase deploy --project vyaamikk-diary --non-interactive --only \
functions:grinRegisterGoodsReceipt,\
functions:grinReconcileCommand,\
functions:grinMutateGoodsReceipt,\
functions:grinReadGoodsReceipt,\
functions:grinReserveEvidence,\
functions:grinBeginEvidenceUpload,\
functions:grinUploadEvidence
rm -f functions/.env.vyaamikk-diary
```

CLI should report loaded env from `.env.vyaamikk-diary` only. Then delete the
file so a future full functions deploy **without** dotenv **merges** and
keeps gate-on on the seven plus existing env on identity functions.

### 6.2 Disable callables (A off) — still a rebuild

```bash
cd /path/to/vyaamikk-diary
printf 'GRIN_GOODS_EVIDENCE_FUNCTIONS=false\n' > functions/.env.vyaamikk-diary
test ! -e functions/.env && test ! -e functions/.env.production
firebase deploy --project vyaamikk-diary --non-interactive --only \
functions:grinRegisterGoodsReceipt,\
functions:grinReconcileCommand,\
functions:grinMutateGoodsReceipt,\
functions:grinReadGoodsReceipt,\
functions:grinReserveEvidence,\
functions:grinBeginEvidenceUpload,\
functions:grinUploadEvidence
rm -f functions/.env.vyaamikk-diary
```

`false` is not `"true"` → `grinFunctionsEnabled` is deny. Deleting the seven
functions is not required. Do not delete receipts, serials, or Storage
objects.

### 6.3 Post-operation verification (no env dump)

If `gcloud` exists on the apply host, print **only** on/off:

```bash
WANT=off python3 - <<'PY'
import json, os, subprocess
names = [
  "grinRegisterGoodsReceipt","grinReconcileCommand","grinMutateGoodsReceipt",
  "grinReadGoodsReceipt","grinReserveEvidence","grinBeginEvidenceUpload",
  "grinUploadEvidence",
]
want_on = os.environ.get("WANT") == "on"
bad = 0
for name in names:
    p = subprocess.run(
        ["gcloud","functions","describe",name,"--project=vyaamikk-diary",
         "--region=asia-south1","--gen2","--format=json"],
        capture_output=True, text=True,
    )
    if p.returncode != 0:
        print(name, "DESCRIBE_FAIL")
        bad += 1
        continue
    env = (json.loads(p.stdout).get("serviceConfig") or {}).get("environmentVariables") or {}
    gate_on = env.get("GRIN_GOODS_EVIDENCE_FUNCTIONS") == "true"
    print(name, "GATE=on" if gate_on else "GATE=off")
    if gate_on != want_on:
        bad += 1
print("verify", "PASS" if bad == 0 else "FAIL")
raise SystemExit(bad)
PY
```

For enablement verification, run the same script with `WANT=on`.

Do not print other keys or secret names/values.

Without gcloud: callable smoke still cannot distinguish gate-off from
not-admitted (`policy_denied` both ways). Use describe, or an admitted tester
**after** a separate seed approval.

---

## 7. Disablement surfaces (A vs B vs C)

| ID | Intent | Mechanism | What it does **not** do |
|---|---|---|---|
| **A** | Stop GRIN **callable** processing | §6.2 seven-function redeploy so the env is not exactly `"true"` | Does not cancel in-flight invocations. Does not stop a client Storage **PUT** of an already-reserved original while admission is still `newCommands=allow`. Stops `grinReadGoodsReceipt` / reconcile through callables. |
| **B** | Stop **new client Storage uploads** | Separately authorized write of `newCommands: "deny"` on **exactly** the admitted tester documents `users/{uid}/goodsEvidenceAdmission/runtime` (`schemaVersion: 1`). Storage Rules `admissionAllowsNewCommands` require `'allow'`. Owner supplies UIDs; do not invent them. | Does not delete objects. Retained-original **GET** remains allowed when `isRetainedOriginalState` (uploaded_unverified / verified / linked) even if `newCommands` is deny. Not a Functions env change. |
| **C** | Preserve stored receipts, serials, originals | Do nothing destructive. No `storage.objects.delete`. No Firestore delete of GRIN trees. No functions delete required. | — |

A and B are **independent**. Emergency “stop new bytes landing” needs **B**
(plus A if callables must deny). Ordinary Internal-test pause of processing
is **A**.

Limits to record, not promise around:

- Gate-off (A) prevents receipt **reads/reconciliation through the callables**.
- Retained-original Storage access is **not** equivalent to full app
  read/export (no diary/PDF/pack via Storage GET of GRIN originals).
- In-flight requests are not cancelled.
- Rollback is disable + Rules roll-forward to the **pre-deploy export
  captured at apply time**, not data deletion.

Client: ordinary `production` / `preview` AABs stay GRIN-off. An Internal-GRIN
AAB can be unpublished from Internal Testing without wiping server data.

---

## 8. Tester admission / ledger (owner-supplied UIDs only)

Do **not** invent Firebase UIDs. Not authorized in this assignment.

For each owner-named uid only, after gate-off Functions exist and merged
Rules are live (separate approvals):

```
users/{uid}/goodsEvidenceAdmission/runtime
  { "schemaVersion": 1, "newCommands": "allow", "reconciliation": "allow" }

users/{uid}/goodsEvidenceLedgers/{ledgerId}
  { "ownerUid": "{uid}", "status": "active" }
```

Everyone else: omit admission or set both fields to `"deny"`. Client flags
are not backend auth. Reviewer phone `+91 9000000000` is not GRIN admission
unless that Auth uid is explicitly seeded.

---

## 9. First-apply order (each step its own later approval)

1. Owner `firebase login --reauth`; re-export live Rules; compare to §4 base.
2. Capture that export as rollback artifacts (release IDs, ruleset IDs,
   timestamps, SHA-256).
3. Deploy merged Firestore Rules, then Storage Rules, via §4 isolated config.
4. Deploy the seven functions **gate off** (§3).
5. Seed named testers (§8).
6. Enable A (§6.1) only when smoke is authorized.
7. Synthetic-data smoke only. No production customer data.

---

## 10. Proposed Internal-GRIN AAB (not started)

```bash
# NOT authorized
eas build --profile internal-grin --platform android --non-interactive
```

`android.versionCode` **23** is **not reserved**. Recheck Play bundles
immediately before selecting a code (last read-only inventory 2026-10-01:
Internal Testing vc22 Active; 23 absent).

---

## 11. Owner decision list (unchanged)

- Public GRIN pricing; commercial storage caps; account-deletion / GRIN
  retain-or-purge (`functions/src/deletion` still has no GRIN paths);
  encrypted PDF backup; billing / public Play / merge to `main`.

Do not claim a quota or deletion policy has been chosen.

---

## 12. Smallest next owner action

**Not a live mutation. Not deploy approval.**

On the Firebase CLI machine: `firebase login --reauth` as
`support.vyd@specialsoftwares.com` (or the account that owns
`vyaamikk-diary`), then stop. A later assignment re-exports project number,
bucket, runtime SA/IAM, and Rules releases.

Do **not** approve from this packet: Functions deploy, Rules deploy,
enablement, admission writes, EAS, Play, billing, or `main` merge.

STOP.
