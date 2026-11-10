# Release candidate readiness — 2026-11-10

Status: **HOLD. No accepted signed release candidate, deployment, Play upload or device acceptance.**

## Source identity and scope

Work is isolated on `fix/release-candidate-readiness`. It combines the reviewed PR #55 head `b4ae1ed030e79fa245b8a7c6c2ed4e8ee4ae3753`, PR #54 head `9c06e013336e41c6ade2256b9ac0f047a5ab1d74`, and main `695833453b9524b34d4ecc857ebdfa58c0bc04b8`, with corrective commits. The source tree and final remote commit must be recorded after verification. No main or integration branch ref, existing draft PR, live account or deletion job is changed by this worktree.

PR #54 run `42792860573` was re-read as completed/success, attempt 2, for `9c06e01`. It does not certify this combined candidate. The candidate needs its own automatic pull-request check and exact source SHA.

The merged source currently contains versionCode **34**, which is already used. This is not a version reservation or an uploadable candidate. A new unused code must be established from fresh Play/EAS inventory and changed together with both version-contract assertions before a signed build.

## Corrections being verified

| Area | Result and practical boundary |
| --- | --- |
| Phone authentication | Native-owned verification callbacks and credential-task barrier; JS retirement cannot cancel Firebase but prevents stale publication. Contact-change challenges carry purpose and expected UID and cannot resume as login. No actual SMS delivery is proved by host tests. |
| Contact change | Bounded operations, immediate Back, and owner/epoch guards; native update shares the credential barrier. |
| Recovery and mailbox | Verified mailbox binding and phone proof checked on production callables. Wrong-factor locks persist. Cross-UID replacement-phone transfer is explicitly unsupported and directs to support before mutation. |
| Recovery completion | Persisted finalization phases reconcile ambiguous revocation, token issuance and notification failures. Interrupted recovery requires fresh same-UID phone authentication; it does not admit an old bearer to bypass the cutoff. |
| Legal consent | Each pending choice has its own persisted revision. Acknowledgements require revision, payload and current session ownership; old acknowledgements cannot clear an identical newer choice. Legacy pending envelopes upgrade in the serialized mutation queue. |
| Crash consent | Early native provider resets both pinned SDK auto-collection overrides before Firebase initializes. Manual dispatch requires matching prior owner/revision; ambiguous/mixed queues stay quarantined. Listener failures retain the pending choice; fresh server acknowledgement and successful native activation are required. A void SDK deletion request is not completion proof. Some mixed/withdrawn queue states require a restart before a later grant can activate. |
| Screen and age state | Same-session cached refreshes can settle errors; account changes hide old data immediately. Recent searches are focus/owner fenced. Demographic writes serialize with purge and never grant authorization. |
| Selected Firestore rules | Additive GRIN reads use the existing active owner/session/restore/deletion guard; client writes remain denied. This does not repair Storage authorization. |

## Verification evidence

- `pendingChoiceOwnership.regression.test.ts` failed against the original production storage module: an old acknowledgement deleted an otherwise identical new choice. It passes after revision binding.
- Pending-consent acknowledgement/clear race and production onboarding/profile-writer tests passed, including null session during read and same-UID epoch change before acknowledgement.
- Native send/contact/restore ownership regressions exercise production adapters with synthetic native/storage ports. They are not native-device or carrier tests.
- Recovery Auth+Firestore emulator suite passed ten production-path groups, including five interruption phases, fresh-phone continuation, newer logout/deletion/restore denial, wrong-factor budgets and canonical-UID next login. Email identity/provider acceptance and budget emulator tests passed. No live SMS/email was sent.
- Selected root and activated Firestore GRIN rules failed before (owner read denied) and passed after in the Firestore emulator.
- Local focused main-readiness, recoverable-phone-auth, screen-state, onboarding/consent/loading and native-crash adapter suites passed. Additional pending phone-bind and retry regressions passed. TypeScript and the repository `lint:eslint` command passed. These checks use synthetic ports where documented; final-head canonical CI remains necessary.
- A broad local aggregate run on Node 22.19.0 passed 179/199 suites while edits were ongoing. It used a TSX loader substitute because this host rejects the TSX CLI Unix socket. Failures included missing CI configuration, Chromium/tool transport, Node 22 legacy fake-DOM assumptions, and actionable merge/consent contracts. This is **not** `ci:verify PASS`, is not canonical CI and is not final-head certification.
- Android dependency resolution confirmed Expo SDK 54 / Firebase BoM 34.14.0, native Auth 24.1.0 and Crashlytics 20.0.6. Compilation uses a synthetic demo Firebase file, not the EAS secret or live project configuration. The first compile stopped because the host initially had a JRE without javac; a verified portable JDK 21 corrected that toolchain problem. Final application Kotlin compilation is pending.

## Remaining release blockers

1. **Storage authorization architecture.** See [STORAGE_AUTHORIZATION_BLOCKER.md](./STORAGE_AUTHORIZATION_BLOCKER.md). Current selected paths and production Firestore-document access budget are incompatible with the required protections. The emulator does not enforce this production limit. A reviewed server-mediated boundary and an old-client compatibility transition are not implemented. Do not deploy the source Storage rules as a complete release solution or silently weaken the guards.
2. Final native/consent implementation, independent review, combined typecheck, focused tests and automatic canonical CI on the exact corrective head must pass.
3. This execution environment has no authenticated EAS account or Google/Firebase credentials. Live rules, revisions, secret bindings, Play inventory and upload certificate cannot be certified from historical records.
4. A reviewed deployment manifest must identify only the changed callable/rules boundaries, current serving revisions and rollback. Existing secrets must be reused. No broad Functions deploy, deletion-job change or account mutation is implied.
5. One new signed AAB must be built from the frozen approved source using the verified Firebase file and unused versionCode. Record build ID, source SHA, package, manifest version, certificate and artifact SHA-256.
6. Install that exact artifact through the accepted testing route and complete normal login/reactivation, wrong/expired code, timeout/Back/change-number, account switch, first save/read, upload/read/delete, consent withdrawal/restart and offline/error/loading checks. Preserve the installed account data; do not manufacture repeated OTP attempts.

Public publication remains HOLD. A successful unauthenticated 401, a passing host suite, an available Play release, or a provider `onCodeSent` callback is not signed-device acceptance or proof of handset SMS receipt.
