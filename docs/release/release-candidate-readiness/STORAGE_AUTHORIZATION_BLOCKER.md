# Storage authorization: candidate release blocker

Review date: 2026-11-10. This is a source/configuration review and local emulator experiment, not a read of serving Firebase Rules or live IAM. No rules, functions, keys, accounts or objects were changed in production.

## Why the selected source is not deployable as a complete Storage policy

`firebase.json` selects root `storage.rules` and `firestore.rules`. Root Storage Rules currently cover owner letterhead, attachments and PDFs. They contain no `grinEvidence` matcher, so their final deny catches the integration client's GRIN upload path.

The protected owner checks read multiple distinct Firestore documents: `authSecurity/{uid}`, `restoreControl/current`, `restoreControl/mode`, `users/{uid}`, and `deletionJobs/{uid}`. The GRIN proposal additionally reads admission, object-key reservation and ledger documents, plus a derivative reservation when relevant. Reusing all these checks directly in an additive Storage matcher would exceed Firebase's production cross-service access budget.

The [official Storage Rules conditions documentation](https://firebase.google.com/docs/storage/security/rules-conditions#enhance_with_cloud_firestore), read on 2026-11-10, limits one evaluation to two Firestore documents. Repeated reads of one document can be cached; reads of these different document paths cannot be collapsed by renaming helper functions.

`docs/release/rules-compat/proposed-grin/storage.rules` is a historical proposal, explicitly marked not for deployment. Its simple `isOwner` also omits the current session/restore guards. Copying it would both exceed the document budget and weaken existing protections. Neither root nor that proposal should be deployed as a complete compatible release policy without resolving this design.

## Reachable successful paths in the selected Rules

This is not a count of every helper defined in the file. The selected root policy has a reachable successful owner path that needs three distinct documents for an authenticated object read and five for an upload. A concrete fixture uses the production bridge token shape for `owner`: custom sign-in, `auth_time = 500`, preserved `vydOriginAuthTime = 200`, no erased claim, and these existing documents:

| Document | Allowing value | Decision that requires it |
| --- | --- | --- |
| `authSecurity/owner` | `revokedBeforeAuthTimeSeconds: 100` | The token is newer than the cutoff. |
| `restoreControl/current` | `closed: false, reconciled: false, watermark: 1` | Traffic is not closed. |
| `restoreControl/mode` | `required: false` | Pre-activation traffic does not require a watermark claim. |
| `users/owner` | `status: active` | Writes require an active account. |
| `deletionJobs/owner` | `status: cancelled` | A reactivated owner's retained deletion job is not completed. |

For `/users/owner/attachments/record/fixture.png`, evaluate `isOwner`: `sessionNotRevoked` reads the first document, `restoreClosed` the second, and `restoreModeAllows` the third. All predicates pass, so an authenticated read depends on all three. An upload continues into `accountActive` and `deletionAllowsStorage`, requiring the fourth and fifth documents before MIME/size acceptance. Repeated reads of a single path do not add distinct documents. This fixture represents an active, previously reactivated owner; it does not rely on an active user simultaneously having an awaiting-deletion job.

Earlier rejection paths can read fewer documents: an anonymous request stops before those reads; a revoked token stops at the cutoff; a closed restore fence stops before the mode check. Short-circuiting these *denials* does not reduce the document requirements of the successful owner path. Missing documents still require an existence lookup; omitting them is not a safe budget optimization.

The final candidate's actual root `storage.rules` was loaded in an isolated demo emulator on 2026-11-10. Baseline authenticated upload and read passed. Each document was then changed independently, with the baseline restored before the next change:

| Independent change | Upload | Authenticated read |
| --- | --- | --- |
| Cutoff becomes `200` | Denied | Denied |
| Restore `closed` becomes `true` | Denied | Denied |
| Mode `required` becomes `true`, with no reconciled token/fence | Denied | Denied |
| User becomes `pending_deletion` | Denied | Unchanged by this existing read policy |
| Deletion job becomes `completed` | Denied | Unchanged by this existing read policy |

This confirms the dependencies are executable conditions, not unused helper definitions. The three/five count follows the successful expression trace; the emulator's allowed result is not a production-limit measurement. The root policy's GRIN original upload was separately denied by the unmatched final deny, even with valid pending metadata.

The `rules/activated/storage.rules` alternative calls only `restoreControl/current`, not its unused `restoreModeAllows` helper. With a matching reconciled watermark it needs two documents for reads and four for writes. Its emulator baseline passed; changing the mode document alone did not deny. Switching `firebase.json` to this file therefore still does not solve writes or GRIN, and it would also require old clients to carry the activated authority claim.

No single Rules refactor can preserve these independent current authorities and make them fit two documents. Co-locating mode/fence can reduce one read only after a reviewed writer/data migration. Co-locating account, revocation and deletion authority additionally needs all authoritative writers to maintain that state synchronously. GRIN reservation and ledger authority introduce further documents. An asynchronous mirror, stale token claim, or removed guard changes the security contract.

A separate existing delete behavior was also reproduced: the owner `deleteObject` call is denied because `allow write` evaluates `request.resource.size` on a delete's null new resource. Splitting create/update/delete predicates could address that isolated problem after review, but it would not resolve the document budget or GRIN access. The production helper currently catches that failure; no live object deletion was attempted.

## Emulator limitation reproduced

A local experiment used project `demo-vyaamikk-storage-budget`, Firebase CLI 14.20.0, Firestore emulator 1.19.8 and Storage Rules runtime 1.1.3. It created three existing Firestore documents (`budget/a`, `budget/b`, `budget/c`) and a Storage rule requiring `firestore.get(...).data.ok` on all three. An authenticated object read succeeded, printing `THREE_DISTINCT_FIRESTORE_DOCUMENTS_ALLOWED_BY_EMULATOR`.

Therefore a green Storage emulator result does not certify compliance with the production two-document limit. The existing isolated GRIN rules tests prove their modeled allow/deny predicates only. This experiment did not send an SMS, access a live project or change production data.

The separately added `grin.selectedFirestoreRules.emulator.test.ts` does test the actual selected Firestore files and is not subject to the Storage-specific two-document rule. It failed against the prior root rules (owned GRIN read denied) and passed against the corrected root and activated Firestore files. It verifies owned reads/listing and denies client writes, foreign/anonymous access, inactive accounts, completed deletion, revoked sessions, restore closure, mismatched watermark, erased claims and missing parents. This is prototype Rules verification; independent review and live deployment verification remain necessary.

## Smallest compatible boundary to design and review

Use an authenticated server-mediated object endpoint instead of inventing an asynchronously mirrored Storage ACL. Derive the UID from a verified bearer token and reuse the existing admission, session-cutoff, restore, active-account and deletion guards. Keep a strict canonical operation/path allowlist. For GRIN originals, also resolve the existing server-written reservation, ledger and admission state, set pending metadata on the server, enforce MIME/size and create-generation preconditions, and leave trusted hash/seal/generation verification with the existing `grinUploadEvidence` lifecycle. Recheck authority before committing a delayed upload; an uncertain result must remain retryable without authorizing a replacement object.

Current client path:

- `src/services/storage/userStorageUpload.ts` sends the default owner upload through `ownerObjectGateway`. The gateway PUT uses the signed create-once ticket and does not attach a bearer token. An explicit `MediaUploadPorts` injection remains for emulator tests and still uses the older media REST helper.
- `src/services/storage/userStorage.ts` reads and deletes through the same gateway. Legacy letterhead and attachment bytes remain readable. The durable record stores the storage path, not the ticket.
- `prepareReceiptPhoto.ts` and `letterheadImageResolver.ts` use the ticket immediately. The resolver keeps `expiresAt` so a later read can request a fresh ticket. Neither stores the ticket as the object location.
- `evidenceTransport.ts` production `defaultPutObject` uses the gateway and passes the captured uid, session generation, ledger, receipt, and evidence id. Reservation, begin, verify, sealing, and hash checks stay on the GRIN lifecycle. `putReservedObjectWithJsStorage` remains the emulator helper. Generic gateway read and delete of a GRIN original are denied.
- Company invoice and report objects remain on their separate authorized download design.

The read ticket is a bearer URL. The revocation contract is expiry, not an immediate cancel. A 60-second ticket can still be used after the session, account, or deletion state changes, until `expiresAt`. Commit and delete do not trust it. Installed clients are outside this contract: they still call Storage directly, and the live rules stay as they are until a reviewed old-client transition. Do not tighten those rules in the same step as this callable.

## Why two documents cannot be substituted without migration

`authSecurity/{uid}` plus a new consolidated account document would still omit the global restore fence and GRIN reservation/ledger state. A consolidated ACL needs all relevant authoritative writers to update it transactionally, initialization for existing accounts/reservations, fail-closed behavior on missing/stale ACLs, and restore ordering that cannot resurrect obsolete grants. Background triggers alone leave a window after revocation/deletion. No such schema, writer protocol or backfill exists in this candidate.

The server-mediated design preserves existing bucket paths and bytes without re-encryption or account-state backfill. Source contains `ownerObjectTransfer` and the production client gateway. It still needs canonical CI on the corrective head, a deployment manifest against the revisions that are actually serving, and a signed binary. Root `storage.rules` are unchanged. Deploying only `ownerObjectTransfer` does not establish that recovery, mailbox, quarantine, or GRIN corrections are serving. A 60-second read ticket remains usable until it expires; it is not immediately revocable.

## Release and rollout dependencies

1. Re-read the serving Storage/Firestore release identifiers and source, live function revisions, bucket configuration and IAM before producing an exact deployment plan. Repository proposal files are not live evidence.
2. Review the endpoint design and implement production-path tests for ownership, stale sessions, restore/deletion fences, replay, stream failure, generation conflicts, legacy reads and backend success with lost client response.
3. Deploy only the reviewed endpoint/dependencies with the existing secret versions and resource limits after acceptance. Confirm authenticated authorized and denied behavior; HTTP 401 alone is not acceptance.
4. Build a new signed binary that uses the endpoint and confirm the exact artifact/configuration on a device. Existing installed clients still use direct Storage operations.
5. Decide old-client support/retirement before tightening direct Storage Rules. A gateway does not retroactively change installed binaries; disabling their direct access can break uploads and reads. Keep the current live rules unchanged until this compatibility transition is explicitly reviewed.
6. Verify the signed candidate's complete upload/read/delete and GRIN reserve/upload/verify paths. Do not mark the public release, source configuration or artifact accepted while this blocker remains.

The candidate's root Storage rules were left unchanged. The callable and client gateway are source on this branch and are not a live rules deployment. The selected Firestore GRIN additions do not solve Storage transport authorization.

## Reproduce the selected-policy dependency check locally

This manual diagnostic is retained here rather than registered as another broad CI suite. It uses only an isolated `demo-` project, the repository's Firebase test dependencies, and the actual Rules file from the checkout. Save the following as `/tmp/vyd-selected-storage-reachability.mjs`, then run from the repository root:

```bash
npx --yes firebase-tools@14.20.0 emulators:exec --only firestore,storage --project demo-vyaamikk-storage-reachability "node /tmp/vyd-selected-storage-reachability.mjs"
```

Pass `activated` after the script path to check the activated alternative. Expected root output includes the allowed baseline, five independent write denials, three independent read denials, unmatched GRIN denial, and owner-delete denial. The emulator still does not enforce the production two-document budget.

```javascript
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(process.cwd() + '/package.json');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { uploadBytes, getBytes, ref, deleteObject } = require('firebase/storage');
const { doc, setDoc, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
const projectId = process.env.GCLOUD_PROJECT;
if (!projectId?.startsWith('demo-')) throw Error('demo only');
const active = process.argv[2] === 'activated';
const label = active ? 'ACTIVATED' : 'ROOT';
const root = readFileSync(active ? 'rules/activated/storage.rules' : 'storage.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId, firestore: { rules: "rules_version='2'; service cloud.firestore {match /databases/{db}/documents {match /{x=**} {allow read,write:if false;}}}" }, storage: { rules: root } });
const docs = {
  'authSecurity/owner': { revokedBeforeAuthTimeSeconds: 100 },
  'restoreControl/current': { closed: false, reconciled: active, watermark: 1 },
  'restoreControl/mode': { required: false },
  'users/owner': { status: 'active' },
  'deletionJobs/owner': { status: 'cancelled' },
};
const change = async (path, data) => env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), path), data));
const reset = async () => { for (const [path, data] of Object.entries(docs)) await change(path, data); };
const ctx = env.authenticatedContext('owner', { auth_time: 500, vydOriginAuthTime: 200, ...(active ? { authorityWatermark: 1 } : {}), firebase: { sign_in_provider: 'custom' } });
const path = 'users/owner/attachments/record/fixture.png';
const upload = () => uploadBytes(ref(ctx.storage(), path), new Uint8Array([1,2,3]), { contentType: 'image/png' });
try {
  await reset();
  await assertSucceeds(upload());
  await assertSucceeds(getBytes(ref(ctx.storage(), path)));
  console.log(label + '_BASELINE_READ_AND_WRITE_ALLOWED_BY_EMULATOR');
  for (const [path, data] of [
    ['authSecurity/owner', { revokedBeforeAuthTimeSeconds: 200 }],
    ['restoreControl/current', { closed: true, reconciled: false, watermark: 1 }],
    ['restoreControl/mode', { required: true }],
    ['users/owner', { status: 'pending_deletion' }],
    ['deletionJobs/owner', { status: 'completed' }],
  ]) {
    await reset(); await change(path, data);
    if (active && path === 'restoreControl/mode') { await assertSucceeds(upload()); console.log(label + '_UNUSED_MODE_DOES_NOT_DENY'); continue; }
    await assertFails(upload());
    console.log(label + '_WRITE_INDEPENDENT_DENIAL ' + path);
    if (path.startsWith('authSecurity') || path.startsWith('restoreControl')) {
      await assertFails(getBytes(ref(ctx.storage(), 'users/owner/attachments/record/fixture.png')));
      console.log(label + '_READ_INDEPENDENT_DENIAL ' + path);
    }
  }
  await reset();
  await assertFails(uploadBytes(ref(ctx.storage(), 'users/owner/grinEvidence/reserved-original/original'), new Uint8Array([1]), { contentType: 'image/png', customMetadata: { vydEvidence: 'pending' } }));
  console.log(label + '_GRIN_CREATE_DENIED_UNMATCHED');
  await assertFails(deleteObject(ref(ctx.storage(), path)));
  console.log(label + '_OWNER_DELETE_DENIED_REQUEST_RESOURCE_NULL');
} finally { await env.cleanup(); }
```
