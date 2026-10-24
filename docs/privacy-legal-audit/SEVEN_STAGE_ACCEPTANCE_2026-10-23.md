# Seven-stage security acceptance — current status 24 October 2026

**Decision: HOLD. PR #35 stays a draft. Public release stays HOLD.**

Current branch: `review/seven-stage-acceptance`. Base: `fe330a04a6455d25513143b0763c2085c01134b8` (`security/firebase-session-hardening`). The product corrections are head `39ce8d7690247cede562016faabd00c47c3da268`. This status records that run. Earlier CI identities below belong to their own heads.

A closed `restoreControl/current` fence denies every client token, including phone tokens and custom tokens that do not carry `authorityWatermark`. Those issuers (`mintClientAuthToken` and phone ID tokens) do not mint that claim, and recovery tokens do not either. Required restore mode is the admin document `restoreControl/mode` with `required: true`. In that mode a missing fence, a missing or mismatched claim, or an unreconciled fence denies. While the mode document is absent, unmarked tokens still read unless the fence is closed. A malformed outside-authority snapshot denies. The default database is not an outside authority. That database is not provisioned. No live claim or IAM change is included.

A listener failure invalidates an in-flight diagnostics grant. The receipt cannot turn collection back on. A cached purpose snapshot is not a withdrawal. A new local choice can enable only after the watcher is listening again.

A batch commit that was issued and then lost its acknowledgment is `outcome: unknown` and `submitted: true`. `submitted: false` means the SDK commit was not called. A confirmed commit that the new session must not publish stays `outcome: confirmed`. A permission-denied response stays that error. Logout does not recall a write already handed to the SDK, and the payment id is not replaced.

Credit retries, the opRevision gate, the missing-parent purge, and the transaction-read ownership check remain. Letterhead creation, scanning, cropping and new PDF generation stay retired. Version 2 writes and live migration stay off. Do not cite run `40030962400` for head `39ce8d7`.

Missing-parent descendants are listed with one bounded `showMissing` page, not an unbounded `listDocuments()` call. The emulator owner token is used only when `FIRESTORE_EMULATOR_HOST` is set. A depth overrun or an unknown collection becomes `needs_manual_review` instead of a completed purge. Storage and GRIN page walks renew the deletion lease. Restore admission fails closed when the outside authority is configured and missing, stale, or lists the uid. With that authority unset, an erasure manifest or a closed local fence still denies; that unconfigured state is not a finished live restore gate. No second database is provisioned. Version 2 writes stay off. `CONTENT_DATA_KEYS` is not bound as a deploy secret. The migration helper is count-only unless `CONTENT_KEY_MIGRATION_ENABLED=true`, which is unset.

Run `40075886166` is the pull_request run for head `39ce8d7690247cede562016faabd00c47c3da268`. Job `120819007815` checked out merge `cbe17a724fa71ed38a1127dc389f0a5f43013689`, combining that head with base `fe330a04a6455d25513143b0763c2085c01134b8`. Node v20.20.2, Java 21.0.12. `test:all` 178/178. `ci:verify` PASS. The log recorded the closed-fence denial for unmarked and matching-watermark storage reads, the restore-fence reconciliation line, the missing-parent deletion, the lost-lease page walk, and the credit amount/direct-write checks. `test:expected-revision-boundary` and `test:privacy-acceptance-races` passed inside `test:all`.

Run `40030962400` tested head `45c0640c1e143ea8f80218981fb48d4500f911a7`, merge `868f03c3eac1215e0bb130f53bf9209138ef8063`. It does not cover the restore-fence, consent-receipt, or lost-acknowledgment corrections. Do not cite run `40016386544`, run `40009577949`, run `40024881636`, or run `40027034074` for those corrections either.

