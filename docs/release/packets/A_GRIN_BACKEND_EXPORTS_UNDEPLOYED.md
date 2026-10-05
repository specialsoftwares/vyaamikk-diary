# Packet A — Executable GRIN backend proposal (unapplied)

Status: **reviewable deploy proposal**. Not authorization. Do not edit live
`functions/src/index.ts`, `firestore.rules`, `storage.rules`, IAM, indexes,
secrets, or production flags from this packet. Do not run `firebase deploy`.

Reviewed application SHA: `dcc325a9fb0d0094ab8bc05cc7ea3d27a7e2ab7a`.
Published docs head as of this packet: see coordinator closeout.

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
`tools/goods-evidence-emulator/functions-entry/handlers.ts`:

```ts
onCall({ region: "asia-south1" }, async (request) => {
  const auth = request.auth?.uid ? { uid: request.auth.uid } : null;
  return run({ auth, data: request.data });
});
```

Identity is `request.auth.uid` only. Client uid, digest, and claimed hash are
not authority. Do not export Admin SDK or emulator adapters from the production
entry.

Existing identity callables do **not** set `enforceAppCheck: true`. Do not add
it on GRIN in the first export unless the owner separately authorizes App Check
enforcement for all callables.

Global options already apply (`functions/src/globalOptions.ts`): `cpu: gcf_gen1`,
`concurrency: 1`, `maxInstances: 3`. Keep those unless a later scale review
says otherwise.

### Production packaging gap (deployment source, not an architecture rewrite)

`functions/src/goodsEvidence/callables.ts` stays fail-closed even when the env
is `"true"` because it binds no adapter. `composed.ts` can run only if a
`GoodsEvidenceRegisterAdapter` + G2 evidence adapter are injected.

Those adapters today live under `tools/goods-evidence-emulator/**` and
`tools/goods-evidence-storage/**`. `functions/src` must not import `tools/`
(`rootDir` would move `lib/index.js`).

**Required before a working live export (still unapplied):**

1. Generate or copy adapter sources into `functions/src/goodsEvidence/` (or a
   sibling under `functions/src`) without Expo/`@/`/React.
2. Add `functions/src/goodsEvidence/productionCompose.ts` that wraps Admin
   Firestore + Storage the same way `functions-entry/compose.ts` does for the
   emulator.
3. Export the seven `onCall` wrappers from `functions/src/index.ts`.
4. Set `GRIN_GOODS_EVIDENCE_FUNCTIONS=true` only on those seven function
   instances (Firebase Functions env / secrets), not as an `EXPO_PUBLIC_*` key.

Until those four steps exist, exporting the current `handleGrin*` stubs would
deploy callables that always return `policy_denied`. That is fail-closed, not a
working backend.

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

**Rule:** merge GRIN matchers into a **fresh live export**, not into repo-root
quota Firestore Rules. `test:live-rules-compat` exists to keep that distinction.

**Before any authorized Rules deploy:** re-export live Firestore and Storage
rulesets; abort if sha256 differs from the table above without an owner-reviewed
explanation.

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

## 7. Required service identities and least privilege

| Identity | Use | Least privilege |
|---|---|---|
| Default Cloud Functions runtime SA for `asia-south1` (existing identity/deletion functions) | Admin Firestore transactions + Storage `download`/metadata for stored-byte verify | Prefer a **dedicated** GRIN runtime SA if the owner will not grant default SA extra Storage object access. Minimum: Firestore read/write on `users/{uid}/goodsEvidence*` and `users/{uid}/grinEvidence*`; Storage object get on `users/*/grinEvidence/**`. Do not grant `storage.objects.delete` for the first export. |
| Firebase Auth | `request.auth.uid` | Existing. No new OAuth clients. |
| Client SDK (mobile) | `httpsCallable` + `uploadBytesResumable` to reserved paths | Bound by Rules above. |
| Humans in Firebase Console | Break-glass | Not a worker identity. Console overwrite/delete is a residual admin risk. |

Do not commit service-account JSON. Use the existing authorized Functions
runtime identity or a new SA created in Console/IAM by the owner.

No new secret values are required for the first fail-closed-or-admitted export
beyond `GRIN_GOODS_EVIDENCE_FUNCTIONS=true` on the seven functions.

## 8. Upload reservation, immutable originals, stored-byte verification, linkage

Order already implemented in composed evidence callables + G2 adapter:

1. `grinReserveEvidence` — creates objectKey binding + flight `reserved`.
2. Client PUT to `storagePath` (resumable). Rules deny overwrite of a non-flight state.
3. `grinBeginEvidenceUpload` — marks `uploading` if still owned/authorized.
4. `grinUploadEvidence` — Admin reads **stored bytes** at the bound generation,
   hashes them (64 KiB chunks), compares to reservation claim, then links.
   Client hash is a claim only. Success without stored-byte hash is forbidden.
5. Link is an event + pointer on the receipt. Replacement after verify needs a
   **new** object id.

Idempotent retries must not issue a second receipt or re-upload a verified
original. Local confirmation refresh after linkage is a **client** concern
(already at `dcc325a`); the server remains source of confirmed cuts via
`grinReadGoodsReceipt`.

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
4. Land production compose + `index.ts` exports on the authorized SHA; deploy
   **Functions only** with `GRIN_GOODS_EVIDENCE_FUNCTIONS` unset → callables
   exist but deny. Smoke: unauthenticated and non-seeded uid get deny.
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
4. Seeded tester: reserve → PUT original → begin → uploadEvidence →
   `originalDurable true` and `actualSha256` of stored bytes.
5. Wrong owner / path / generation / hash → deny; object not linked.
6. Client SDK update/delete of original → deny.
7. `newCommands=deny` after a verified original → retained **read** still
   allow; new reserve deny.
8. Existing diary/PO/credit/letterhead Saves still succeed under live-compat
   Rules (re-run `test:live-rules-compat` against the merged file before
   deploy).

## 12. Rollback / disable (preserve receipts, serials, originals)

| Action | Effect | Do |
|---|---|---|
| Unset `GRIN_GOODS_EVIDENCE_FUNCTIONS` or set any value other than `"true"` | Callables deny; clients stay `failed_retryable` / non-durable | Prefer this as first disable |
| Remove the seven exports and redeploy Functions | Callables missing; clients fail closed | Second disable |
| Set all admission docs to `deny` | Seeded testers stop new commands; retained reads still allowed by Storage Rules | Use when UI is still visible |
| Revert Storage/Firestore GRIN matchers | Client SDK cannot read originals; Admin still can | Only after a read plan; **do not delete** objects or serial docs |
| Delete GRIN Firestore/Storage data | Destroys issued numbers and originals | **Forbidden** as rollback |

Rollback must **not** delete `serials/{fyToken}`, issued `receipts/{receiptId}`,
command results, or Storage originals. Retention/deletion after account
deletion is Packet D, not this rollback.

## 13. HOLDs

- No live deploy from this packet.
- Encrypted PDF backup remains backlog.
- Purchase-entry flags stay `"0"`.
- Client store-runtime enablement is Packet B, separate approval.
