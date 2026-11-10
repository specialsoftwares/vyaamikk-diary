# Storage authorization: candidate release blocker

Review date: 2026-11-10. This is a source/configuration review and local emulator experiment, not a read of serving Firebase Rules or live IAM. No rules, functions, keys, accounts or objects were changed in production.

## Why the selected source is not deployable as a complete Storage policy

`firebase.json` selects root `storage.rules` and `firestore.rules`. Root Storage Rules currently cover owner letterhead, attachments and PDFs. They contain no `grinEvidence` matcher, so their final deny catches the integration client's GRIN upload path.

The protected owner checks read multiple distinct Firestore documents: `authSecurity/{uid}`, `restoreControl/current`, `restoreControl/mode`, `users/{uid}`, and `deletionJobs/{uid}`. The GRIN proposal additionally reads admission, object-key reservation and ledger documents, plus a derivative reservation when relevant. Reusing all these checks directly in an additive Storage matcher would exceed Firebase's production cross-service access budget.

The [official Storage Rules conditions documentation](https://firebase.google.com/docs/storage/security/rules-conditions#enhance_with_cloud_firestore), read on 2026-11-10, limits one evaluation to two Firestore documents. Repeated reads of one document can be cached; reads of these different document paths cannot be collapsed by renaming helper functions.

`docs/release/rules-compat/proposed-grin/storage.rules` is a historical proposal, explicitly marked not for deployment. Its simple `isOwner` also omits the current session/restore guards. Copying it would both exceed the document budget and weaken existing protections. Neither root nor that proposal should be deployed as a complete compatible release policy without resolving this design.

## Emulator limitation reproduced

A local experiment used project `demo-vyaamikk-storage-budget`, Firebase CLI 14.20.0, Firestore emulator 1.19.8 and Storage Rules runtime 1.1.3. It created three existing Firestore documents (`budget/a`, `budget/b`, `budget/c`) and a Storage rule requiring `firestore.get(...).data.ok` on all three. An authenticated object read succeeded, printing `THREE_DISTINCT_FIRESTORE_DOCUMENTS_ALLOWED_BY_EMULATOR`.

Therefore a green Storage emulator result does not certify compliance with the production two-document limit. The existing isolated GRIN rules tests prove their modeled allow/deny predicates only. This experiment did not send an SMS, access a live project or change production data.

The separately added `grin.selectedFirestoreRules.emulator.test.ts` does test the actual selected Firestore files and is not subject to the Storage-specific two-document rule. It failed against the prior root rules (owned GRIN read denied) and passed against the corrected root and activated Firestore files. It verifies owned reads/listing and denies client writes, foreign/anonymous access, inactive accounts, completed deletion, revoked sessions, restore closure, mismatched watermark, erased claims and missing parents. This is prototype Rules verification; independent review and live deployment verification remain necessary.

## Smallest compatible boundary to design and review

Use an authenticated server-mediated object endpoint instead of inventing an asynchronously mirrored Storage ACL. Derive the UID from a verified bearer token and reuse the existing admission, session-cutoff, restore, active-account and deletion guards. Keep a strict canonical operation/path allowlist. For GRIN originals, also resolve the existing server-written reservation, ledger and admission state, set pending metadata on the server, enforce MIME/size and create-generation preconditions, and leave trusted hash/seal/generation verification with the existing `grinUploadEvidence` lifecycle. Recheck authority before committing a delayed upload; an uncertain result must remain retryable without authorizing a replacement object.

Current integration points are bounded:

- `src/services/storage/userStorageUpload.ts` uploads generic owner bytes using Expo `uploadAsync`, then fetches metadata/download URLs through the client Storage SDK. The endpoint can replace this transport without changing stored object paths.
- `src/services/storage/userStorage.ts` performs metadata reads, protected-envelope downloads, legacy download URL retrieval and object deletion. Move these operations to authenticated server requests; preserve legacy plaintext readability and sealed-envelope handling.
- `src/services/attachments/prepareReceiptPhoto.ts` and `src/services/letterhead/letterheadImageResolver.ts` consume downloaded/cached URLs. Use authenticated downloads into owner-scoped local files and preserve existing local cache/session fences. Do not persist a local URI as a cloud download URL.
- `src/services/grin/transport/evidenceTransport.ts` uploads originals via `uploadBytesResumable` plus `getMetadata`. Replace only its production object transfer with the authenticated endpoint. Reservation/begin/verify callables and generation-bound sealing retain their responsibilities. Derivative transport is currently refused by this production client. GRIN export currently consumes local original bytes; it is not evidence of an implemented cloud-original download endpoint.
- Existing company invoice/report objects remain server-only under their separate authorized download design.

A signed/resumable URL is not an equivalent replacement for immediate session/restore checks: possession can outlive a subsequent revocation or account-state change. If such URLs are considered, their revocation semantics need an explicit product/security decision rather than an implicit bypass.

## Why two documents cannot be substituted without migration

`authSecurity/{uid}` plus a new consolidated account document would still omit the global restore fence and GRIN reservation/ledger state. A consolidated ACL needs all relevant authoritative writers to update it transactionally, initialization for existing accounts/reservations, fail-closed behavior on missing/stale ACLs, and restore ordering that cannot resurrect obsolete grants. Background triggers alone leave a window after revocation/deletion. No such schema, writer protocol or backfill exists in this candidate.

The server-mediated design can preserve existing bucket paths and bytes without re-encryption or account-state backfill. It still requires implementation, security review, endpoint and client tests, runtime size/memory/timeout validation, and deployment. It is not implemented in this corrective candidate.

## Release and rollout dependencies

1. Re-read the serving Storage/Firestore release identifiers and source, live function revisions, bucket configuration and IAM before producing an exact deployment plan. Repository proposal files are not live evidence.
2. Review the endpoint design and implement production-path tests for ownership, stale sessions, restore/deletion fences, replay, stream failure, generation conflicts, legacy reads and backend success with lost client response.
3. Deploy only the reviewed endpoint/dependencies with the existing secret versions and resource limits after acceptance. Confirm authenticated authorized and denied behavior; HTTP 401 alone is not acceptance.
4. Build a new signed binary that uses the endpoint and confirm the exact artifact/configuration on a device. Existing installed clients still use direct Storage operations.
5. Decide old-client support/retirement before tightening direct Storage Rules. A gateway does not retroactively change installed binaries; disabling their direct access can break uploads and reads. Keep the current live rules unchanged until this compatibility transition is explicitly reviewed.
6. Verify the signed candidate's complete upload/read/delete and GRIN reserve/upload/verify paths. Do not mark the public release, source configuration or artifact accepted while this blocker remains.

The candidate's Storage files were intentionally left unchanged after identifying this constraint. The selected Firestore GRIN additions do not solve Storage transport authorization.