Outside authority, if later authorised, is one named Firestore database that is not `(default)`, plus the admin documents `restoreControl/mode` and `restoreControl/current`. The snapshot document is `authority/restore`. Retention is the life of the erasure decision, not ordinary maintenance. Recovery is a new watermark written only after the erased uid and withdrawn purposes are copied into that snapshot and the local fence is reconciled. Cost is one extra database and one small document per authority update. This source does not create the database. While `RESTORE_AUTHORITY_DATABASE_ID` is unset, completion skips the outside write and still records the in-database erasure manifest. A set but invalid id, a missing seed document, or a malformed snapshot stops completion with `needs_manual_review` and does not replace the snapshot. A purpose withdrawal uses the same writer before the local receipt when the authority is configured.

## Historical handoff — 23 October 2026

**Decision at that date: HOLD. The seven-stage program was not fully implemented or accepted.**

Source/test candidate then: `890bd95ec914ccb63f1725fd0b329f33977e7d83` on local branch `security/seven-stage-acceptance`, based on `fe330a04a6455d25513143b0763c2085c01134b8` (`security/firebase-session-hardening`). A later documentation-only commit records the handoff. No remote branch or PR was created at that time: direct Git push lacked credentials, and the GitHub connection returned HTTP 403 with repository permissions `pull: true, push: false`. The earlier green run 39836244298 tested only the base; it is not evidence for this correction. Source was changed in an isolated branch. No production deployment, data migration, native build, account purge, key/IAM change, billing activation or store operation occurred.

## What this correction changes

- Age responses are fenced to the requesting uid, auth generation and mounted screen. Session persistence checks ownership inside its existing serialized queue, including ownership changes during storage writes. The server assessment rechecks active account status inside its profile transaction. DOB remains unretained and self-declaration is not identity verification.
- Four business create adapters prepare ciphertext before the atomic record/counter/quota write. A failed seal cannot leave a plaintext record or quota charge. Existing-record replay does not request a fresh seal. The old second unversioned sealing write is removed from the shared settlement helper.
- AES-GCM opens require canonical base64, a 12-byte nonce and a full 16-byte tag. Business opens validate the actual owner, record, collection and purpose, plus record revision. Profile seals retain their own authenticated revision because unrelated server identity updates advance `users.updatedAt`. Decrypted values can replace only allowlisted sensitive fields.
- Credit payment reads bind to the real record ID. Credit closure/charges and professional-pack attachment/reminder metadata join the protected fields. Existing historical plaintext is not migrated by this patch.
- Optional diagnostics uses an owner-scoped durable outbox and server receipt revisions. Stale grants conflict; withdrawals take precedence; receipt replay returns current state. Local reporting stays off until this device's affirmative choice is persisted and acknowledged. A delayed grant/read cannot re-enable an older state. Failed local persistence does not transmit a grant. A withdrawal still attempts the remote stop when local persistence fails.
- Deletion job patches compare generation, lease owner and unexpired lease in a transaction. Index retirement shares that check. Lease acquisition honors retry time and the preserved grace deadline. Completed jobs cannot be replaced by new generations. Scheduler cursors advance across unchanged rows. Storage listing disables automatic pagination and stops after bounded pages. The user tombstone excludes old profile/ciphertext. Completion writes a minimal server-only erasure manifest; restore suppression also handles an absent user parent. Unexpected nested Firestore data fails closed instead of being silently orphaned.

## Acceptance matrix

