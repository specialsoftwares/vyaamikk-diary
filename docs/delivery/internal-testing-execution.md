# Internal testing execution sheet

This is the current sheet for the full-feature internal candidate. `docs/release/packets/DEVICE_EXECUTION_SHEET.md` remains the historical `540e07a` packet.

## Candidate

| Item | State |
|---|---|
| Previous frozen source | `8524b702c6efedeeaec0f335e3312fab8cef31cb` |
| Replacement | The `integration` commit that introduces the synthetic startup redaction fixture and this sheet. Canonical CI has to pass on that exact commit before an EAS build. |
| Draft PR #42 | Stays open, draft, and unmerged. Base `main`. Head ref `integration`. |
| Public release | HOLD |
| Letterhead creation | Retired |
| Device acceptance | Not run |

`8524b70` is no longer the build source once this commit is on `integration`. Do not build or upload from it.

## Backend, still blocked

`CONTENT_DATA_KEY` is not in Secret Manager for `vyaamikk-diary`. It was not created or rotated. The Firebase CLI will not deploy this codebase without creating that secret, because `sealOwnerContent`, `openOwnerContent`, and the seven GRIN callables bind it. No function revision was changed.

Recovery revisions recorded before the aborted deploy, still at 100% traffic:

- `startaccountreactivation-00006-kec`
- `completeaccountreactivation-00007-tik`
- `grinregistergoodsreceipt-00003-raz`
- `grinreconcilecommand-00003-feq`
- `grinmutategoodsreceipt-00003-yiw`
- `grinreadgoodsreceipt-00003-jet`
- `grinreserveevidence-00003-gaf`
- `grinbeginevidenceupload-00003-siw`
- `grinuploadevidence-00003-qig`

`sealownercontent` and `openownercontent` have no prior revision. The seven GRIN services still have `GRIN_GOODS_EVIDENCE_FUNCTIONS=true` and no secret bindings.

Live Storage Rules release `firebase.storage/vyaamikk-diary.firebasestorage.app` (ruleset `a2b0bccc-92b9-43fe-b60f-d0e401963fab`) allows owner create of `users/{userId}/grinEvidence/{objectKey}/original` for PDF, JPEG, PNG, and WebP, with `vydEvidence` metadata allowed. Rules were not changed.

## Not cleared for publication

- Secret scanning alert 1 stays open. See `docs/delivery/secret-scanning-alert-1.md`. The Android Firebase key was not revoked.
- Dependency triage found no release-blocking package to upgrade. See `analysis/deps-security-closeout/TRIAGE-2026-10-27.md`.
- Play versionCode 32 was not re-read. The `support.vyd` token does not include the Android Publisher scope.
- No App Bundle has been built or uploaded for this candidate.
- Node.js 20 for Functions is scheduled for decommission on 2026-10-30. It was not upgraded.

Internal-track publication waits until CI has passed on the replacement commit, `CONTENT_DATA_KEY` exists without being created in this work, and Play confirms an unused versionCode.
