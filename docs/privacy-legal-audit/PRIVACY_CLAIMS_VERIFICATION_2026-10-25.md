# Privacy claims verification — 25 October 2026

Audit documentation only. No product code, flag, deployment, store form, or live page was changed. This revision corrects the first draft on the same branch. It does not make the wording ready for publication.

**Audited source:** `main` at `ba317f5b17b73164f5c9768d783cf52128339511` (merge of PR #39).  
**Branch:** `feature/privacy-claims-verification`, cut from that commit.  
**Canonical CI on that source commit:** push run [40184077103](https://github.com/specialsoftwares/vyaamikk-diary/actions/runs/40184077103), completed success. That run does not prove a Functions deploy, a device install, or Play Console contents.

A constant or sentence on `main` is source behaviour. It is not, by itself, the behaviour currently serving users. The deployed deletion Functions and the client build in users’ hands were not identified. Live pages are not rewritten in this audit, and they are not treated as wrong merely because `main` differs.

Public submission remains HOLD. Letterhead creation remains retired. PR #41 stays unmerged.

## How to read the statuses

**Baseline status** describes whether a requirement exists in source:

| Status | Meaning |
|---|---|
| absent | No implementation found on `main` |
| partially implemented | Source covers part of the requirement |
| implemented on an unmerged branch | Present only off `main` |
| merged into main | Present at `ba317f5` |
| superseded | An older document or clock is no longer the source rule |

**Claim status** describes whether a user-facing sentence matches that source:

| Status | Meaning |
|---|---|
| supported | The sentence matches the code at `ba317f5` |
| conditional | The sentence is true only with a stated limit, or only after a deploy or device check that has not been done |
| contradicted | The sentence conflicts with the code or with another text read in this audit |
| unverified | The evidence needed to decide was not available |

A scheduled deletion is not completed erasure. The 15-day schedule applies to new version-2 requests. It is not applied here to legacy requests. This audit does not claim universal TLS 1.3 or universal AES-256 protection.

## Baseline

Dirty checkouts were listed and left untouched. The only dirty trees were `VYD-40-billing-gst` (three GST test files), `eas-android-live` and `release/public-android-combined` (`eas.json`), `grin-combined` (untracked extraction note), `grin-t5-qa` (team-5 docs and tests), and `letterhead-repair` (`scripts/ci/run-all-tests.mjs`). `feature/phone-otp-email-transition` at `cf3758d` was clean and was not merged into this branch.

| Requirement | Where it lives on `main` | Branch / PR / commit | Completed | Remaining | Evidence | Next action |
|---|---|---|---|---|---|---|
| In-app privacy and terms | `src/content/legal/documents.ts`, `src/config/legal.ts` | Merged. Tip `ba317f5` | Version-2 deletion clocks, legacy 45-day window, ciphertext wording, self-declared age, processor list | Live site and `docs/legal/PRIVACY_POLICY.md` do not match this text | `deletionGraceCopy.unit.test.ts` is in the tree. CI 40184077103 passed. Not re-run for this audit | Use the in-app text as the app disclosure. Do not publish the older drafts |
| Version-2 deletion schedule | `src/domain/identityLifecycle.ts`, `functions/src/deletion/deletionPolicy.ts` | Merged into `main` at `ba317f5` as source only | New requests in source: reactivation cutoff at 13 days, erasure deadline at 15 days, with the 2-day allowance between them. `deletionScheduledFor` is the cutoff, not proof the erasure finished. A stored legacy deadline is kept. A missing legacy deadline stays request plus 45 days | The Functions revision and client build serving users are unidentified. No production job was inspected | `functions/src/deletion/deletionPolicy.unit.test.ts` | Do not replace a live deletion promise because this source changed. Identify the deployed revision and the client build first |
| Legacy cancellation window | `DELETION_GRACE_DAYS = 45` in `src/domain/identityLifecycle.ts` | Merged. Supersedes a single 15-day grace and the old 180-day request | Stored legacy deadlines are preserved | Do not reset them to 15 days | `deletionPolicy.unit.test.ts` asserts a stored legacy deadline is not rewritten to 15 days | Say “already pending requests keep their stored deadline” |
| Application content seal | `functions/src/privacy/contentEncryption.ts`, `src/constants/contentSeal.ts` | Merged | AES-256-GCM, 32-byte key, 12-byte nonce, 16-byte tag, server secret `CONTENT_DATA_KEY`. `CONTENT_SEAL_WRITES_ENABLED = true` in source | Live secret, IAM, and deployed functions unverified. Historical plaintext is not migrated. GRIN, projections, caches, object names, and exports are listed as uncovered | `functions/src/privacy/contentEncryption.unit.test.ts`, `src/services/privacy/diarySealDocument.test.ts` | Do not call this end-to-end encryption. Do not claim every stored byte is sealed |
| Age gate | `src/domain/ageEligibility.ts`, `src/auth-v2/screens/AgeDeclarationScreen.tsx` | Merged via the privacy integration (PR #36, then `main`) | Self-declared date of birth, 18 completed years, Asia/Kolkata. Full date is not the retained field | Device admission not accepted. Existing accounts stay unassessed until they pass | `src/domain/ageEligibility.test.ts` | Keep the in-app sentence. Do not describe it as identity verification |
| Optional crash diagnostics | `src/domain/processingPurpose.ts`, `src/services/consent/purposeConsentQueue.ts`, `src/services/telemetry/diagnosticsPreference.ts` | Merged | Required `service_operation` is not a checkbox. `crash_diagnostics` is optional. Missing stored choice stays off. Withdrawal wins over a stale grant | Provider retention and a physical device were not checked | `src/services/consent/purposeConsentQueue.test.ts`, telemetry privacy tests | Disclose diagnostics as optional and off until chosen |
| Legal-consent retry | `consentPatchForProfile` in `src/services/consent/legalConsentService.ts` | On `main`, the AsyncStorage copy is cleared before `updateProfile` returns. The retain-until-success behaviour is **implemented on an unmerged branch**, draft PR #40 | See the PR #40 note below. This audit does not copy that fix | Device checks in that PR are still open. GitHub has no review comment on it | PR #40’s own tests, on that branch only | Review PR #40. Do not re-implement it here |
| Firestore and Storage ownership | `firestore.rules`, `storage.rules` | Merged source | Owner uid checks plus restore-fence checks exist in source | Deployed rules unverified | Rules suites are part of `ci:verify` on run 40184077103. Emulator success is not a production rules release | Do not treat CI as a live rules deploy |
| Account deletion pipeline | `functions/src/deletion/finalPurge.ts`, `lifecycle.ts` | Merged source | Phased purge, Auth last, unknown or too-deep collections become a hold rather than a completed purge | Scheduler deploy, bucket soft-delete, PITR, and Auth backups unverified | Deletion unit tests in tree. No production purge was run | Call a finished job “app-controlled data removed by the job,” not “irrecoverable” |
| GRIN inside deletion | `INCLUDE_GRIN_IN_ACCOUNT_PURGE = false` in `functions/src/deletion/grinCleanupLists.ts`. Version-2 jobs call the purge with `force: true` | Merged source, split behaviour | Legacy jobs skip GRIN while the flag is false. New version-2 jobs do not | Production may still be running an older function. This audit did not read deployed source | `functions/src/deletion/grinCleanup.unit.test.ts` | Do not say “GRIN is never deleted” and do not say “the flag blocks every job” |
| Local cleanup | `src/services/accountDeletion/localDevicePolicy.ts` | Merged | Local rows stay during `pending_deletion`. They are purged for that uid after the live status is `deleted` or the account is missing | A phone that is off or uninstalled is not wiped by Cloud Functions | Local-device policy tests in `src/services/accountDeletion/` | Keep the device-residual sentence |
| Billing, cancellation, refunds | `functions/src/billing/`, `PLAY_BILLING_ENABLED` must be the string `true` | Merged source, default off | Refund revocation is unit-tested behind the flag | Not enabled. No live purchase. Live terms have no subscription section | `functions/src/billing/transition.unit.test.ts` | Do not declare subscriptions or refunds in the store from this source |
| Letterhead creation | `app/(app)/letterhead/create.tsx` uses the legacy-unavailable message | Merged, feature retired | Historical records can still be named in deletion copy | Creation stays retired. No new letterhead flow is authorised | Acceptance sheet on `main` | Do not advertise new letterhead creation |
| Isolated acceptance | `docs/privacy-legal-audit/ACCEPTANCE_APPROVAL_SHEET.md` | Merged in PR #39 at `ba317f5` | Sheet records source CI for `f2ff65c` and separates cloud, device, and provider evidence | Scope A and Scope B unsigned. No isolated project, no APK, no provider request | The sheet itself | Do not start a build or a cloud write from this audit |
| Seven-stage narrative | `docs/privacy-legal-audit/SEVEN_STAGE_ACCEPTANCE_2026-10-23.md` | The underlying corrections were merged through PR #35 into `security/firebase-session-hardening` and PR #36 into `main`. The narrative file is **superseded** as a status page | It still says PR #35 is a draft and names an old branch | The file’s HOLD on public release is still the right release decision. Its PR status is stale | PR #35 and #36 are merged. Current `main` CI is 40184077103 | Do not cite that file as the current PR state |
| Repo HTML legal pages | `public-site/privacy.html`, `public-site/delete-account.html` | Present, stale | Historical | Canonical host `vyaamikkdiary.in` did not resolve on 25 October 2026 | Direct comparison below | Do not publish these files |
| Unpublished website draft | `docs/legal/PRIVACY_POLICY.md` | Present. The file says it is unpublished | Careful transit wording | Still describes only a 45-day window and omits the version-2 schedule and the content seal | File header and retention section | Do not publish it as the website |
| Live website | `https://vyaamikk.specialsoftwares.com/privacy`, `/terms`, `/delete-account` | Not in this repository. Read-only GET on 25 October 2026 | Pages returned HTTP 200 | Differences from `main` are recorded below. A difference is not authority to replace a live promise | Extracts below. Pages can change after this read | Identify the serving build and Functions before any deletion-text edit. Analytics script inclusion is a property of the site that was fetched, separate from `main` |
| Current Play Data safety form | Not in the repository | **Absent as a live declaration** | `PLAY_DATA_SAFETY_PROVISIONAL_ANSWERS.md` is a proposal. Its deletion row still says the wired window is 45 days and warns that the live site may say 15 | Play Console was not opened | The proposal file is stale relative to version 2 | Do not Save or publish a Data safety form from the proposal |

### PR #40, latest state, not duplicated

Draft PR #40, `feature/phone-otp-email-transition`, remains open and unmerged. Head `cf3758d988b64ddaef370c6975fa34d65ecc3b03`. GitHub reported it mergeable. Pull-request CI [40188263559](https://github.com/specialsoftwares/vyaamikk-diary/actions/runs/40188263559) completed success. As of this correction, GitHub shows no review submission, no inline comment, and no issue comment on that PR. There is therefore no GitHub review finding to quote.

What remains open is the PR’s own unchecked device list: the overlay ending after identity resolution, typing email while the bridge and consent write finish, a consent-only update not calling `sealOwnerContent`, and a failed bridge still blocking the consent Firestore write and leaving the pending copy. Those are not accepted by CI.

On `main`, `consentPatchForProfile` still removes the AsyncStorage grant before `updateProfile` returns. PR #40 is the existing fix for that. This audit does not copy it. PR #40 also does not identify the deployed deletion Functions or the local-key device pass.

## What was read

- App disclosures: `src/content/legal/documents.ts`, `src/config/legal.ts`, `src/config/env.ts`, deletion and pending screens, English strings.
- Website source in git: `public-site/privacy.html`, `public-site/delete-account.html`, `docs/legal/PRIVACY_POLICY.md`.
- Live pages, GET only, 25 October 2026: `/privacy` (effective 15 July 2026, last updated 24 October 2026), `/delete-account`, `/terms`. `https://vyaamikkdiary.in/privacy.html` did not resolve.
- Live script inspection was a GET of the script files named by the privacy page. The scripts were not executed. `/~api/analytics` was not requested. No test event was sent. Details are in P19. The context token on the events script tag was not copied.
- Play Console and App Store Connect were not opened. There is no current store-declaration export in this repository.

## Evidence matrix

### P1. Account and profile data

1. Proposed wording: “We collect the mobile number used to sign in, the authentication identifier, the Vyaamikk ID, and the profile fields you save. Name is required. Business name, field of work, designation, email, logo, and language are optional. GSTIN is stored only if you enter it.”
2. `src/content/legal/documents.ts` “Information we collect”; GSTIN input in `src/auth-v2/screens/BusinessIdentityScreen.tsx`. Commit `ba317f5`.
3. Profile and onboarding tests exist in the tree. Not re-run here. CI 40184077103 passed on this commit.
4. Production Firestore contents were not read.
5. A production profile sample was not taken.
6. **Supported** for the in-app list. **Conditional** for GSTIN until a device pass shows the field the user can actually save. The live privacy page lists GSTIN and letterhead uploads in one sentence; new letterhead creation is retired, so that sentence is **contradicted** if read as a current creation feature.

### P2. Business records, location, photos, and PDFs

1. Proposed wording: “Records you choose to create can include diary entries, purchase orders, customer credit, professional packs, and drafts. Foreground location and photos are used only when you invoke those controls. PDFs are generated on the device. Automatic PDF cloud backup is off in this source. Files you already share leave our control.”
2. `src/content/legal/documents.ts`; `PDF_CLOUD_BACKUP_ENABLED = false` in `src/constants/pdfPrivacy.ts`; `src/services/notifications.ts` states reminders are local. Commit `ba317f5`.
3. `src/services/privacy/diarySealDocument.test.ts` asserts the PDF backup flag is false.
4. No device export was captured.
5. Whether a given production build was compiled with the flag false is a build-time check, not done here.
6. **Supported** in source. **Unverified** on a device. The live site’s “remote backup” phrasing in the terms licence is broader than this flag and is **conditional**.

### P3. Essential processing, diagnostics, and marketing

1. Proposed wording: “Running the account, storing records you create, and securing sign-in are required. They are not optional checkboxes. Crash diagnostics stay off until you turn them on. Turning them off stops that processing and does not delete the account. This app does not send marketing notifications and does not use an advertising SDK.”
2. `src/domain/processingPurpose.ts`; `loadDiagnosticsPreference` treats a missing value as off (`stored === true` only); `src/services/notifications.ts`. Commit `ba317f5`.
3. `src/services/consent/purposeConsentQueue.test.ts` and the telemetry privacy tests.
4. Crashlytics retention in the provider project was not read. The website’s analytics script is a separate channel (P21).
5. A device toggle and a Crashlytics export are still required.
6. **Supported** for the app source. Provider retention is **unverified**.

### P4. Legal-consent persistence, withdrawal, retries, and account switching

1. Proposed wording: “The privacy and terms acceptance for the current version is required before the account continues. A crash-diagnostics choice belongs to that account. A withdrawal replaces an older grant. A choice for one account is not applied to another.”
2. On `main`, `consentPatchForProfile` loads the pending legal grant and then calls `clearPendingConsent()` before returning the patch. `continueAfterPhoneProfile` awaits `updateProfile` before `setStep("email")` (`src/auth-v2/AuthFlowGate.tsx`). Commit `ba317f5`. Purpose-consent ownership is `consentAppliesToAccount` in `src/domain/processingPurpose.ts`.
3. Purpose-queue tests cover withdrawal, replay, and account switch. The legal-consent clear-before-write is the current `main` source. The retry-after-failure behaviour is on unmerged PR #40, CI 40188263559.
4. Neither path’s production write was observed.
5. A failed `updateProfile` after the clear, on a device, was not reproduced in this audit.
6. Purpose consent: **supported** in source. Legal-consent retry after a failed cloud write: **contradicted** on `main`, because the local copy is removed first. The correction is **implemented on an unmerged branch** and is not imported here.

### P5. Firestore and Storage ownership

1. Proposed wording: “Cloud records and files for an account are readable and writable by that signed-in account, subject to the restore fence. One account’s rules path is not another account’s path.”
2. `firestore.rules` owner comparisons such as `request.auth.uid == uid` and content-seal uid checks. `storage.rules` uses `request.auth.uid == userId` together with `restoreClaimAllows()`. Commit `ba317f5`.
3. Rules tests run inside `ci:verify` on run 40184077103.
4. The deployed rules release on project `vyaamikk-diary` was not read.
5. A live cross-account denial was not performed.
6. **Conditional.** Source and emulator CI support the sentence. Production enforcement is **unverified**.

### P6. Encryption coverage, algorithm, keys, and recovery

Four different claims. They are not one sentence.

**Server content seal.** Proposed wording, still conditional on the deployed Functions: “Business record text and original attachment bytes written through the current server seal are AES-256-GCM ciphertext. The key is the 32-byte server secret `CONTENT_DATA_KEY`. The signed-in owner can open it through the server after the session checks. This is not end-to-end encryption. Authentication identifiers and operational routing fields stay readable. Historical plaintext is not migrated by the current switch. GRIN evidence, party-ledger projections, local caches, storage object names, and exports are outside this seal.” Implementation: `functions/src/privacy/contentEncryption.ts`, `CONTENT_MIGRATION_UNCOVERED`, `src/constants/contentSeal.ts`. Commit `ba317f5`. Tests: `functions/src/privacy/contentEncryption.unit.test.ts`, `src/services/privacy/diarySealDocument.test.ts`. `CONTENT_DATA_KEY` in the serving project was not listed. No production document was opened. Status: **conditional** for source, **unverified** for the serving project. Billing uses a separate AES-256-GCM envelope and is not this key.

**Account-bound local payloads.** Proposed wording: “Selected text kept on the device for an account is sealed with a separate 32-byte key for that account. The cipher is AES-GCM with a 12-byte nonce, through `@noble/ciphers`, and the stored envelope is version 1. The key is not the server content key. Logout keeps the key and the sealed rows. Account deletion removes that account’s key. If the key is missing while sealed rows remain, the app does not mint a replacement and those rows stay unreadable. Leftover plaintext is sealed when the key is ready and is not deleted merely because the key is missing.” Implementation at `ba317f5`: `src/services/accountDeletion/localDataKey.ts` (`resolveLocalDataKey`, `sealLocalTextSync`), `localKeyStore.native.ts`, `localPayload.ts` (`PAYLOAD_TABLES`, `migrateOwnedPayloads`), `localKeyLifecycle.ts` (`prepareLocalAccountKey`). Repositories that call the codec: `localEntriesRepository.ts`, `syncQueueRepository.ts`, `formDraftsRepository.ts`, `activeRouteRepository.ts`, plus `masterDataRepository.ts`, `businessInsightRepository.ts`, and `recentSearches.ts`. `purgeLocal.ts` calls `clearRecentSearches`, which deletes the secure-store item. `signOut` in `src/state/auth.tsx` calls `retainLocalAccountOnLogout` and does not unbind or delete the key. Tests: `src/services/accountDeletion/localKeyAndPayload.test.ts` states that host SQLite is not a phone. `excludedLocalStores.test.ts` states that it does not open a Play-installed binary. `localKeyStore.native.ts` states that physical-device execution of the adapter is still pending. Status: **supported** as source behaviour. Device acceptance is **unverified**.

**Device key and backup limits.** The production adapter is `expo-secure-store`, item name `vyd.ldk.v1.{uid}`. A new key is not written to AsyncStorage. An older AsyncStorage item `vyd_local_data_key_v1_{uid}` is copied into the secure store and then removed. If the secure copy and the legacy copy differ, resolution stops with `key_conflict` and does not overwrite either. If the secure store throws, the raw key is not written elsewhere. The option passed on iOS is `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`. The adapter comment says that option is not Android backup policy. `plugins/withAndroidReleaseManifestHardening.test.ts` expects `android:allowBackup` to stay `"true"`. This audit did not read a generated backup-rules XML from a current build, so Android backup exclusion of the key is **unverified**. A missing key while ciphertext remains returns `key_missing` and does not create a key (`localDataKey.ts`). An interrupted migration leaves the plaintext row in place (`localKeyAndPayload.test.ts`).

**Whole-database encryption.** Not this design. `src/localDb/schema.ts` opens `vyaamikk_diary.db` with `PRAGMA journal_mode = WAL` and does not use SQLCipher. Sealing selected columns is not encryption of the database file. A claim that “SQLite is encrypted” or that “all local data is unencrypted because it is outside the server seal” is **contradicted**.

**Remaining plaintext and excluded stores, in this source.** Sealed when a key is bound: `entries_local.payload_json` and `origin_payload_json`; `sync_queue.payload_json`; `form_drafts.payload_json` and `title`; `active_route.params_json`; master-data `value` and `display_value`; insight `display_label` and `metadata_json`. Master-data `normalized_value` and insight `normalized_key` are HMAC-SHA-256 lookup tokens (`lookupToken`), not reversible ciphertext. Still readable as ordinary columns: entry ids, user ids, sync status, timestamps, versions, sync-queue operation and entity ids, `last_error`, draft kind and scope, route `href`, suggestion field keys and counts. Not in `PAYLOAD_TABLES`: `pincode_cache`, `statutory_occurrences`, `meta`, and the GRIN local tables. GRIN rows are removed for that owner on account deletion (`deleteGrinLocalOwnerRows`) and are not sealed by `migrateOwnedPayloads`. Party-name and PIN text that has not yet been migrated stays plaintext; a missing key does not delete it.

Status for a public encryption sentence: **conditional**. Server seal and local account seal are both in source and are different mechanisms. Whole-database encryption is absent. Serving-project secrets and a physical device remain **unverified**. Do not say the phone’s database is unencrypted only because it is outside the server seal.

### P7. Transport security

1. Proposed wording: “Connections to the configured cloud services use the platform’s ordinary transport security. This app does not set a TLS 1.3-only policy, and this audit did not measure the version negotiated by a device.”
2. No TLS-minimum switch was found in the app source. `docs/privacy-legal-audit/SEVEN_STAGE_FILE_IMPACT.md` already records that absence. Commit `ba317f5` contains that note; it is not a measurement.
3. No network-capture test was run.
4. None in this repository can force the negotiated version for Firebase.
5. A device packet capture.
6. **Unverified** as a version claim. An unqualified “TLS 1.3” or “AES-256 in transit” sentence would be **contradicted** by the absence of evidence. The live page’s “standard transport security” sentence is **conditional** and does not name a version.

### P8. Deletion timing: legacy and version 2

1. Proposed wording, for a build and Functions revision that have been identified as this source, and not before: “For a new request, the last moment to reactivate is the cutoff stored on the account. In this source that cutoff is 13 days after the server accepts the request, and the scheduled erasure deadline is 15 days after that acceptance. The two days after the cutoff are processing allowance. Becoming eligible to run, and finishing erasure, are different events. A request that already has a stored deadline keeps that deadline. A legacy request with no stored deadline stays at 45 days from the request and is not moved to 15.”
2. `newDeletionSchedule` and `legacyErasureDeadline` in `src/domain/identityLifecycle.ts`. The same split is in `functions/src/deletion/deletionPolicy.ts`. For a new request, `deletionScheduledFor` and `graceExpiresAt` are the reactivation cutoff. `erasureDeadline` is 15 days. `functions/src/deletion/lifecycle.ts` promotes a job when `graceExpiresAt` is reached. That is scheduling, not a completed purge. The settings confirm string uses `DELETION_V2_ERASURE_DAYS` (15). The pending screen uses `DELETION_V2_REACTIVATION_DAYS` (13) inside a “{{days}}-day period” and then says data is erased after that cutoff. Commit `ba317f5`.
3. `functions/src/deletion/deletionPolicy.unit.test.ts` checks both deadlines and that a stored legacy deadline is not rewritten to 15 days. `src/content/legal/deletionGraceCopy.unit.test.ts` checks the in-app policy interpolates `DELETION_GRACE_DAYS`.
4. The deletion Functions and the client build serving users were not identified. CI on `ba317f5` does not deploy them.
5. A production job document, the deployed source, and a device on the serving build.
6. **Conditional.** The clocks are source behaviour only. They are not a finding that the live 15-day promise is currently false. Do not replace that promise because `main` changed. Calling either date “completed erasure” is **contradicted** by the scheduler. The pending screen’s “erased after that cutoff” is a source-copy ambiguity against the 15-day deadline in the same tree. It is not, by itself, the live behaviour. `docs/legal/PRIVACY_POLICY.md` and `public-site/privacy.html` are unpublished repo texts and are not the serving policy.

### P9. Local cleanup

1. Proposed wording: “Cloud deletion does not wipe a phone that is off or uninstalled. While deletion is pending, the app keeps that account’s local data so the account can be restored. After the app sees that the account is deleted, it removes that account’s local data. Clearing app storage or uninstalling removes it sooner.”
2. `decideLocalDataAction` in `src/services/accountDeletion/localDevicePolicyDecision.ts`. The comment in `localDevicePolicy.ts` still says “45-day”; the decision itself uses account status, not a hardcoded 45. Commit `ba317f5`.
3. Local deletion policy tests under `src/services/accountDeletion/`.
4. Requires a build that contains this client.
5. Not observed on a device.
6. **Supported** in source. Device result **unverified**. The live delete page’s device paragraph is **conditional** and is the closest public match.

### P10. Orphan handling

1. Proposed wording: “If deletion meets a collection it does not recognise, or the data is nested deeper than the walk allows, the job stops for review. That hold is not a completed erasure.”
2. `finalPurge.ts` throws `firestore_depth_exceeded` and `firestore_unknown_collection` instead of marking the phase done. Commit `ba317f5`.
3. Deletion tests in the tree cover the hold. This audit did not re-run them.
4. Production jobs were not inspected.
5. An operator record of a real `needs_manual_review` outcome.
6. **Conditional.** Source supports the sentence. No live job was shown.

### P11. GRIN exceptions

1. Proposed wording: “Goods-receipt records are not part of the default legacy deletion path. A new version-2 deletion job in this source does include that purge even though the global flag stays off. That behaviour is not in effect until the function revision that contains it is deployed. Letterhead creation is retired and is not a current collection path.”
2. `INCLUDE_GRIN_IN_ACCOUNT_PURGE = false`. `finalPurge.ts` calls `purgeGrinEvidenceIfEnabled` with `force: true` only when `deletionPolicyVersion >= 2` and the flag is false. Commit `ba317f5`.
3. `functions/src/deletion/grinCleanup.unit.test.ts`.
4. Deployed source unverified. `GRIN_GOODS_EVIDENCE_FUNCTIONS` is not set true by this audit.
5. No production GRIN prefix was listed.
6. **Conditional.** A public sentence that GRIN is always kept, or always deleted, is **contradicted**.

### P12. Backups and provider copies

1. Proposed wording that this audit can support: “These periods do not make every provider backup, legally required billing record, or file you already exported disappear. This page does not state a fixed backup lifetime. Source contains checks that can deny a restored account when a closed fence, a configured outside authority, or an erasure manifest says so. Those checks are not a production guarantee until restore activation is shown on the serving project. Denying a restored session is not the same as completed erasure, and it is not evidence that a backup never existed.”
2. In-app `documents.ts` currently says a restored backup “is suppressed” after the erasure job completes, and that Firebase Authentication backups can remain for up to about 180 days. Commit `ba317f5`. The 180-day figure was not measured here. Source safeguards, separated from activation: `decideRestoreAdmission` returns `skip` when the outside authority is not configured and required mode is off, `deny` when the local fence is closed, and `unavailable` when required mode has no usable authority (`functions/src/deletion/restoreAuthority.ts`). `restoreTrafficDecisionForUid` denies on a closed fence, on a failed fence read, and, when no outside authority is configured, on an existing `erasureManifests/{uid}` document. A failed manifest read also denies. If the fence is open, the authority is unset, and no manifest is present, traffic is allowed. `RESTORE_PROTECTION_ACTIVE === "true"` adds a worker-hold check. The acceptance sheet leaves that variable unset and the authority database unprovisioned. `restoreServiceCanReopen` does not open a restored primary by itself.
3. Emulator and unit tests exercise those decisions with injected state. They do not restore a production backup.
4. Prerequisites not shown: deployed Functions at this revision, `RESTORE_AUTHORITY_DATABASE_ID` set to a real second database, a seeded authority snapshot, a reconciled fence, and a completed erasure manifest for a real uid. None of those were read.
5. Demonstrated recovery behaviour: none. No backup was restored. No serving-project fence or manifest was read.
6. **Conditional** for the source safeguards. **Unverified** as production suppression. The in-app sentence that suppression already happens is ahead of the evidence. The live delete page’s refusal to name a fixed backup lifetime is a wording limit, not proof the backups are gone.

### P13. Age eligibility

1. Proposed wording: “The app is for people who are 18 or older. The check is a date of birth you declare. It is compared as completed years in Asia/Kolkata. The full date is not kept after the server records the result, the policy version, and the time. This is not an identity-document check and it is not Aadhaar. An account that has not passed the check remains unassessed.”
2. `src/domain/ageEligibility.ts`. In-app privacy section “Eligibility” matches this. Commit `ba317f5`.
3. `src/domain/ageEligibility.test.ts`.
4. The age callable’s deployed revision was not listed.
5. Device accessibility and an existing-account pass remain open on the acceptance sheet.
6. **Conditional.** Source and in-app text support it. The live privacy and terms pages say “18 or over” and “not directed to children” without the self-declaration limit. They are not false, and they are **conditional** because a reader can think an identity check already happened.

### P14. Grievance handling

1. Proposed wording, without collapsing roles or backdating: “Support requests go to the support mailbox. Privacy grievances go to the grievance mailbox when that role is a different, monitored address. Each document shows its own effective date and, where it has one, its own revision date. Those dates do not have to match.”
2. App source at `ba317f5`: `LEGAL_GRIEVANCE_OFFICER.email` is `grievance@specialsoftwares.in`, with a named officer and the Dwarka address in `src/config/legal.ts`. `LEGAL_EFFECTIVE_DATE` is `2026-07-27`. The support default in `src/config/env.ts` is `support.vyd@specialsoftwares.com`. Live privacy and terms, read 25 October 2026, show “Effective: 15 July 2026” and “Last updated: 24 October 2026”, and give `support.vyd@specialsoftwares.com` as the grievance channel. The extracted live text does not show the officer name or the postal address. `public-site/privacy.html` is a different, unpublished file: placeholders, `support@specialsoftwares.in`, effective `2026-07-01`, and a `.in` canonical host that did not resolve. It is not evidence that the live support address is wrong.
3. `findLegalConfigBlockers` checks placeholder shape. It does not prove a mailbox is monitored.
4. No message was sent to either address. Ownership of the LLP name appears on the live pages and in source. Monitoring was not verified.
5. For each mailbox: who reads it, and whether that role is the one the page names. For each date: whether it is the original effective date, a revision date, or an intended publication date. Document version `1.0.0` in `legal.ts` was not matched to a live revision id.
6. **Unverified**, not contradicted, for the existence of two mailboxes and two dates. A support address and a grievance address may both be legitimate. Using the support address as the only live grievance channel, without showing the officer line that source already has, is **conditional** until the owner says which role is published. The placeholder repo HTML is a stale file, not a reason to backdate the live page to 1 July 2026 or the app date to 15 July 2026.

### P15. Incident response

1. No replacement sentence is proposed. Removing the live notification sentence would not create a procedure. The gap is operational.
2. The live privacy page says: “If a security incident affects your personal data, we will notify you and the relevant authorities where applicable law requires it.” `docs/privacy-legal-audit/CONTROLLED_ACTIVATION.md` tells an operator how to stop after an accidental production write. That is not a user-notification runbook, a timetable, or a tested drill. Commit `ba317f5`.
3. No incident drill is in CI.
4. No on-call rotation or mailbox test was run.
5. A written procedure, an owner, and an authoritative check of which legal deadlines apply. This audit does not supply those deadlines.
6. **Unverified** as a promise the operator can currently perform. The missing procedure remains a gap whether or not the sentence stays. Legal applicability is **unverified** until an authoritative source is checked. It is not resolved by editing the sentence.

### P16. Subscriptions, cancellation, and refunds

1. Proposed wording: “This build does not sell a subscription. Store billing stays off unless `PLAY_BILLING_ENABLED` is exactly `true`. A refund path exists in source for a later, separate activation. No refund timing is offered to users from the current terms.”
2. `functions/src/billing/google/playConstants.ts`. Refund cases in `functions/src/billing/transition.unit.test.ts`. Live terms have no subscription or refund section. Commit `ba317f5`.
3. The billing unit tests are in the tree and in CI. They use synthetic events.
4. The flag was not enabled. No Play product was queried.
5. A Play Console subscription catalog, if one exists, was not exported.
6. **Conditional** in source. A store declaration that subscriptions or refunds are live would be **unverified** and, on this default, **contradicted**.

### P17. App disclosures, website, and store declarations

1. Proposed wording is not ready for publication. In-app text at `ba317f5` is the disclosure in source, not proof of the binary users have. The live site is a separate text. Support and grievance addresses, and effective and revision dates, stay distinct until their roles are verified. The Play form is unknown.
2. Compared in this audit: `documents.ts`, `docs/legal/PRIVACY_POLICY.md`, `public-site/*.html`, and the three live URLs. Store form: not available.
3. `deletionGraceCopy.unit.test.ts` locks the in-app deletion sentences to the constants. It does not lock the website.
4. Website publication is a separate approval. This PR does not publish it.
5. A Play Console Data safety export and an App Store privacy label. Also a fresh GET of the live pages at publication time, because they can change.
6. Store declarations are **unverified**. Consistency of deletion promises is **conditional** on the serving build. The analytics sentence is assessed in P19 from the page that was fetched, not from `main`.

### P18. Web deletion path

1. Proposed wording: “If you cannot use the app, email support.vyd@specialsoftwares.com from a mailbox you can verify. Include the registered mobile number. Do not send an OTP, PIN, or record contents. Email alone does not delete the account and does not reactivate it. We may ask you to complete a verification step. The in-app path is Settings → Account & App → Delete Account & Data. About also has a Delete Account link.”
2. Live delete page, 25 October 2026, says Settings → Delete Account & Data and Settings → About → Delete account, and says those labels match “the current app build being submitted.” Source: `app/(app)/(tabs)/settings.tsx` uses `settings.deleteAccountAndData` under the account section, and `app/(app)/settings/about.tsx` links with `legal.linkDeleteAccount` (“Delete Account”). Reactivation in production uses the email-code screen when identity callables are on (`account-pending-deletion.tsx`). Commit `ba317f5`.
3. No web-request test. The page is a manual email path.
4. No deletion email was sent.
5. A monitored mailbox and a written manual procedure.
6. The two navigation labels exist in this source, so that part is **supported** for `ba317f5` and **unverified** for the binary users have. “Being submitted” conflicts with HOLD. The live “15-day” cancellation method is not replaced from this source until the serving client is identified. Email reactivation in this source, when identity callables and the production backend are on, is **conditional** on that build. The email path does not itself erase data.

### P19. Website analytics sentence

1. No publication sentence is proposed. Naming a recipient would not decide consent or whether the visitor can stop collection.
2. Exact live claim, read 25 October 2026 from `https://vyaamikk.specialsoftwares.com/privacy`: “This marketing website itself does not load third-party analytics, advertising, session-replay or marketing pixels.” The same HTML includes `<script defer src="/~flock.js" data-proxy-url="/~api/analytics">` and a deferred `/__l5e/events.*.js` script. Those tags establish script inclusion only.
3. None in app CI.
4. The script files were fetched with GET and were not executed. `/~api/analytics` was not requested. No test event was sent. The site was not changed.
5. Separated unknowns:
   - **Inclusion.** Established for those two script URLs on the privacy page that was fetched.
   - **Configured destination in the tag.** `data-proxy-url` is `/~api/analytics`. The flock.js text selects that attribute before any direct host. This audit did not see a request arrive there.
   - **Direct fallback inside flock.js.** If no proxy attribute is set, the file contains `https://api.tinybird.co/v0/events?name=${datasource}&token=${token}`. The live tag does not set `data-token`. The fallback shows what the file can call. It does not show that this page called Tinybird.
   - **Payload and timing, as written in flock.js, not as captured.** The file schedules `page_hit` about 300ms after load, and on history changes, with user-agent, locale, a country derived from the timezone, referrer, pathname, and href. It also has web-vital hooks. The POST body in the file is JSON with `timestamp`, `action`, `version`, `session_id`, and `payload`. Default session storage in the file is a cookie. No consent check was found in the flock.js text that was read. None of that was observed as a network request.
   - **Session replay.** The events script contains rrweb replay code and a sample-rate attribute. The privacy-page tag does not set `data-replay-sample-rate` or `data-replay-crash-sample-rate`. The file treats a missing rate as 0, and the sampled path requires a rate above 0. Replay collection on that page is therefore **unverified**, not established by the word “rrweb” in the file. The events script also names `/__l5e/trackevents` as a default track path. No request to it was observed.
   - **Upstream of the proxy, consent, and a visitor control.** Not identified. A vendor name, including the Tinybird fallback, does not answer them.
6. The claim “does not load third-party analytics” is **conditional**. Script inclusion is established. “Third-party”, the recipient, the payload actually sent, and the moment collection happens are **unverified**. Do not treat the Tinybird URL as a completed finding.

### P20. Push and over-the-air updates

1. Proposed wording: “Reminders are scheduled on the device. This source does not send remote push notifications. It does not include Expo over-the-air updates.”
2. `src/services/notifications.ts` says push is not used. `package.json` has `expo-notifications` and does not depend on `expo-updates`. `app.json` has no updates block. Commit `ba317f5`.
3. Notification unit coverage exists for local reminders. No push token test was treated as evidence of remote push.
4. EAS may still build binaries. That is separate from runtime OTA.
5. A store listing that promises push or instant updates.
6. Local reminders: **supported** in this source. The live processor sentence that names “platform-level push notifications” and “over-the-air update delivery” does not match this source. It is **conditional** until the serving build is identified. Do not edit the live sentence only because `main` lacks those features.

## What this correction changes in the audit

The first draft treated `main` as the behaviour serving users, described SQLite as outside encryption, treated script tags as proof of a recipient, presented restore suppression as a production fact, and asked for one mailbox and one date. Those conclusions are withdrawn. The matrix above is the replacement. It is not ready to publish as policy.

## Bounded next work

Nothing in this list is authorised by this PR. Pending-deletion wording is one source-copy defect. It is not the remaining work.

### Documentation corrections

- Keep this file as the audit record. Do not publish it as the privacy policy.
- When a later note cites deletion, quote both the reactivation cutoff and the erasure deadline, say that a legacy stored deadline is preserved, and say that scheduling is not completion.
- Mark `docs/legal/PRIVACY_POLICY.md` and `public-site/*.html` as unpublished repo copies when they are next edited. Do not backdate them to the live dates, and do not upload them.
- Add a header to `SEVEN_STAGE_ACCEPTANCE_2026-10-23.md` pointing at `ba317f5` and the acceptance sheet, without calling cloud or device acceptance done. PR #35 and PR #36 are merged. That file still says PR #35 is a draft.
- Leave the Play proposal unmarked as a live form. `PLAY_DATA_SAFETY_PROVISIONAL_ANSWERS.md` still describes a single 45-day window.

### Product-code defects

- On `main`, `consentPatchForProfile` clears the local legal-consent copy before `updateProfile` returns. The fix is draft PR #40 at `cf3758d`. Review that PR. Do not write the fix again here. Its device checks are still open, and GitHub has no review comment on it.
- In this source, the confirm dialog uses the 15-day erasure constant and the pending screen uses the 13-day reactivation constant inside a phrase that can be read as erasure at the cutoff. That is a source inconsistency. Change it only after the serving client is identified, and keep stored legacy deadlines intact. Do not treat that string as the only code change.
- No local-encryption defect is opened here. The account-bound seal is present. Whole-database encryption is a different claim and is absent. Android backup exclusion of the device key is unverified, not yet a confirmed defect.
- Do not change deletion constants, the GRIN flag, billing flags, letterhead creation, or restore admission in order to make a page easier to write.

### Website changes

- Do not replace the live 13/15 or 15-day deletion sentences because `main` changed. Do not edit push or over-the-air wording for the same reason.
- The analytics sentence can be discussed from the fetched page, because the scripts are on that page. Do not name Tinybird as the recipient of the live tag, and do not remove or rewrite the sentence, until an authorised read identifies the proxy upstream, the payload actually sent, when it is sent, and what consent or control exists. Naming a recipient does not close those questions. Do not send a test event.
- Do not merge `support.vyd@specialsoftwares.com` and `grievance@specialsoftwares.in` into one address. Do not change `LEGAL_EFFECTIVE_DATE` to 15 July 2026 or the live effective date to 27 July 2026 to force a match.
- “Build being submitted” on the live delete page conflicts with HOLD. Removing it is a website edit for a later publishing approval, not a product change.

### Live evidence

- The deployed deletion Function revision and the client build users are running, including whether that client contains the version-2 clocks and the local-key adapter.
- A physical device for `localKeyStore.native.ts`. Host tests are not that pass.
- Restore activation on the serving project: authority database, fence, worker hold, and an erasure manifest. Until that is shown, do not say a restored backup is suppressed in production.
- Whether each mailbox is monitored, who owns it, and which document version each date belongs to.
- An authorised read of the analytics proxy configuration and of a real request that this audit did not generate. Play Console and App Store privacy answers. A written incident procedure, plus an authoritative check of any legal deadline. Provider backup settings, without treating a documented provider maximum as a measurement from this project.

## Acceptance still open

Isolated cloud acceptance, a physical device, and provider evidence remain pending on the acceptance sheet. This document does not sign Scope A or Scope B. It does not authorise a build, an install, a cloud write, a deployment, a merge, a provider message, or a store submission.