| Stage | Current evidence and disposition | Blocking work/evidence |
|---|---|---|
| 1 — inventory/policy | Approved Option A, self-declared adulthood and new-request deletion clocks preserved. Historical inventory retained as historical. **PARTIAL** | Reconcile all field/copy/retention entries with current adapters and live resources. Legal applicability and provider terms were not reverified in this continuation. |
| 2 — age admission | Boundary suite, session races and existing admission suite pass. Server now uses an active-profile transaction. **SOURCE VERIFIED IN PART** | Callable race integration and installed-device accessibility/admission acceptance remain unverified. |
| 3 — transport/device storage | Existing diagnostics redaction and session tests pass. No native/network changes. **LIVE/DEVICE PENDING** | Actual TLS negotiation, release backup behavior, Keystore/SecureStore and local SQLite/cache protection. SQLite is not encrypted by this patch. |
| 4 — encryption/custody | AES parser tests and atomic encrypted creates pass; failed writes/replays exercised. Option A is controlled server decryption, not E2EE. **PARTIAL** | Versioned key rotation/migration and rollback; complete legacy migration and old-client enforcement; GRIN protection and all additional projections/config/profile snapshots need a field-complete audit. Live secret IAM and runtime roles unverified. Sealed letterhead parents are addressed in the independent review below. |
| 5 — purpose consent | Owner outbox, CAS/replay, offline retry, storage failure, listener-failure, restart, reconnect and account-switch tests pass. A failed watcher invalidates an in-flight grant. **PARTIAL** | Native buffering and provider retention are separate device/provider evidence. Continuous cross-device withdrawal propagation and receipt retention expiry remain. If both storage and network fail before process death, durable opt-out cannot be guaranteed; reporting stops in that process and the UI exposes the error. |
| 6 — deletion | Missing-parent purge, cursor ownership, lease loss during a real paged walk, closed-fence Rules and the outside-authority writer contract pass in source/emulator tests. **PARTIAL** | The independent authority database is not provisioned. Unknown and deep collections stay `needs_manual_review`; that hold is not full erasure. Storage generations, soft-deleted objects, provider erasure and deadline alerting remain live/provider evidence. |
| 7 — acceptance/release | Run `40075886166` passed for head `39ce8d7` / merge `cbe17a7`. Letterhead creation stays retired. Public release stays HOLD. **HOLD** | Live IAM, the independent authority database, key-ring binding, migration, real-device recovery and Play readiness remain blocked. |

## Verification

Host: Node 24.19.0, Java 17, firebase-tools 14.20.0, Firestore emulator 1.19.8. Canonical Actions uses Node 20 and Java 21. Local TypeScript suites were invoked with `node --import <scratch-tools>/tsx/dist/loader.mjs` because this host blocks the tsx CLI's Unix IPC socket. This is local test evidence, not a canonical CI PASS.

Passed locally:

- `npm run typecheck`, `npm --prefix functions run build`, `npm run lint:eslint`, and `git diff --check` (rerun after final source changes).
- Fourteen package suites: `test:privacy-acceptance-races`, `test:content-encryption`, `test:diary-seal`, `test:age-eligibility`, `test:business-admission`, `test:account-deletion-unit`, `test:deletion-policy-v2`, `test:grin-t2-cleanup`, `test:legal-consent`, `test:auth-session-security`, `test:safe-diagnostics`, `test:reactivation-email`, `test:i18n`, `test:option-c-quota-unit`.
- Firestore emulator: `firestore.rules.test.ts`, `firestore.rules.billing.test.ts`, `src/billing/optionC/phaseG.quota.emulator.test.ts`, `src/services/letterhead/letterheadQuota.emulator.test.ts`, `src/services/diary/diary.firebaseUpdate.emulator.test.ts`.

The final encrypted credit edit/closure scenario also passed: payments and payer details round-trip through ciphertext, failed protection leaves the stored record unchanged, and edits add no quota. Canonical Actions on the final head is BLOCKED by repository write access and has not run for this candidate. Do not infer a PASS from scheduling a test. Tests exercise synthetic owners; no customer payload or credentials are in this report.

## Compatibility, resources and rollback

No new application dependency, infrastructure or index is introduced. CI additionally accepts PRs into the existing security branch so this isolated correction can run the same canonical gate without merging to main.

Source changes affect `recordAgeAssessment`, `recordProcessingPurpose`, the content seal/open runtime, and deletion callables/scheduler through shared helpers; the client and Firestore Rules also change. Consent writes add `users/{uid}/processingPurposeEvents/{operationId}` and revisioned `processingPurposes` state. Deletion adds `erasureManifests/{uid}`, maintenance cursors and optional job retry/deadline metadata. Client receipt state uses an owner-specific AsyncStorage key. These server-only data paths remain denied by the default Rules boundary except the existing owner-readable purpose state.

Before any deployment: resolve the holds above; test mixed-client compatibility; identify actual target project, function revisions, rule release, content-key secret/version and runtime IAM; keep billing KMS separate; test a synthetic canary and recovery. Consent clients require the matching receipt protocol. No secret rotation or migration may be inferred from this code.

