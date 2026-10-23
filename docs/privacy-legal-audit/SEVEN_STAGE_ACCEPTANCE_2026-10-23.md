# Seven-stage security acceptance — 23 October 2026

**Decision: HOLD. The seven-stage program is not fully implemented or accepted.**

Source/test candidate: `890bd95ec914ccb63f1725fd0b329f33977e7d83` on local branch `security/seven-stage-acceptance`, based on `fe330a04a6455d25513143b0763c2085c01134b8` (`security/firebase-session-hardening`). A later documentation-only commit records the handoff. No remote branch or PR was created: direct Git push lacked credentials, and the GitHub connection returned HTTP 403 with repository permissions `pull: true, push: false`. The earlier green run 39836244298 tested only the base; it is not evidence for this correction. Source was changed in an isolated branch. No production deployment, data migration, native build, account purge, key/IAM change, billing activation or store operation occurred.

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
| 5 — purpose consent | Owner outbox, CAS/replay, offline retry, storage failure and response-order tests pass. **PARTIAL** | Continuous cross-device withdrawal propagation (current client reconciles on launch, foreground, reconnect and settings focus), provider-side stop/erasure evidence and retention expiry for receipts. If both storage and network fail before process death, durable opt-out cannot be guaranteed; reporting stops in that process and the UI exposes the error. |
| 6 — deletion | Lease/backoff/cursor/tombstone/restore tests pass. Existing deadlines preserved. **PARTIAL** | Full bounded recursive/orphan collection coverage; per-batch lease renewal for long workers; all Storage generations/soft-deleted objects; provider-specific request/acknowledgment/expiry tracking; isolated restore-before-traffic gate with manifests outside the restored dataset; deadline alerting and retained-identifier policy. Daily suppression is not an isolated restore gate. |
| 7 — acceptance/release | Coordinator testing only; no independent acceptance claim. **HOLD** | Canonical CI on final head, remaining server race tests, clean-client original-photo recovery/PDF regeneration and real-device acceptance. Release/deployment remains separate. |

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
