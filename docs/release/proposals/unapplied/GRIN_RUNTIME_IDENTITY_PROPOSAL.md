# GRIN-specific runtime identity — proposal (not applied)

Not a live IAM write. Do **not** change
`982505811909-compute@developer.gserviceaccount.com` (`roles/editor` today).
That account runs identity / email / deletion / billing. Tightening it risks
those functions. Broad privilege **exists**; omitting a new delete role does
not remove Editor delete. Least-privilege for **public** GRIN is an explicit
owner decision (Approval A5 / D).

Firestore Admin IAM is **database-level**. There is no honest document-path
cage for `users/{uid}/goodsEvidence*`. Storage prefix conditions **are** a
documented GCS feature and must be read back on apply.

## Proposed new principal (later approval)

| Item | Proposal |
|---|---|
| SA | `grin-functions@vyaamikk-diary.iam.gserviceaccount.com` (name TBD on apply) |
| Bound to | The seven GRIN gen2 functions only, after they exist |
| Firestore | `roles/datastore.user` on `(default)` — residual: Admin can read/write any doc in that database |
| Storage | custom or `roles/storage.objectViewer` on bucket `vyaamikk-diary.firebasestorage.app` with condition `resource.name` prefix `users/` + `grinEvidence/` **if** the condition verifies |
| Delete | **Do not** grant `storage.objects.delete` / objectAdmin / admin |
| Invoker | Firebase callable default; do not add App Check only on GRIN while identity callables lack it |

Required Admin reads (why write-only is impossible): `users/{uid}` status,
admission, ledger, command/serial/receipt/evidence docs, Storage metadata and
bytes at the bound path.

## Verification on apply (not done)

`gcloud functions describe` each GRIN name: `serviceAccountEmail`, ingress,
secret env count. IAM get on project + bucket. Do not use Editor as proof of
least privilege.

## Rollback

Leave the shared Editor account unchanged throughout. If the new SA fails,
GRIN functions stay gated off; identity functions keep Editor.