Rollback must retain readers for existing envelopes. Do not delete the content key or restore a plaintext writer over an existing seal. Stop new protected writes using the existing write gate if needed, retain envelope reads, and roll back only after checking current receipt/job schema compatibility. Never lower revocation cutoffs or remove erasure manifests to make old code run.

Expected cost delta is additional reads and callables for encrypted creation/consent, plus bounded deletion metadata writes. One server existence read precedes new protected atomic creates. No rupee estimate is established without measured usage, configured region and current service pricing. No new paid resource was provisioned.

## Independent integration review

The bundle was verified against `fe330a04` and imported as `review/seven-stage-acceptance` without changing the dirty goods-evidence checkout. File hashes in the handoff manifest matched the imported tree. The CI edit only adds `security/firebase-session-hardening` to `pull_request` branches. Push to `main` and `workflow_dispatch` are unchanged.

Canonical CI for head `6cd265f176f1a8e41c892eee6cba63e1942705d4` already ran. Run `39984058597` was a successful `pull_request` run, attempt 1, job `120518527428` (`verify`). The checkout was `refs/remotes/pull/35/merge` at `d154c7c2aaa14f2e232d91cb902c1e3e22f7f2fb`, with parents `fe330a04a6455d25513143b0763c2085c01134b8` and `6cd265f176f1a8e41c892eee6cba63e1942705d4`. Logs recorded `test:all` 177/177 and `ci:verify` PASS on Node 20 and Java 21. That run does not cover commits after `6cd265f`. An earlier draft of this section said the pull-request filter could not run until it reached the default branch and that this candidate still needed `workflow_dispatch`. Those statements were wrong for run `39984058597`.

The integrated candidate is head `2559af561da164719ebca90ddb974b21ee22cf49`. Run `40013964197` was a successful `pull_request` run, job `120621138239` (`verify`). The checkout was `refs/remotes/pull/35/merge` at `c06e234b3bc9221e9cdbfb323342e21f2a44a861`, parents `fe330a04a6455d25513143b0763c2085c01134b8` and `2559af561da164719ebca90ddb974b21ee22cf49`. Logs recorded Node v20.20.2, Java 21, `test:all` 177/177, and `ci:verify` PASS. Run `40009577949` for `a97cdb1` also reported `ci:verify` PASS, but its credit script exited before the deletion, session, and quota lines. Do not use that run, or run `39984058597`, as evidence for `2559af5`.

The imported correction was re-run here, not accepted from the coordinator log: `test:privacy-acceptance-races`, `test:content-encryption`, `test:diary-seal`, `test:age-eligibility`, `test:business-admission`, and `test:deletion-policy-v2` passed. Host Node was the local toolchain, not Actions Node 20.

A sealed letterhead parent previously could not mint its diary mirror, because mirror validation still required plaintext letter input. Rules and the diary parent check now accept a sealed parent (`title == "sealed"`, `input == null`, owner-bound envelope) or the existing plaintext parent. A wrong-collection envelope cannot mint a mirror. A sealed parent with plaintext `input` is rejected.

The production diary writer seals the mirror as well. The stored mirror keeps only `payload.letterheadDocumentId`. The letter body is inside the diary envelope. A mirror that also stores the body is denied. Quota exemption still requires the real parent and the deterministic id. `letterheadQuota.emulator.test.ts` passed both the older plaintext mirror and this encrypted parent-plus-mirror case. The static read budget stayed 5 and 6. Rules still cannot prove the ciphertext is authentic. Letterhead creation screens remain redirects to the saved-letter list. The create route stays read-only.

