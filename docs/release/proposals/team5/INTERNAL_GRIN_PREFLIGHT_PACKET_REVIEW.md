# Internal GRIN preflight packet review (Team 5)

AI QA / release-gate role, not human certification. Independent of the
packet-author pass. **Packet review only** — domain suites were not re-run.
Wave 2 is **not** accepted. Not live deploy. Not G6. Not main merge. Not EAS.

Application SHA (CI-validated, unchanged this session):
`5d5df3d54df08953bfb26db39a9b7f5e3d67ed47`
Canonical CI: run `37351685421`, job `111903806888`, `ci:verify` success.
Do **not** reuse failed run `37344993645`.

Inspected in `/Users/shivamsaurav/vyd-worktrees/grin-combined` on
`integration/grin-g1-g5-source`. Production/application files were not
edited for this review. Historical workspace untouched.

## Scope

Checked only:

1. Command scope and source/artifact provenance
2. Gate-off initial state
3. Project/bucket/runtime identity consistency
4. Fresh-baseline additive Rules and isolated deployment configuration
5. Callable disablement versus Storage upload disablement
6. Rollback preservation and verification

## What was executed

| Check | Result |
|---|---|
| Disk sha256 of merged Rules, isolated config, live-compat base, repo-root quota Rules | **PASS** (see hashes) |
| Isolated `firebase.rules-only.json` has no `functions` / indexes / hosting | **PASS** |
| firebase-tools 14.20.0 `Config.load --config` resolves merged files, not repo-root | **PASS** |
| Repo `firebase.json` still `firestore.rules` / `storage.rules` / `functions` source `functions` | **PASS** |
| Packet enablement is Firebase CLI seven-function redeploy + dotenv, not bare gcloud `--update-env-vars` as the method | **PASS** |
| Gate-off path refuses dotenv `exact_true` and does not create the project dotenv | **PASS** |
| Disablement A is dotenv `false` + seven-function redeploy (not “redeploy with no file”) | **PASS** |
| B is `newCommands=deny` on named admission docs; C is no-delete | **PASS** |
| October 1 ruleset IDs are historical only, not the rollback target | **PASS** |
| Live project/bucket/SA/Rules re-export | **blocked** (one `projects:list` 401; not retried) |
| Domain unit/emulator suites | **not run** (narrative/docs + isolated JSON only) |

Hashes this review recomputed:

```
d224b75385b451433e5c59bdbf0cc147697fbe88e773c11dab44f3b71e3e8a74  proposed-grin/firebase.rules-only.json
551203b8b11991fc1d49d42aa6a818fedeca8530654f7505de949b62a1ae298b  proposed-grin/firestore.rules
6b8959929b86ac2eab41fc591dc1fbf5bb03b80a226226d43bf4c8e72391c76b  proposed-grin/storage.rules
b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c  proposed/firestore.rules
1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5  proposed/storage.rules
233b05b7b810b484171257f4dafe78fd0fdea5762ed6848cf8b49cd327fd58cc  firestore.rules (repo-root, do not deploy)
19fcc761dc8d5a923efb45ed589a598690bd3bb2159fab827f3ce30c17a60452  storage.rules (repo-root)
```

## Required checks

### 1. Command scope and provenance — PASS

`docs/release/packets/INTERNAL_GRIN_DEPLOYMENT_PACKET.md` pins application
source `5d5df3d` and canonical CI `37351685421` / `111903806888`. Functions
deploy cwd is repository root (the `firebase.json` that names codebase
`default`). `--only` lists the seven export names from
`functions/src/goodsEvidence/productionExports.ts`, each prefixed
`functions:` so firebase-tools 14.20.0 `getEndpointFilters` does not drop
names. Isolated emulator `tools/goods-evidence-emulator/functions-entry` is
not a deploy target.

The packet identifies firebase-tools **14.20.0** (local CLI and CI pin) and
documents official dotenv + `inferDetailsFromExisting` merge-vs-replace
behaviour from that version. Bare
`gcloud functions deploy … --update-env-vars=GRIN_GOODS_EVIDENCE_FUNCTIONS=true`
is cited as **not** the method (gcloud `--source` omitted is cwd-sensitive or
leaves prior GCS source; it is still a deploy). Cloud Run env edits are not
proposed.

A later docs-only HEAD is allowed for apply only if
`git diff --stat 5d5df3d -- functions src eas.json app.json app firebase.json`
is empty.

### 2. Gate-off initial state — PASS

§3.1 requires apply-host presence check of `.env`, `.env.vyaamikk-diary`,
`.env.production`, `.env.local` and **refuses** if
`GRIN_GOODS_EVIDENCE_FUNCTIONS=true`. §3.2 does not create those files.
Worktree 2026-10-05: only `functions/.env.example` exists; that name is not
in firebase-tools `findEnvfiles`. Gate is still exact `"true"` in
`grinFunctionsEnabled`.

### 3. Project / bucket / runtime identity — PASS with live read blocked

Packet target remains `vyaamikk-diary` / `982505811909` /
`vyaamikk-diary.firebasestorage.app` / `asia-south1` / existing Functions
runtime SA. This session did **not** re-read live project number, bucket
parent, or SA IAM (`firebase projects:list` 401; `gcloud` absent). Packet
labels those as last-successful 2026-10-01, not re-confirmed. That is
honest. Identity callables' secrets bindings are not opened on GRIN
`onCall`. Residual database-level Datastore User is unchanged from the
unapplied IAM matrix.

### 4. Additive Rules + isolated config — PASS

Isolated config paths resolve to proposed-grin merged files
(`Config.load` this session). Repo `firebase.json` is not retargeted.
`--only firestore:rules,storage` avoids indexes. `--project vyaamikk-diary`
is required because the isolated directory has no `.firebaserc`. Merged
hashes match the packet table. Fresh live export is blocked; packet does not
treat October 1 `META.json` as today's live bytes. Drift instruction: inspect
and preserve unrelated live behaviour; do not overlay October 1 files or
repo-root quota Firestore.

### 5. Callable disablement vs Storage upload disablement — PASS

**A** = Functions env gate via seven-function Firebase **redeploy**
(`=false` dotenv so `usedDotenv` replaces rather than merging leftover
`true`). **B** = `newCommands: "deny"` on exact
`users/{uid}/goodsEvidenceAdmission/runtime` documents; Storage
`canUploadOriginal` / `admissionAllowsNewCommands` require `'allow'`.
Retained-original GET does not require that field. Packet states A does not
stop PUTs of already-reserved objects while admission remains allow; B does
not stop callable processing. Independent, separately authorized.

### 6. Rollback preservation and verification — PASS

C: no delete of receipts, serials, originals; no `storage.objects.delete`.
Rules rollback = capture **actual pre-deploy** export at apply time, not
hardcoded `a19b4a83-…` / `a2a0ddf7-…`. Gate-off limits (callable read/reconcile
stop; Storage GET ≠ full export; no in-flight cancel) are stated. Verify
script prints only `GATE=on|off` / `DESCRIBE_FAIL`.

## Defects

None on the six packet checks. Live GCP reads remain **blocked** pending
owner `firebase login --reauth`. That is a preflight gap, not a packet
command defect.

## Not claimed

NATIVE_DEVICE, live Rules deploy, Functions deploy, tester seed, EAS, Play,
billing, `main` merge, Wave 2 / G6. Docs-only SHA is distinct from
`5d5df3d`. A CI run on the docs commit must not replace canonical
application run `37351685421`.
