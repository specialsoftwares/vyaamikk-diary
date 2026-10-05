# Packet A — Executable GRIN backend proposal (unapplied)

Status: **reviewable deploy proposal**. Not authorization. Do not edit live
`functions/src/index.ts`, `firestore.rules`, `storage.rules`, IAM, indexes,
secrets, or production flags from this packet. Do not run `firebase deploy`.

Reviewed application SHA: `4aac867af015d83f6ec3badb0748ff3b4bcc1a22`
(fail-closed Admin project/bucket resolution). Parent packaging
`84c748d026d4229cded55d3ddc281a15858322c9` had the bucket-guess defect.
Confirmation-refresh remains `dcc325a9fb0d0094ab8bc05cc7ea3d27a7e2ab7a`.
Prior published packaging docs head:
`f1be0db6c050b948fe1084a9bd68f24bddc5a4f3`. Do not reuse CI run
`37330701057` as evidence for this correction.

## 1. Target project and region

| Item | Value |
|---|---|
| Firebase / GCP project | `vyaamikk-diary` (number `982505811909`) |
| Storage bucket | `vyaamikk-diary.firebasestorage.app` |
| Functions region | `asia-south1` (same as existing identity/deletion callables and `canonicalFunctionsRegion`) |
| Functions codebase | `default` (`firebase.json` `functions[0].source` = `functions`) |
| Production JS entry | `functions/lib/index.js` compiled from `functions/src/index.ts` |
| Isolated emulator entry (do **not** deploy) | `tools/goods-evidence-emulator/functions-entry/**` |
| Env gate | `GRIN_GOODS_EVIDENCE_FUNCTIONS` must be exactly `"true"`. `"1"`, `"TRUE"`, missing, empty = deny |

Client configuration (`EXPO_PUBLIC_*`) is **not** backend authorization.

## 1b. Production Admin project/bucket resolution

`createProductionGrinCallables` must bind Firestore and Storage to the **same**
default Admin app after `resolveGrinAdminBinding` validates project and bucket
together (`functions/src/goodsEvidence/productionAdminConfig.ts`).

Deployment target (later authorized read-only preflight; **not** a generic
code fallback):

| Item | Value |
|---|---|
| Project | `vyaamikk-diary` |
| Storage bucket | `vyaamikk-diary.firebasestorage.app` |

Do not hardcode that pair as a missing-config fallback.

### Precedence (first present wins; contradictory values fail closed)

1. `GRIN_ADMIN_PROJECT` / `GRIN_ADMIN_STORAGE_BUCKET` — explicit validated
   override (isolated emulator npm script sets the demo pair).
2. `FIREBASE_STORAGE_BUCKET` — bucket only.
3. `FIREBASE_CONFIG` JSON `projectId` / `storageBucket` — Firebase runtime.
4. `GCLOUD_PROJECT` / `GCLOUD_PROJECT_ID` — project only.
5. Existing **default** (`[DEFAULT]`) Admin app `options.projectId` /
   `options.storageBucket` when still missing.

Rules:

- No silent production fallback to `demo-vyaamikk-grin-t1`.
- No guessed `${projectId}.appspot.com` suffix.
- Legacy `*.appspot.com` is allowed only when that bucket is **explicitly**
  present in an override, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_CONFIG`, or
  the existing default app.
- Named Admin apps without a usable default app fail closed
  (`grin_admin_config_no_default_app`). Do not initialize a second default
  app beside identity/billing.
- Existing default app whose project/bucket disagrees with requested values
  fails closed (`grin_admin_config_conflict`). Do not mutate or reinitialize
  that app.
- Missing or malformed required configuration fails closed
  (`grin_admin_config_missing` / `grin_admin_config_malformed`). Diagnostics
  are those fixed codes only. Do not print `FIREBASE_CONFIG` or `process.env`.

Isolated emulator defaults stay on the emulator npm script
(`GRIN_ADMIN_PROJECT=demo-vyaamikk-grin-t1`,
`GRIN_ADMIN_STORAGE_BUCKET=demo-vyaamikk-grin-t1.appspot.com`). Emulator
hosts alone must not select a demo project in production.

### Secret-free preflight (no document/object reads)

```bash
# Inspect env only. Does not initialize a live Admin app.
# Prints {ok, projectId, storageBucket, appName, initialized} or {ok:false, code}.
npx --yes tsx tools/goods-evidence-emulator/grinAdminConfigPreflight.ts
```

Expected for the live Functions runtime shape (values only; do not cat the
JSON yourself into logs):

`{"ok":true,"projectId":"vyaamikk-diary","storageBucket":"vyaamikk-diary.firebasestorage.app","appName":"[DEFAULT]","initialized":true}`

After `firebase login --reauth`, a later **read-only** operations pass may
confirm `firebase use` / `gcloud config get-value project` equal
`vyaamikk-diary` and that the project's default bucket name is
`vyaamikk-diary.firebasestorage.app`. That pass is not this slice. Do not
retry expired credentials here. Do not export indexes, Rules, or IAM.

### Limitation preserved

`newCommands=deny` also blocks G1 `grinReadGoodsReceipt`. A retained Storage
GET of an already-uploaded original does **not** mean the full app can still
read or export records.

## 2. Exact callable exports (names are the contract)

Copy from `src/services/grin/transport/callableNames.ts` and
`functions/src/goodsEvidence/callables.ts`. Do not invent aliases.
Not `grinBeginEvidence` — that name is not in the contract. Do not export it.

| Export | Source factory | Role |
|---|---|---|
| `grinRegisterGoodsReceipt` | `createComposedGrinCallables().register` | Issue serial + immutable original |
| `grinReconcileCommand` | `.reconcile` | Lost-response replay |
| `grinMutateGoodsReceipt` | `.mutate` | Amend / QC / return / EWB / link |
| `grinReadGoodsReceipt` | `.readReceipt` | Authorized confirmed retrieve |
| `grinReserveEvidence` | `.reserveEvidence` | Reserve Storage object + flight |
| `grinBeginEvidenceUpload` | `.beginEvidenceUpload` | Begin stored-byte verify flight |
| `grinUploadEvidence` | `.uploadEvidence` | Stored-byte verify → link |

Proposed production wrapper (still unapplied) matches the isolated emulator
`tools/goods-evidence-emulator/functions-entry/handlers.ts` wrapping
`createProductionGrinCallables`:

```ts
onCall({ region: "asia-south1" }, async (request) => {
  const auth = request.auth?.uid ? { uid: request.auth.uid } : null;
  return run({ auth, data: request.data });
});
```

Exact seven-export text:
`docs/release/proposals/unapplied/functions-index-seven-export.diff.md`.
Do not apply it in this slice. Isolation tests require those names absent
from `functions/src/index.ts`.

Identity is `request.auth.uid` only. Client uid, digest, and claimed hash are
not authority. Do not export Admin SDK or emulator adapters from the production
entry.

Existing identity callables do **not** set `enforceAppCheck: true`. Do not add
it on GRIN in the first export unless the owner separately authorizes App Check
enforcement for all callables.

Global options already apply (`functions/src/globalOptions.ts`): `cpu: gcf_gen1`,
`concurrency: 1`, `maxInstances: 3`. Keep those unless a later scale review
says otherwise.

### Production packaging (this slice) vs remaining export HOLD

`functions/src/goodsEvidence/callables.ts` stays fail-closed even when the env
is `"true"` because it binds no adapter. That is intentional: those stubs are
not the production backend.

`productionCompose.ts` binds packaged G1/G2 adapters to Admin Firestore and
the bound Storage bucket. Isolated Functions-emulator entry re-exports
`createProductionGrinCallables as createIsolatedGrinCallables`. Packaging is
generated from authoritative sources (`src/goodsEvidence`,
`tools/goods-evidence-emulator`, `tools/goods-evidence-storage`) with a
parity/drift check. `functions/src` does not import `tools/` at runtime.

**Remaining before a working live export (unapplied):**

1. ~~Generate adapters + production compose~~ — landed at `84c748d`.
2. ~~Fail-closed Admin project/bucket resolution~~ — landed at `4aac867`.
3. Export the seven `onCall` wrappers from `functions/src/index.ts`
   (unapplied proposal).
4. Set `GRIN_GOODS_EVIDENCE_FUNCTIONS=true` only on those seven function
   instances (Firebase Functions env / secrets), not as an `EXPO_PUBLIC_*` key.

Exporting the current `handleGrin*` stubs would still always `policy_denied`.
Do not wrap those stubs and call that a working backend.

## 3. Fresh live Rules baseline (do not use repo-root quota Rules)

Last authorized **read-only** export: `docs/release/rules-compat/live-export-2026-10-01/META.json`
(2026-10-01T14:04Z, CLI user `support.vyd@specialsoftwares.com`).

| Surface | Last live ruleset | sha256 | Notes |
|---|---|---|---|
| Firestore | `a19b4a83-8b3e-4cf5-b8b8-e8d26e9704f9` | `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` | Equals `docs/release/rules-compat/proposed/firestore.rules` (billing-off compat). **Not** repo-root `firestore.rules`. |
| Storage | `a2a0ddf7-9746-4dd2-bd48-29c9abc0e41f` | `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5` | Equals `docs/release/rules-compat/proposed/storage.rules` / baseline. Letterhead / attachments / PDFs only. |

Repo-root hashes as of this packet (do **not** deploy as the live replacement):

| File | sha256 |
|---|---|
| `firestore.rules` (quota candidate) | `233b05b7b810b484171257f4dafe78fd0fdea5762ed6848cf8b49cd327fd58cc` |
| `storage.rules` (repo, includes `company/**` denies) | `19fcc761dc8d5a923efb45ed589a598690bd3bb2159fab827f3ce30c17a60452` |

**This assignment could not refresh that export.** Firebase CLI credentials
for `support.vyd@specialsoftwares.com` returned HTTP 401 on
`firebaserules.googleapis.com` and `firebase projects:list` required
`firebase login --reauth`. See
`docs/release/proposals/unapplied/ADDITIVE_RULES_FRESHNESS.md`.
Do not merge GRIN matchers into a claimed-fresh live file until that
re-export succeeds.

Live Firestore and Storage currently have **no** `goodsEvidence` / `grinEvidence`
matchers.

## 4. Proposed Firestore changes (additive, Admin-written)

Executable matcher source: `tools/goods-evidence-emulator/functions-entry/firestore.rules`
(do not deploy that isolated file as a whole; it is not the live diary Rules).

Add owner-scoped paths under `users/{uid}/…`. Client SDK: **read** for active
owner; **create/update/delete denied**. Adapter/Admin writes.

| Path | Client | Writer |
|---|---|---|
| `users/{uid}/goodsEvidenceAdmission/runtime` | owner read | Admin only |
| `users/{uid}/goodsEvidenceLedgers/{ledgerId}` | active-owner read | Admin |
| `…/commands/{commandId}` | active-owner read | Admin |
| `…/serials/{fyToken}` | active-owner read | Admin |
| `…/receipts/{receiptId}` (+ `events`, `evidenceLinks`, `evidenceControl`) | active-owner read | Admin |
| `…/evidenceObjects/{evidenceId}` | active-owner read | Admin |
| `users/{uid}/grinEvidenceObjectKeys/{objectKey}` | active-owner read | Admin |
| `users/{uid}/grinEvidenceDerivativeKeys/{derivativeKey}` | active-owner read | Admin |
| `users/{uid}/goodsEvidenceUploadControl/{docId}` | deny | Admin |

Admission document (per uid, not a global lock):

```json
{
  "schemaVersion": 1,
  "newCommands": "allow" | "deny",
  "reconciliation": "allow" | "deny"
}
```

Missing or malformed document = deny after owner/ledger checks.

Indexes: GRIN adapters use document `get` + transactions on known paths, not
collection-group queries. **No new `firestore.indexes.json` entries** are
required for the first export. Do not invent composite indexes.

## 5. Proposed Storage changes (additive, immutable originals)

Executable functions: `tools/goods-evidence-storage/storage.rules`
(`canUploadOriginal`, `canReadOriginal`, `canCreateDerivative`,
`canReadDerivative`, `boundLedgerActive`, `hasDerivativeFlightReservation`).

Keep existing letterhead / attachments / pdfs matches from the **live** file.
Keep final `match /{allPaths=**} { allow read, write: if false; }`.
Do not drop live letterhead/PDF paths. Do not treat adding repo-root
`company/**` denies as part of this GRIN change unless a fresh live export
already has them.

| Path | Create | Read | Update/delete |
|---|---|---|---|
| `users/{uid}/grinEvidence/{objectKey}/original` | signed-in active owner + objectKey binding + ledger active + admission `newCommands=allow` + flight `reserved`/`uploading` + allowed MIME/size | flight: also needs `newCommands=allow`; retained (`uploaded_unverified`/`verified`/`linked`): allow even when `newCommands=deny` | **deny** client |
| `users/{uid}/grinEvidence/{objectKey}/derivatives/{derivativeKey}` | admission allow + verified/linked parent + derivative reservation | verified/linked parent; not gated on `newCommands` | **deny** client |

Object keys are random. No receipt, category, filename, invoice, or GSTIN in
the path. Download tokens are not access control. Adapter stores `storagePath`
+ generation; does not mint public URLs.

MIME/size at create: PDF ≤ 15 MiB (`application/pdf`); images ≤ 10 MiB
(`image/*` allowed set in domain). Client verification metadata is not trusted.

Client overwrite/delete deny is the claim. Do not promise administrator
immutability (Admin SDK / Console bypass Rules). Object Retention Lock is out
of scope.

## 6. Authentication, active-account, owner/ledger, tester admission

Check order (adapter `gate`, already implemented in the emulator adapter):

1. Unauthenticated → `unauthenticated`
2. Missing / inactive / `pending_deletion` user → `forbidden` (generic deny; no existence leak)
3. Ledger missing, foreign `ownerUid`, or not `active` → `forbidden`
4. Admission `newCommands` / `reconciliation` missing, malformed, or `deny` → `policy_denied`
5. Command validation

No pending-deletion replay exception.

**Tester admission (security boundary, independent of app UI):**

- Seed `users/{testerUid}/goodsEvidenceAdmission/runtime` with
  `{ schemaVersion: 1, newCommands: "allow", reconciliation: "allow" }` **only**
  for named Internal Testing Firebase uids (owner-supplied list at deploy time).
- Every other uid: omit the document or set both fields to `"deny"`.
- Optionally seed `users/{uid}/goodsEvidenceLedgers/{ledgerId}` with
  `{ ownerUid: uid, status: "active" }` for those testers.
- Changing `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED` does not grant these writes.

Play reviewer phone fixture (`+91 9000000000`) is **not** GRIN admission unless
that Auth uid is explicitly seeded.

## 7. Service identities and permission matrix

Firestore Security Rules do **not** constrain Admin SDK access. There is no
supported document-path IAM isolation for GRIN collections. Concrete matrix
(principal, API operation, supported resource scope, permission/role, residual
access): `docs/release/proposals/unapplied/IAM_PERMISSION_MATRIX.md`.

Storage prefix IAM conditions are a documented GCS feature
(`resource.name.startsWith` on
`projects/_/buckets/vyaamikk-diary.firebasestorage.app/objects/users/`).
That prefix was **not** read back from live IAM in this slice. A `users/`
prefix still covers letterhead and attachments, not only `grinEvidence`.

Do not commit service-account JSON. Use the existing authorized Functions
runtime identity or a new SA created in Console/IAM by the owner.

No new secret values are required for the first fail-closed-or-admitted export
beyond `GRIN_GOODS_EVIDENCE_FUNCTIONS=true` on the seven functions.

## 8. Upload reservation, immutable originals, stored-byte verification, linkage

Inspected client order in `src/services/grin/transport/evidenceTransport.ts`
(do not reorder working transport to match an older packet):

1. `grinReserveEvidence` — objectKey binding + flight `reserved`.
2. `grinBeginEvidenceUpload` — marks `uploading` if still owned/authorized.
3. Client PUT / `uploadBytesResumable` to the reserved `storagePath`.
   Lost-response retry still calls verify/link if the object already exists.
4. `grinUploadEvidence` — Admin reads **stored bytes** at the bound bucket
   path, records the **actual generation** from object metadata, hashes in
   64 KiB chunks with a 15 MiB ceiling, independently of the client claim,
   then links to the authorized receipt/category. Success without stored-byte
   hash is forbidden.
5. Client confirmation via `grinReadGoodsReceipt` (already at `dcc325a`).

Replacement after verify needs a **new** object id. Idempotent retries must
not issue a second receipt or re-upload a verified original.

## 9. Operational limits and safe diagnostics

| Limit | Value | Enforcement |
|---|---|---|
| PDF original | 15 MiB | domain + Rules create |
| Image original | 10 MiB | domain + Rules create |
| Concurrent uploads / owner | 2 | client outbox + server upload control |
| Functions maxInstances | 3 (global) | already set |
| Policy | v2 category set | adapter |

Logs: fixed event names and bounded metadata only (`code`, `attempt`,
`replayed`, `policy`). Never log PDF bodies, tokens, OTPs, phone numbers, or
Storage download URLs.

## 10. Deployment order (after separate owner approval of each step)

1. Re-export live Firestore + Storage rulesets; record sha256.
2. Merge GRIN Firestore matchers into that live Firestore source; emulator-test
   the merged file; deploy **Firestore Rules only**.
3. Merge GRIN Storage matchers into that live Storage source; emulator-test;
   deploy **Storage Rules only**.
4. Apply the unapplied seven-export on the authorized SHA; deploy
   **Functions only** with `GRIN_GOODS_EVIDENCE_FUNCTIONS` unset → callables
   exist but deny. Smoke: unauthenticated and non-seeded uid get deny.
   Production compose exists at `4aac867` (config resolution; parent packaging
   `84c748d`). Do not deploy stubs.
5. Set `GRIN_GOODS_EVIDENCE_FUNCTIONS=true` on the seven functions.
6. Seed tester admission + ledger docs (Admin). Do not seed production uids.
7. Smoke tests in §11. Do not enable client store-runtime GRIN in this packet.

Do not deploy isolated `tools/goods-evidence-emulator/functions-entry`.
Do not deploy repo-root quota `firestore.rules`.
Do not lift production-export HOLD until the owner approves steps 4–5.

## 11. Smoke tests (staging/live after deploy — not run now)

Use synthetic data only.

1. Unauthenticated callable → `unauthenticated`.
2. Authenticated non-seeded uid → `policy_denied` / generic deny.
3. Seeded tester: register → one serial; replay same commandId+digest →
   `replayed: true`; no second serial.
4. Seeded tester: reserve → begin → PUT original → `grinUploadEvidence` →
   `originalDurable true` and `actualSha256` of stored bytes. Then client
   confirmation via `grinReadGoodsReceipt`.
5. Wrong owner / path / generation / hash → deny; object not linked.
6. Client SDK update/delete of original → deny.
7. `newCommands=deny` after a verified original → new reserve deny; Storage
   Rules still allow retained original **client** reads; G1
   `grinReadGoodsReceipt` currently still requires `newCommands=allow`.
8. Existing diary/PO/credit/letterhead Saves still succeed under live-compat
   Rules (re-run `test:live-rules-compat` against the merged file before
   deploy).

## 12. Rollback / disable (preserve receipts, serials, originals)

| Action | Effect | Do |
|---|---|---|
| Unset `GRIN_GOODS_EVIDENCE_FUNCTIONS` or set any value other than `"true"` | Callables deny; clients stay `failed_retryable` / non-durable | Prefer this as first disable |
| Remove the seven exports and redeploy Functions | Callables missing; clients fail closed | Second disable |
| Set all admission docs to `deny` | Seeded testers stop new commands; Storage Rules still allow retained original **client** reads; G1 `grinReadGoodsReceipt` currently still requires `newCommands=allow` | Use when UI is still visible; do not treat callable read as retained Storage read |
| Revert Storage/Firestore GRIN matchers | Client SDK cannot read originals; Admin still can | Only after a read plan; **do not delete** objects or serial docs |
| Delete GRIN Firestore/Storage data | Destroys issued numbers and originals | **Forbidden** as rollback |

Rollback must **not** delete `serials/{fyToken}`, issued `receipts/{receiptId}`,
command results, or Storage originals. Retention/deletion after account
deletion is Packet D, not this rollback.

## 13. HOLDs

- No live deploy from this packet.
- Encrypted PDF backup remains backlog.
- Purchase-entry flags stay `"0"`.
- Production compose exists; `functions/src/index.ts` GRIN export remains HOLD.
- Additive live Rules merge waits on `firebase login --reauth`.
- No live IAM write. Prefix condition not read back from the project.
- Client store-runtime enablement is Packet B, separate approval.