Customer Credit payment, closure, and edit writes now commit with the revision they read. Encryption stays outside the transaction. A conflict re-reads, decrypts, and reseals. The same payment id is not added twice. `creditRevision.emulator.test.ts` ran two clients against the emulator. Run `40013964197` printed every line: both payments remained, the same millisecond did not reuse one revision, the retried payment id was not added twice, the closure kept the newer payment, the edit and the closure both survived, deletion during preparation was not recreated, a session generation change did not commit, and the edits did not charge a creation slot. An earlier copy of that test waited on a bare promise, so the process could exit successfully before those last three checks. Purchase-order, professional-pack, and sealed diary updates use the same retry. A rules expression that compares the sealed credit document fails evaluation, so old direct writes are not yet rejected by Rules. The repository transaction is the executed guard.

The age screen clears the typed date after a decision, sign-out, or a deletion request. The date is still not stored.

Overall decision remains **HOLD**. Run `40013964197` is canonical CI for `2559af5`. Run `39984058597` remains the record for `6cd265f` only. This review is not independent third-party acceptance and not a public-release decision. PR #35 stays a draft.

## Installed Android tests still pending

These are not executed. An injected JavaScript adapter is not evidence for them.

- Native diagnostics buffering: confirm a grant is not delivered to the native collector before the server snapshot is known, and that a listener failure clears a buffer that was already queued.
- Replacement-phone recovery: sign in on a second device with the supported recovery flow and confirm the new custom token carries `authorityWatermark` while `recoveryDeviceId` and `recoverySession` remain. The source device is absent.
- Account switching: start a diagnostics grant on account A, switch to account B before the receipt, and confirm B does not collect under A's grant.

## Plain-language brief

This correction removes a write window that could briefly save private business details before encrypting them, prevents old responses from changing a new login or reviving crash-report consent, and strengthens deletion worker ownership. Those are tested improvements. They do not establish that every copy is encrypted or erased, that the company cannot decrypt data, or that all seven stages have passed. The remaining source, live-service and phone checks above are release blockers.

## Exact changed-file inventory

The following paths are the correction's source/test/config scope relative to the base. The document and evidence-index updates are additional report files.

- `.github/workflows/ci.yml`
- `firestore.rules`
- `functions/src/deletion/deletionJob.ts`
- `functions/src/deletion/deletionSafety.ts`
- `functions/src/deletion/deletionSafety.unit.test.ts`
- `functions/src/deletion/finalPurge.ts`
- `functions/src/deletion/firestorePurge.ts`
- `functions/src/deletion/lifecycle.ts`
- `functions/src/deletion/restoreSuppression.ts`
- `functions/src/deletion/restoreSuppression.unit.test.ts`
- `functions/src/deletion/storagePurge.ts`
- `functions/src/identity/recordAgeAssessment.ts`
- `functions/src/privacy/contentEncryption.ts`
- `functions/src/privacy/contentEncryption.unit.test.ts`
- `functions/src/privacy/processingPurpose.ts`
- `functions/src/privacy/processingPurposeState.ts`
- `package.json`
- `src/auth-v2/screens/AgeDeclarationScreen.tsx`
- `src/billing/optionC/atomicBillableCreate.ts`
- `src/billing/optionC/phaseG.quota.emulator.test.ts`
- `src/components/settings/CrashReportsPreferenceRow.tsx`
- `src/components/telemetry/TelemetryConsentHost.tsx`
- `src/i18n/locales/en.json`
- `src/i18n/locales/gu.json`
- `src/i18n/locales/hi.json`
- `src/i18n/locales/ta.json`
- `src/i18n/locales/te.json`
- `src/services/auth/ageAssessmentResponse.test.ts`
- `src/services/auth/ageAssessmentResponse.ts`
- `src/services/auth/identityCallable.ts`
- `src/services/consent/purposeConsent.ts`
- `src/services/consent/purposeConsentQueue.test.ts`
- `src/services/consent/purposeConsentQueue.ts`
- `src/services/customerCredit/firebase.ts`
- `src/services/letterhead/documents-firebase.ts`
- `src/services/privacy/businessCloudSeal.test.ts`
- `src/services/privacy/businessCloudSeal.ts`
- `src/services/professionalPack/firebase.ts`
- `src/services/purchaseOrder/firebase.ts`
- `src/services/sessionPersistence.ts`
- `src/services/telemetry/CrashReportingBridge.tsx`
- `src/state/auth.tsx`
