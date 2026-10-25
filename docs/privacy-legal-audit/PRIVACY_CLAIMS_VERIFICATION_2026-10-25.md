# Privacy claims verification — 25 October 2026

Audit documentation only. No product code, flag, deployment, store form, or live page was changed.

**Audited tree:** `main` at `ba317f5b17b73164f5c9768d783cf52128339511` (merge of PR #39).  
**Branch:** `feature/privacy-claims-verification`, cut from that commit.  
**Canonical CI on that commit:** push run [40184077103](https://github.com/specialsoftwares/vyaamikk-diary/actions/runs/40184077103), completed success. That run does not prove a Functions deploy, a device install, or Play Console contents.

Public submission remains HOLD. Letterhead creation remains retired.

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
| Version-2 deletion schedule | `src/domain/identityLifecycle.ts`, `functions/src/deletion/deletionPolicy.ts` | Merged at `ba317f5` | New requests: 13-day reactivation, 2-day processing allowance, 15-day erasure deadline. Missing legacy deadline stays request plus 45 days | Deployed function revision unverified. No production job was inspected | `functions/src/deletion/deletionPolicy.unit.test.ts` | Keep the clocks. Correct public pages that still describe one 15-day or one 45-day window |
| Legacy cancellation window | `DELETION_GRACE_DAYS = 45` in `src/domain/identityLifecycle.ts` | Merged. Supersedes a single 15-day grace and the old 180-day request | Stored legacy deadlines are preserved | Do not reset them to 15 days | `deletionPolicy.unit.test.ts` asserts a stored legacy deadline is not rewritten to 15 days | Say “already pending requests keep their stored deadline” |
| Application content seal | `functions/src/privacy/contentEncryption.ts`, `src/constants/contentSeal.ts` | Merged | AES-256-GCM, 32-byte key, 12-byte nonce, 16-byte tag, server secret `CONTENT_DATA_KEY`. `CONTENT_SEAL_WRITES_ENABLED = true` in source | Live secret, IAM, and deployed functions unverified. Historical plaintext is not migrated. GRIN, projections, caches, object names, and exports are listed as uncovered | `functions/src/privacy/contentEncryption.unit.test.ts`, `src/services/privacy/diarySealDocument.test.ts` | Do not call this end-to-end encryption. Do not claim every stored byte is sealed |
| Age gate | `src/domain/ageEligibility.ts`, `src/auth-v2/screens/AgeDeclarationScreen.tsx` | Merged via the privacy integration (PR #36, then `main`) | Self-declared date of birth, 18 completed years, Asia/Kolkata. Full date is not the retained field | Device admission not accepted. Existing accounts stay unassessed until they pass | `src/domain/ageEligibility.test.ts` | Keep the in-app sentence. Do not describe it as identity verification |
| Optional crash diagnostics | `src/domain/processingPurpose.ts`, `src/services/consent/purposeConsentQueue.ts`, `src/services/telemetry/diagnosticsPreference.ts` | Merged | Required `service_operation` is not a checkbox. `crash_diagnostics` is optional. Missing stored choice stays off. Withdrawal wins over a stale grant | Provider retention and a physical device were not checked | `src/services/consent/purposeConsentQueue.test.ts`, telemetry privacy tests | Disclose diagnostics as optional and off until chosen |
| Legal-consent retry | `consentPatchForProfile` in `src/services/consent/legalConsentService.ts` | **Main clears the AsyncStorage copy before `updateProfile` returns.** Retention after a failed write is **implemented on unmerged** `feature/phone-otp-email-transition` (`cf3758d`, draft PR #40, CI [40188263559](https://github.com/specialsoftwares/vyaamikk-diary/actions/runs/40188263559) success) | PR #40 also shows email before the bridge and the consent write finish | Not absorbed here. Cloud and device behaviour of that branch are not accepted | PR #40 tests are on that branch only | Review PR #40 on its own. Do not copy it into this audit |
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
| Live website | `https://vyaamikk.specialsoftwares.com/privacy`, `/terms`, `/delete-account` | Not in this repository. Read-only GET on 25 October 2026 | Pages returned HTTP 200 | They disagree with `main` on the deletion clock, reactivation, grievance contact, analytics, and push | Extracts below. Pages can change after this read | Correct the live pages only under a separate publishing approval |
| Current Play Data safety form | Not in the repository | **Absent as a live declaration** | `PLAY_DATA_SAFETY_PROVISIONAL_ANSWERS.md` is a proposal. Its deletion row still says the wired window is 45 days and warns that the live site may say 15 | Play Console was not opened | The proposal file is stale relative to version 2 | Do not Save or publish a Data safety form from the proposal |

`feature/phone-otp-email-transition` is overlapping work, not a dependency of this document. It must stay on PR #40.

## What was read

- App disclosures: `src/content/legal/documents.ts`, `src/config/legal.ts`, `src/config/env.ts`, deletion and pending screens, English strings.
- Website source in git: `public-site/privacy.html`, `public-site/delete-account.html`, `docs/legal/PRIVACY_POLICY.md`.
- Live pages, GET only, 25 October 2026: `/privacy` (effective 15 July 2026, last updated 24 October 2026), `/delete-account`, `/terms`. `https://vyaamikkdiary.in/privacy.html` did not resolve.
- The live privacy HTML also loads `script defer src="/~flock.js"` with `data-proxy-url="/~api/analytics"` and a `/__l5e/events.*.js` script. This audit did not execute those scripts or identify the processor behind the proxy. An older repo note names Tinybird. That name was not re-checked in the script body.
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

1. Proposed wording: “Business record text and original attachment bytes written by the current production app are stored as ciphertext using AES-256-GCM. The key is a 32-byte server secret, `CONTENT_DATA_KEY`, not a key on the phone. The signed-in owner can open that ciphertext through the server after the session checks. Authentication identifiers and operational routing fields stay readable. This is not end-to-end encryption. SQLite on the device is not encrypted by this feature. If the server key is lost, sealed fields cannot be opened. Older plaintext is not migrated by the current switch. GRIN evidence, party-ledger projections, local caches, storage object names, and exports are outside this seal.”
2. `functions/src/privacy/contentEncryption.ts` (`CONTENT_SEAL_ALG`, 32-byte key check, `randomBytes(12)`, GCM tag). `CONTENT_MIGRATION_UNCOVERED`. `src/constants/contentSeal.ts`. `src/content/legal/documents.ts` already avoids an end-to-end claim. Commit `ba317f5`. Billing uses a separate AES-256-GCM envelope and is not this content key.
3. `functions/src/privacy/contentEncryption.unit.test.ts`, `src/services/privacy/diarySealDocument.test.ts`.
4. `CONTENT_DATA_KEY` binding in a live project was not listed. `CONTENT_DATA_KEYS` is not the active rotation set. Version-2 seal writes stay off until authorised (`sealContentV2` exists; migration planning is count-only).
5. No production document was opened to see ciphertext. No key-loss drill was run.
6. **Conditional.** The algorithm and key size are supported in source. “Current production app” and “the key exists in the deployed project” are **unverified**. A claim of universal AES-256, including SQLite, Auth identifiers, GRIN, and historical plaintext, is **contradicted**.

### P7. Transport security

1. Proposed wording: “Connections to the configured cloud services use the platform’s ordinary transport security. This app does not set a TLS 1.3-only policy, and this audit did not measure the version negotiated by a device.”
2. No TLS-minimum switch was found in the app source. `docs/privacy-legal-audit/SEVEN_STAGE_FILE_IMPACT.md` already records that absence. Commit `ba317f5` contains that note; it is not a measurement.
3. No network-capture test was run.
4. None in this repository can force the negotiated version for Firebase.
5. A device packet capture.
6. **Unverified** as a version claim. An unqualified “TLS 1.3” or “AES-256 in transit” sentence would be **contradicted** by the absence of evidence. The live page’s “standard transport security” sentence is **conditional** and does not name a version.

### P8. Deletion timing: legacy and version 2

1. Proposed wording: “A new deletion request can be reversed for 13 days. The next 2 days are reserved for processing and retries. Eligible app-controlled data is scheduled to be removed within 15 days of the server-accepted request. Scheduling that work is not the same as completed erasure. A request that is already pending keeps the deadline stored on the account. If an older request has no stored deadline, that deadline remains 45 days from the request. It is not shortened to 15 days.”
2. `newDeletionSchedule` and `legacyErasureDeadline` in `src/domain/identityLifecycle.ts`. The same split is in `functions/src/deletion/deletionPolicy.ts`. The purge becomes eligible when `graceExpiresAt` is reached, and for a new request that value is the reactivation cutoff, not the erasure deadline (`functions/src/deletion/lifecycle.ts`). The settings confirm string uses `DELETION_V2_ERASURE_DAYS` (15) and says cancellation ends two days before that period. The pending screen uses `DELETION_V2_REACTIVATION_DAYS` (13) inside a “{{days}}-day period” and then says data is erased after that cutoff (`app/(auth)/account-pending-deletion.tsx`, `src/i18n/locales/en.ts`). Commit `ba317f5`.
3. `functions/src/deletion/deletionPolicy.unit.test.ts` checks the 15-day deadline, the 2-day gap, and that a stored legacy deadline is not rewritten. `src/content/legal/deletionGraceCopy.unit.test.ts` checks that the in-app policy interpolates `DELETION_GRACE_DAYS` and does not say “starts a 15-day”.
4. The deletion scheduler on the production project was not listed. A green CI run does not deploy it.
5. No production job document was read. No device completed a deletion.
6. The proposed wording is **supported** by source as a schedule, and **conditional** until the deployed function matches this commit. Calling the schedule “completed erasure” is **contradicted**. The live delete page’s single “15-day pending window” during which the user can cancel by a fresh mobile OTP, applied to every request, is **contradicted**. It covers neither the 13/2 split nor a stored 45-day legacy deadline. `docs/legal/PRIVACY_POLICY.md` says only “a 45-day cancellation window” and is **contradicted** for new requests. `public-site/privacy.html` says “a 15-day grace period” and is **contradicted** for legacy requests.

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

1. Proposed wording: “These periods do not make every provider backup, legally required billing record, or file you already exported disappear. This page does not state a fixed backup lifetime. A restored backup is suppressed after an erasure job completes; that is not a promise that a backup never existed.”
2. In-app `documents.ts` currently adds a more specific sentence: Firebase Authentication backups “can remain for up to about 180 days,” and Crashlytics follows the provider’s retention. The seven-stage file calls the 180-day figure provider documentation, not a measurement from this project. Commit `ba317f5`.
3. No test observes a provider backup.
4. Bucket soft-delete, PITR, and Auth export settings were not read. The acceptance sheet leaves provider evidence pending.
5. Provider console evidence and a citation pinned to the provider’s current documentation.
6. The cautious proposed wording is **supported** as a limit. The in-app “about 180 days” figure is **unverified** in this audit and must not be described as something this project measured. The live delete page says it does not claim a fixed backup lifecycle. That sentence is **supported** as wording. It is not evidence that the backups are gone.

### P13. Age eligibility

1. Proposed wording: “The app is for people who are 18 or older. The check is a date of birth you declare. It is compared as completed years in Asia/Kolkata. The full date is not kept after the server records the result, the policy version, and the time. This is not an identity-document check and it is not Aadhaar. An account that has not passed the check remains unassessed.”
2. `src/domain/ageEligibility.ts`. In-app privacy section “Eligibility” matches this. Commit `ba317f5`.
3. `src/domain/ageEligibility.test.ts`.
4. The age callable’s deployed revision was not listed.
5. Device accessibility and an existing-account pass remain open on the acceptance sheet.
6. **Conditional.** Source and in-app text support it. The live privacy and terms pages say “18 or over” and “not directed to children” without the self-declaration limit. They are not false, and they are **conditional** because a reader can think an identity check already happened.

### P14. Grievance handling

1. Proposed wording, once the owner picks the mailbox: “Privacy grievances go to [one published mailbox]. The officer’s name and the registered address are shown with it.”
2. App source: `LEGAL_GRIEVANCE_OFFICER` is “Shivam Saurav, Designated Partner”, `grievance@specialsoftwares.in`, address “841, Plot 35, Sector 6, Dwarka, New Delhi, Delhi - 110075, India”. Support default is `support.vyd@specialsoftwares.com`. Effective date in source is `2026-07-27` (`src/config/legal.ts`). Live privacy and terms, read 25 October 2026: effective 15 July 2026, last updated 24 October 2026, grievance contact `support.vyd@specialsoftwares.com`, no officer name and no postal address in the extracted text. `public-site/privacy.html` still has `TODO_GRIEVANCE_OFFICER_NAME`, `TODO_REGISTERED_ADDRESS`, `support@specialsoftwares.in`, and effective `2026-07-01`.
3. `findLegalConfigBlockers` checks placeholder shape. It does not prove the mailbox is monitored.
4. None of these addresses were sent a message.
5. Owner confirmation of the mailbox that is actually read, and of the address that may be published.
6. **Contradicted** across the four texts. No single public grievance channel is supported.

### P15. Incident response

1. Proposed wording that the source can support today: “If we learn of a security incident that affects your personal data, we will assess it and communicate as applicable law requires. This page does not state a fixed number of hours, because this repository does not contain a tested notification procedure.”
2. The live privacy page says notification of the user and the relevant authorities will happen where applicable law requires it. `docs/privacy-legal-audit/CONTROLLED_ACTIVATION.md` has an internal instruction for an accidental production write. That is not a user-notification runbook. Commit `ba317f5`.
3. No incident drill is in CI.
4. No on-call or mailbox test was run.
5. A written procedure and a named owner, outside this audit.
6. The live promise is **unverified**. This audit does not invent a statutory hour count.

### P16. Subscriptions, cancellation, and refunds

1. Proposed wording: “This build does not sell a subscription. Store billing stays off unless `PLAY_BILLING_ENABLED` is exactly `true`. A refund path exists in source for a later, separate activation. No refund timing is offered to users from the current terms.”
2. `functions/src/billing/google/playConstants.ts`. Refund cases in `functions/src/billing/transition.unit.test.ts`. Live terms have no subscription or refund section. Commit `ba317f5`.
3. The billing unit tests are in the tree and in CI. They use synthetic events.
4. The flag was not enabled. No Play product was queried.
5. A Play Console subscription catalog, if one exists, was not exported.
6. **Conditional** in source. A store declaration that subscriptions or refunds are live would be **unverified** and, on this default, **contradicted**.

### P17. App disclosures, website, and store declarations

1. Proposed wording: publish one deletion section, one grievance contact, one effective date, and one analytics description. Until that publication is approved, the in-app policy at `ba317f5` is the disclosure shipped in source. The live site is a different text. The Play form is unknown.
2. Compared in this audit: `documents.ts`, `docs/legal/PRIVACY_POLICY.md`, `public-site/*.html`, and the three live URLs. Store form: not available.
3. `deletionGraceCopy.unit.test.ts` locks the in-app deletion sentences to the constants. It does not lock the website.
4. Website publication is a separate approval. This PR does not publish it.
5. A Play Console Data safety export and an App Store privacy label. Also a fresh GET of the live pages at publication time, because they can change.
6. Consistency is **contradicted**. See the list below. Store declarations are **unverified**.

### P18. Web deletion path

1. Proposed wording: “If you cannot use the app, email support.vyd@specialsoftwares.com from a mailbox you can verify. Include the registered mobile number. Do not send an OTP, PIN, or record contents. Email alone does not delete the account and does not reactivate it. We may ask you to complete a verification step. The in-app path is Settings → Account & App → Delete Account & Data. About also has a Delete Account link.”
2. Live delete page, 25 October 2026, says Settings → Delete Account & Data and Settings → About → Delete account, and says those labels match “the current app build being submitted.” Source: `app/(app)/(tabs)/settings.tsx` uses `settings.deleteAccountAndData` under the account section, and `app/(app)/settings/about.tsx` links with `legal.linkDeleteAccount` (“Delete Account”). Reactivation in production uses the email-code screen when identity callables are on (`account-pending-deletion.tsx`). Commit `ba317f5`.
3. No web-request test. The page is a manual email path.
4. No deletion email was sent.
5. A monitored mailbox and a written manual procedure.
6. The two navigation labels exist, so that part is **supported**. “Being submitted” is **contradicted** while public submission is HOLD. “Cancel by a fresh mobile-number verification” for the whole 15 days is **contradicted** by the 13-day cutoff and the email reactivation path. The email path does not itself erase data; describing it as the start of a verified request is **conditional** on the manual procedure.

### P19. Website analytics sentence

1. Proposed wording: “This website loads `/~flock.js`, which points at `/~api/analytics`, and a site events script. Say who receives those requests, or remove the scripts. Do not say the site loads no analytics while those scripts are present.”
2. Live HTML on 25 October 2026 contains both scripts. The visible policy says the marketing site does not load third-party analytics, advertising, session-replay, or marketing pixels. The processor behind `/~api/analytics` was not identified in this session.
3. None in app CI. This is website HTML.
4. The script is already being served. This audit did not change the site.
5. The response of `/~api/analytics` and the vendor contract.
6. The “does not load analytics” sentence is **contradicted** by the script tags. Whether that analytics is third-party is **unverified**.

### P20. Push and over-the-air updates

1. Proposed wording: “Reminders are scheduled on the device. This source does not send remote push notifications. It does not include Expo over-the-air updates.”
2. `src/services/notifications.ts` says push is not used. `package.json` has `expo-notifications` and does not depend on `expo-updates`. `app.json` has no updates block. Commit `ba317f5`.
3. Notification unit coverage exists for local reminders. No push token test was treated as evidence of remote push.
4. EAS may still build binaries. That is separate from runtime OTA.
5. A store listing that promises push or instant updates.
6. Local reminders: **supported**. The live processor sentence that names “platform-level push notifications” and “over-the-air update delivery” is **contradicted** by this source.

## Discrepancies, in order

1. **Live deletion clock.** The public delete, privacy, and terms pages describe one 15-day pending window and mobile-OTP cancellation for every request. Source gives new requests 13 days to reverse and 2 days to process, and keeps a stored legacy deadline, otherwise 45 days. Minimum work: replace those three live sections with the P8 wording. Do not change `DELETION_GRACE_DAYS` or the version-2 constants. Do not publish from this PR.
2. **Live “no analytics” sentence.** The same privacy response loads `/~flock.js` and an events script. Minimum work: remove the scripts or name the recipient. Identify the processor before naming a vendor. Do not reuse an old Tinybird note as a new fact.
3. **Grievance contact and dates.** App source, live site, unpublished draft, and `public-site` HTML name different mailboxes, dates, and addresses. Minimum work: the owner confirms one mailbox, one officer line, and one effective date. Then change `src/config/legal.ts` only if the confirmed public mailbox differs from it, and update the live page under a publishing approval. Do not send a test message from this audit.
4. **Legal consent can be cleared before the cloud write succeeds.** On `main`, `consentPatchForProfile` deletes the AsyncStorage grant and only then awaits `updateProfile`. Minimum work: review draft PR #40. Do not re-implement that change on this branch.
5. **Pending-screen copy can be read as a 13-day erasure.** The confirm dialog says 15 days with cancellation ending two days earlier. The pending screen says a 13-day period and that data is erased after the cutoff. Minimum work, after approval: make the pending string say that the date is the last moment to reactivate, and that removal of eligible app-controlled data is scheduled by the end of the 15-day period. For an older request, show the stored deadline and do not label it 15 days.
6. **Unpublished drafts would republish the wrong clock.** `docs/legal/PRIVACY_POLICY.md` says 45 days for every deletion and omits the content seal. `public-site/*.html` says 15 days, uses `vyaamikkdiary.in`, and still has placeholders. `vyaamikkdiary.in` did not resolve. Minimum work: mark both as historical in a later docs edit, or replace them with the in-app text. Do not upload them.
7. **Store declarations are unknown, and the proposal is stale.** `PLAY_DATA_SAFETY_PROVISIONAL_ANSWERS.md` still describes a single 45-day wired window. Minimum work: export the current Play form before anyone edits it. Do not Save it. There is no App Store privacy-label export in the repo.
8. **Encryption and transport must stay bounded.** In-app ciphertext wording is the right shape. It is not evidence that production documents are sealed or that TLS 1.3 is negotiated. Minimum work: before any public encryption sentence stronger than P6 and P7, record the deployed function revision, the presence of `CONTENT_DATA_KEY` without printing it, and a device capture if a TLS version is going to be named.
9. **Push and OTA on the live processor list.** Minimum work: delete “platform-level push notifications” and “over-the-air update delivery” from the live processor paragraph unless a later build actually adds them.
10. **“Build being submitted” on the live delete page.** Public submission is HOLD. Minimum work: remove that sentence when the page is next edited.
11. **Seven-stage status page is stale.** PR #35 and PR #36 are merged. The file still says PR #35 is a draft. Minimum work: a short header that points readers to `ba317f5`, run 40184077103, and the acceptance sheet. Do not convert that header into a claim that cloud or device acceptance is done.
12. **Incident notification is a promise without a procedure.** Minimum work: write the procedure elsewhere and only then keep the live sentence. This audit does not add a statutory deadline.

## Implementation plan for later approval

No product change is made in this PR. If approved later, the only code edit proposed from this audit is the pending-deletion string in `src/i18n/locales/en.ts`, plus the same key in the other locales, so the 13-day date is described as the reactivation cutoff and the 15-day date remains the scheduled removal bound. Legacy rows must keep their stored deadline.

Everything else is publication or a separate review:

- Edit the live site only under a publishing approval, using P8, P14, P18, P19, and P20.
- Review PR #40 for the consent-retry behaviour. Do not duplicate it.
- Leave deletion constants, the GRIN flag, billing flags, letterhead creation, and restore admission unchanged.
- Do not deploy Functions, change rules, provision a project, run an inventory, or purge an account.

## Acceptance still open

Isolated cloud acceptance, a physical device, and provider evidence remain pending on the acceptance sheet. This document does not sign Scope A or Scope B. It does not authorise a build, an install, a cloud write, a deployment, a merge, a provider message, or a store submission.
