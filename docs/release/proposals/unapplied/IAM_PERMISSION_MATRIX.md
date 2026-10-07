# Unapplied — GRIN service permission matrix

Not a live IAM write. Firestore Security Rules do **not** constrain the Admin
SDK. There is no supported document-path IAM isolation that would confine
Admin Firestore reads/writes to `users/{uid}/goodsEvidence*` only.

## Matrix

| Principal | API operation | Supported resource scope | Permission / role | Residual access |
|---|---|---|---|---|
| Cloud Functions runtime service account for existing `asia-south1` identity/deletion functions (default App Engine / Compute SA unless a dedicated GRIN SA is created) | Firestore `get` / `set` / transactions on user, admission, ledger, command, serial, receipt, evidence-object, object-key, and upload-control documents | IAM for Cloud Firestore is **database-level** (`roles/datastore.user` on the project's `(default)` database). Conditions cannot honestly isolate `users/{uid}/goodsEvidence*` from other user documents. | Existing Datastore User (already required for identity/deletion). Do not invent a per-collection IAM role. | Admin can read and write **any** document in that database, including diary/PO/credit/letterhead paths. Rules never apply. |
| Same runtime SA | Firestore reads of `users/{uid}` (account status), `users/{uid}/goodsEvidenceAdmission/runtime`, and `users/{uid}/goodsEvidenceLedgers/{ledgerId}` | Same database-level role | Same | Required for fail-closed gates. Cannot be scoped to GRIN trees only. |
| Same runtime SA | Storage `objects.get` / `objects.getIamPolicy` unused / metadata `storage.objects.get` on the reserved original | Bucket `vyaamikk-diary.firebasestorage.app`. Optional IAM condition: `resource.service == "storage.googleapis.com" && resource.type == "storage.googleapis.com/Object" && resource.name.startsWith("projects/_/buckets/vyaamikk-diary.firebasestorage.app/objects/users/")`. Prefix conditions **are** a documented GCS IAM feature. A `grinEvidence/`-only prefix is **not** verified on this project in this slice (CLI token expired; no live IAM get). | Prefer `roles/storage.objectViewer` on that bucket (or `storage.objects.get` custom role). Do **not** grant `storage.objects.delete` for the first export. | If the condition is omitted, Admin can get **every** object in the bucket (letterhead, attachments, PDFs). If the condition uses `objects/users/`, residual includes all user objects, not only GRIN originals. Per-uid IAM for many testers is not a single condition. |
| Same runtime SA | Storage `objects.create` / overwrite | Not required for client PUT. Adapter `putIfAbsent` exists for emulator/Admin paths; live client upload is JS SDK PUT under Storage Rules. | Do not add `storage.objects.create` or `storage.admin` for the first export unless a later review proves Admin PUT is required in production. | Console/Admin overwrite remains a residual human risk. |
| Firebase Auth (callable identity) | `request.auth.uid` | Project Auth | Existing | Client-supplied uid is not authority. |
| Signed-in mobile client | `httpsCallable` on the seven names | Function invoker on those functions once exported | Cloud Functions Invoker for `allUsers` is the Firebase callable default; App Check is **not** enforced on existing identity callables — do not add it only on GRIN. | Unauthenticated callables return `unauthenticated`. |
| Signed-in mobile client | Storage create/read of reserved `users/{uid}/grinEvidence/{objectKey}/original` | Objects matching **Storage Rules**, not IAM | Client uses security Rules. | Client cannot overwrite/delete originals (Rules deny). Admin/Console can. |
| Firebase Console human (Owner/Editor) | Firestore/Storage Console | Project | Existing owner/editor | Residual: overwrite or delete originals and serial docs. Not a worker identity. |

## What this matrix does not claim

- Firestore Rules do not limit Admin.
- There is no document-path IAM cage for GRIN collections.
- A Storage prefix condition has not been read back from live IAM in this
  slice (`firebase login --reauth` required). Treat it as a supported GCS
  pattern to **verify on apply**, not as already configured.
- Emulator Storage Rules 403 on a wrong PUT path does not prove live IAM.

## Required reads vs GRIN writes

Callables must read, via Admin:

- `users/{uid}` (active / inactive / pending_deletion)
- `users/{uid}/goodsEvidenceAdmission/runtime` (missing/malformed/deny)
- `users/{uid}/goodsEvidenceLedgers/{ledgerId}` (ownerUid + active)
- GRIN command / serial / receipt / evidence documents under that owner
- Storage object metadata and bytes at the bound path + actual generation

Those reads are why a Functions SA cannot be reduced to “GRIN write-only.”
