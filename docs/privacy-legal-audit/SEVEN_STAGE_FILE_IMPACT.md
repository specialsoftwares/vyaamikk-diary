# Seven-stage file impact

**Audit checkpoint:** `security/firebase-session-hardening` `06d3fcd42b2eaae1c057e1bf7461a088e208bfff`.  
**Implementation:** owner-approved Option A encryption, self-declared 18+ gate, and 15-day deletion for new requests only. The historical inventory below this banner is the pre-implementation map. The file list at the end of this document is the implementation map and is updated with the files actually changed.  
**Not a deployment identity.** Live Firebase metadata remains `LIVE_PENDING`. Source and emulator results are not live KMS, IAM, or production validation.

Evidence labels: SOURCE means read in this commit. REPO_DOC means an older audit note. PROVIDER_DOC means a provider document cited by the program prompt, not re-fetched as a live setting. LIVE_PENDING means the control was not observed in the project.

## 1. Data-flow inventory (SOURCE)

Plaintext means the stored bytes are the business value. TLS protects the network hop only. No content-encryption envelope exists. Billing purchase credentials remain the separate KMS exception and were not re-audited.

| Category | Purpose in this app | Stored path | Who writes | Plaintext holders | Deletion route |
|---|---|---|---|---|---|
| Name, business name, work type, designation | Profile and documents | `users/{uid}` | Owner client patch; create is server-only | Owner, Admin SDK, anyone with a valid owner token | 45-day grace, then purge keeps a deleted stub |
| Phone | Sign-in | `users/{uid}.phoneE164`; `phoneIndex` server-only | `resolveOrCreateUserByPhone` | Same, plus Firebase Auth | Auth delete is last; provider backup tail not live-verified |
| Verified email | Notices and reactivation | `users/{uid}` email fields; `emailBindings` server-only | Email verification functions | Same; Resend receives the destination address when an OTP is sent | Challenge docs are server-only; account purge must include them |
| PIN, locality, district, state | Document identity | `users/{uid}` and SQLite `pincode_cache` | Onboarding client write | Owner and Admin SDK; postal lookup may leave the PIN with the pincode API | Cloud field follows account purge; cache is local |
| DOB / age | Not collected | ABSENT on `UserProfile` | Nobody | Nobody | Not applicable |
| Logo and receipt photos | Letterhead and cash-paid evidence | Storage `users/{uid}/letterhead/` and `attachments/` | `userStorage.ts` `uploadString` | Owner and Admin SDK. EXIF is not stripped | Storage purge lists owned prefixes. GRIN prefix is excluded while the flag is false |
| Diary text, party names, amounts | Business diary | SQLite `entries_local` then `users/{uid}/entries` | `firebaseDiaryRepository` | Device SQLite and Firestore | Sync delete plus later purge. Offline copies on a lost phone are not remote-erasable |
| Customer credit, purchase orders, packs, letterhead docs | Business records | Matching `users/{uid}` subcollections | Direct client services | Firestore plaintext. Party names and mobiles are third-party personal data inside the owner’s records | Same purge. These types are not in the diary SQLite outbox |
| Search blob and suggestions | On-device lookup | Entry field `search` blob; SQLite `master_data_suggestions` | Client | Device and, for the blob, Firestore | Follows the entry |
| Push token | Device registry | `users/{uid}/trustedDevices` | `trustedDeviceRegistry.ts` | Firestore | Registry is not a revocation authority. Logout-all control stays off |
| Consent receipt | Terms and privacy acceptance | `users/{uid}.legalConsents[]` and a pending local record | `legalConsentService` | Firestore. Receipt may include uid, UEID, phone | Not a purpose-withdrawal log |
| Diagnostics preference | Optional crash reports | AsyncStorage `vyd_telemetry_consent_v1` | `telemetryConsent.ts` | Device only | Withdrawal is local. Crashlytics server retention is a provider tail |
| Reactivation OTP | Cancel a pending deletion | `pendingEmailVerifications` digest only | `reactivationOtp.ts` | Code is in mail-provider memory, not Firestore | Five-minute TTL. Purge of the account is a separate job |
| Billing and tax | Entitlement and invoices | `subscription/*` and `_companyBilling` and related root collections | Functions only | Server. Client cannot write status | Retain on a legal/billing basis. Do not fold into casual content deletion |
| App-generated PDF | Owner’s document | Local file from `pdfService.ts` | App | Device. `PDF_CLOUD_BACKUP_ENABLED` is false | Not a cloud object. Sharing is user-directed |

Account-owner data is the profile, phone, email, and logo. Customer and party names, mobiles, and receipt images of other people are third-party personal data stored inside the owner’s business records. The app does not give those people their own login.

## 2. Existing controls to preserve (SOURCE)

| Control | Where | State |
|---|---|---|
| Session fence, serialized session delete, monotonic logout-all | `authSessionFence.ts`, `sessionPersistence.ts`, `sessionSecurityPolicy.ts` | Present. `LOGOUT_ALL_CONTROL_ENABLED` is false |
| Profile cache | SecureStore on iOS/Android via `session.ts` | Present. JS Auth credential remains AsyncStorage (`firebase.ts` / `jsAuthBridge.ts`). Do not migrate it in this program without a separate test |
| Reactivation email OTP | `reactivationOtp.ts`, `accountReactivation.ts` | Present at this HEAD. Five-minute code, bound digest, purge race via `automaticRestorationAllowed` |
| Deletion lifecycle | `lifecycle.ts` `scheduledDeletionCleanup` every 24 hours, exported from `functions/src/index.ts` | Present in source. Deployed revision LIVE_PENDING |
| Grace | 45 days | Present. Do not change in this checkpoint |
| GRIN purge | `INCLUDE_GRIN_IN_ACCOUNT_PURGE = false` | Present. Do not enable |
| Play reviewer | Firebase test-phone path. Script reads `PLAY_REVIEW_PHONE` with no default | Present. Credentials not printed |
| Billing KMS | `functions/src/billing/google/kmsAdcClient.ts` | Present. Accepted earlier. Not reused |
| Rules | `firestore.rules`, `storage.rules` | Client create of `users/{uid}` denied. Indexes and OTP docs denied. Deployed rules LIVE_PENDING |
| PDF cloud backup | `PDF_CLOUD_BACKUP_ENABLED = false` | Present |
| Canonical CI | `.github/workflows/ci.yml` `npm run ci:verify` | No workflow edit in this checkpoint |

## 3. Verified gaps

| Gap | Evidence class |
|---|---|
| No DOB, no server age result, notices still say 18+ | SOURCE. `UserProfile` has no DOB. `ageEligibility.ts` ABSENT. Register C11 |
| Stored business fields are plaintext to an authorized reader | SOURCE. Provider AES-256 is PROVIDER_DOC, not a field envelope |
| TLS 1.3-only is not configured | SOURCE. No cleartext flag found in the hardening plugin. No Firebase-wide TLS switch exists in this repo. Negotiated version on a device was not measured |
| 15-day universal erasure is false for this stack | SOURCE grace is 45 days. PROVIDER_DOC: Auth copies can remain up to 180 days; Crashlytics about 90 days. Bucket soft-delete and PITR are LIVE_PENDING |
| July retention note still said 15 days | REPO_DOC `f1019b6`, superseded for the constant by this commit |
| Diary offline path exists; credit, purchase orders, packs, and letterhead do not use that outbox | SOURCE |
| Client deletion helper still attempts direct index deletes that production rules deny | SOURCE `firebaseServerDeletion.ts` |
| Purpose consent is Terms/Privacy plus a separate crash-report switch, not a server purpose ledger | SOURCE `LegalConsentRecord`, `telemetryConsent.ts` |
| Deployed function revision, rules release, bucket IAM, KMS IAM, and backup schedules | LIVE_PENDING |
| Legal commencement dates were not re-read from the Gazette today | REPO_DOC. Core duties recorded as scheduled around May 2027 |

## 4. Live-resource matrix

Observed 2026-10-22T12:00:01Z. No secret values were requested.

| Resource | Observed | Proposed change | Authorization |
|---|---|---|---|
| GCP/Firebase project `vyaamikk-diary` | CLI could not list resources | None | No login, no IAM edit |
| Firestore database, location, PITR, TTL, backup | LIVE_PENDING | None until a read-only session is authorized | Read-only describe later |
| Storage buckets, versioning, soft-delete, public access | LIVE_PENDING | None | Same |
| Functions in `asia-south1`, runtime service account, ingress, secret names actually bound | Source declares `EMAIL_OTP_HMAC_SECRET`, `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM_ADDRESS`. Binding on the deployed revision is LIVE_PENDING | None | No secret create, no deploy |
| KMS keys | Not listed. Billing key purpose stays as previously accepted | Do not create a personal-data key until custody is chosen | No key admin |
| Auth providers, Crashlytics retention, log sinks | LIVE_PENDING | None | No OTP send |
| Human IAM | LIVE_PENDING. No roles removed | None | No IAM change |

## 5. File matrix

Status is existence at `06d3fcd` before these notes. Checkpoint action is the only action taken now.

### Stage 1 — audit foundation

| Path | Status | Current | Checkpoint | Later, after decisions | Tests already present |
|---|---|---|---|---|---|
| `AGENTS.md` | PRESENT | Expo docs pin | NO CHANGE | NO CHANGE | — |
| `docs/privacy-legal-audit/TECHNICAL_DATA_INVENTORY.md` | PRESENT | July inventory | MODIFY banner | Keep as history | — |
| `docs/privacy-legal-audit/DATA_FLOW_AND_STORAGE_REGISTER.md` | PRESENT | July flows | MODIFY banner | Keep as history | — |
| `docs/privacy-legal-audit/SDK_AND_PROCESSOR_REGISTER.md` | PRESENT | July processors | NO CHANGE this pass | Refresh versions when implementation starts | — |
| `docs/privacy-legal-audit/RETENTION_AND_DELETION_MATRIX.md` | PRESENT | Says 15 days | MODIFY banner | Rewrite clocks only after the retention decision | — |
| `docs/privacy-legal-audit/LEGAL_SOURCE_AND_COMMENCEMENT_MATRIX.md` | PRESENT | Phased commencement | MODIFY banner | Counsel re-reads the Gazette | — |
| `docs/privacy-legal-audit/POLICY_CONTRADICTION_REGISTER.md` | PRESENT | C1–C16 | MODIFY C5 note and C17–C20 | Close rows only when the owner decides | — |
| `docs/privacy-legal-audit/AUDIT_EVIDENCE_INDEX.md` | PRESENT | July index | MODIFY checkpoint section | Add live evidence when a read-only session exists | — |
| `docs/STORAGE_SECURITY.md` | PRESENT | Path model | MODIFY banner | No rule edit now | `storage.rules.test.ts` |
| `firebase.json`, `firestore.rules`, `storage.rules`, `firestore.indexes.json` | PRESENT | Effective source config | NO CHANGE | Rules change only with age or encryption schema | Rules emulator suites |
| `functions/src/index.ts` | PRESENT | Exports deletion schedule, reactivation, logout-all | NO CHANGE | New exports go through the coordinator | `sessionSecurityPolicy.test.ts` inventory |
| `src/config/firebase.ts`, `runtimeEnvironment.ts`, `productionGuard.ts` | PRESENT | JS SDK and release backend selection | NO CHANGE | NO CHANGE unless transport work is approved | `productionGuard` tests |
| `docs/privacy-legal-audit/SEVEN_STAGE_FILE_IMPACT.md` | was ABSENT | — | ADD this file | Maintain | — |
| `docs/privacy-legal-audit/CRYPTO_CUSTODY_DECISION.md` | was ABSENT | — | ADD, decision UNSELECTED | Record the owner’s choice | — |

### Stage 2 — age

| Path | Status | Current | Checkpoint | Later |
|---|---|---|---|---|
| `src/domain/types.ts`, `src/services/auth/types.ts` | PRESENT | `UserProfile` has no DOB | NO CHANGE | ADD a server-owned eligibility result only if the age policy is accepted. Do not put DOB in a token |
| `src/onboarding/profileIdentityModel.ts`, `onboardingProfileDraftV2.ts`, `transformProfileDraftV2.ts`, `completeOnboardingProfileLogic.ts`, `completeOnboardingProfile.ts` | PRESENT | Profile completion without age | NO CHANGE | MODIFY to collect one civil date before extra profile media, then wait for the server |
| `app/(auth)/complete-profile.tsx`, `profile-review.tsx` | PRESENT | Routes | NO CHANGE | Wire only if they are still the live screens. Auth v2 review is the likely UI |
| `src/auth-v2/screens/ProfileReviewScreen.tsx`, `ProfileReviewPresentation.tsx` | PRESENT | Review UI | NO CHANGE | MODIFY accessible age messages |
| `clientProfilePatchPayload.ts`, `profileFirestorePayload.ts`, `normalizeProfile.ts` | PRESENT | Client patch denylist | NO CHANGE | MODIFY so the client cannot set “adult” or “verified” |
| `functions/src/identity/resolveOrCreateUserByPhone.ts`, `admitCallableUser.ts` | PRESENT | Phone admission | NO CHANGE | MODIFY admission. Do not put DOB into token minting |
| `app/(app)/profile.tsx`, `ProfileYourDetailsEditPanel.tsx` | PRESENT | Later edits | NO CHANGE | MODIFY only for a bounded DOB correction |
| `firestore.rules` | PRESENT | Owner patch | NO CHANGE | MODIFY only to make eligibility server-owned |
| `src/domain/ageEligibility.ts`, `ageEligibility.test.ts`, `functions/src/identity/ageEligibility.ts` | ABSENT | No equivalent found | NO CHANGE | ADD after the leap-day rule is chosen |
| `src/i18n/locales/en.json`, `hi.json`, `gu.json`, `ta.json`, `te.json` | PRESENT | Five locales | NO CHANGE | Coordinator adds strings. Tamil, Telugu, and Gujarati need real translations |

### Stage 3 — transport and local leakage

| Path | Status | Current | Checkpoint | Later |
|---|---|---|---|---|
| `src/config/firebase.ts`, `env.ts`, `runtimeEnvironment.ts` | PRESENT | Public Firebase config | NO CHANGE | NO CHANGE for TLS. Do not add a proxy to advertise TLS 1.3 |
| `nativePhoneAuth.ts`, `identityCallable.ts`, `jsAuthBridge.ts` | PRESENT | Native phone auth, callables, AsyncStorage JS session | NO CHANGE | Preserve |
| `app.json`, `app.config.js`, `eas.json` | PRESENT | No TLS minimum. EAS public env is mode and feature flags | NO CHANGE | Native backup and cleartext only if a device measurement shows a gap |
| `plugins/withAndroidReleaseManifestHardening.js` | PRESENT | Removes Compose preview activity. Does not set cleartext | NO CHANGE | Register only through the existing app config if a later build requires it |
| `userStorage.ts`, `userStorageUpload.ts`, `userStorageUploadCore.ts` | PRESENT | Authenticated `uploadString` | NO CHANGE | No new cloud PDF writer |
| `cashPaidPhotoStorage.ts`, `profileLogo/storage.ts` | PRESENT | Original bytes uploaded | NO CHANGE | EXIF policy is a separate decision. Do not strip originals silently |
| `sessionPersistence.ts`, `session.ts` | PRESENT | SecureStore profile cache; queue | NO CHANGE | Preserve |
| `localEntriesRepository.ts`, `formDraftsRepository.ts`, `syncQueueRepository.ts` | PRESENT | SQLite plaintext diary queue | NO CHANGE | Local encryption only under the chosen custody model |
| `pdfService.ts`, `regenerateEntryPdf.ts` | PRESENT | Local PDF | NO CHANGE | Keep local |
| `crashReporter.ts`, `logger.ts` | PRESENT | Crashlytics toggle; privacy tests exist | NO CHANGE | Extend redaction only if new fields are logged |
| `kmsAdcClient.ts` | PRESENT | Billing KMS | NO CHANGE | Do not reuse |
| `TRANSPORT_AND_ENCRYPTION_EVIDENCE.md` | ABSENT | — | NO CHANGE this pass | ADD when a device TLS observation exists |

### Stage 4 — custody implementation

Every row is NO CHANGE now. Adapters that a later implementation must route, if Option A or B is accepted:

`src/services/diary/firebase.ts`, `diary/atomicCreate.ts`, `diary/firebaseUpdate.ts`, `customerCredit/firebase.ts`, `customerCredit/recordMutations.ts`, `purchaseOrder/firebase.ts`, `professionalPack/firebase.ts`, `letterhead/documents-firebase.ts`, `letterhead/firebase.ts`, `letterhead/letterheadStorageMigration.ts`, `cashPaid/cashPaidVoucherSerial.firebase.ts`, `records/persistentSaveLock.ts`, `records/recordCompletedSteps.ts`, `storage/userStorageUploadCore.ts`, `attachments/cashPaidPhotoStorage.ts`, `profileLogo/storage.ts`, `billing/optionC/atomicBillableCreate.ts`.

Domain types `businessEntry.ts`, `customerCredit.ts`, `professionalPack.ts`, `purchaseOrder.ts` stay the plaintext domain model. Persistence encryption would be a separate serializer.

ABSENT and not created: `src/services/privacy/cryptoEnvelope.ts`, `contentKeyStore.ts`, `contentKeyRecovery.ts`, `cryptoEnvelope.test.ts`, `functions/src/privacy/contentEncryption.ts`, `privacyKeyPolicy.ts`, `ENCRYPTION_MIGRATION_AND_RECOVERY.md`. Add `contentEncryption.ts` only for Option A.

`authSessionFence.ts`, `jsAuthBridge.ts`, and `sessionPersistence.ts` stay the only session and key-cache fence.

### Stage 5 — consent

| Path | Status | Current | Checkpoint | Later |
|---|---|---|---|---|
| `src/domain/legalConsent.ts` | PRESENT | Terms, privacy, version, time, optional uid/UEID/phone | NO CHANGE | EXTEND with purpose ids only if the current receipt cannot represent them. Minimize phone on the receipt |
| `legalConsentService.ts`, `pendingConsentReconcile.ts`, `legalConsent.test.ts` | PRESENT | Registration acceptance | NO CHANGE | MODIFY for purpose state |
| `LegalConsentCheckboxes.tsx`, `LegalConsentFooter.tsx` | PRESENT | Terms and privacy | NO CHANGE | Optional purposes stay unchecked |
| `TelemetryConsentModal.tsx`, `TelemetryConsentHost.tsx`, `telemetryConsent.ts`, `CrashReportingBridge.tsx`, `crashReporter.ts`, `CrashReportsPreferenceRow.tsx` | PRESENT | AsyncStorage opt-in, fail path returns null | NO CHANGE | Keep one prompt. Withdrawal must not delete the business account |
| `src/config/legal.ts`, `publicLinks.ts`, `src/content/legal/documents.ts` | PRESENT | Notice sources | NO CHANGE | Coordinator aligns versions |
| `docs/legal/PRIVACY_POLICY.md`, draft privacy and terms | PRESENT | Drafts | NO CHANGE | No unsupported encryption or 15-day claim |
| `public-site/privacy.html`, `delete-account.html` | PRESENT | Site source | NO CHANGE | Publication is separate |
| Play and SDK matrices | PRESENT | July mapping | NO CHANGE | Refresh with live processors |
| `src/domain/privacyPurpose.ts`, `functions/src/privacy/recordPurposeConsent.ts` | ABSENT | — | NO CHANGE | ADD only if `LegalConsentRecord` cannot carry purpose state |

### Stage 6 — deletion

| Path | Status | Current | Checkpoint | Later |
|---|---|---|---|---|
| `src/domain/accountDeletion.ts`, `identityLifecycle.ts` | PRESENT | 45-day grace | NO CHANGE | Split request time, reactivation deadline, erase deadline, and provider tail only after the decision |
| `lifecycle.ts`, `deletionJob.ts`, `finalPurge.ts` | PRESENT | Daily schedule, leases, generations, stub retained, `automaticRestorationAllowed` | NO CHANGE | One lifecycle. Do not add a second cron |
| `firestorePurge.ts`, `storagePurge.ts`, `userOwnedStoragePaths.ts` | PRESENT | Bounded deletes | NO CHANGE | Extend coverage lists, including OTP and email-binding docs, without enabling production purge |
| `grinCleanup.ts`, `grinCleanupLists.ts` | PRESENT | Flag false | NO CHANGE | Do not flip the flag here |
| `authDelete.ts` | PRESENT | Auth delete last | NO CHANGE | Report provider retention as a tail, not as job success |
| `accountReactivation.ts`, `reactivationOtp.ts` | PRESENT | Email OTP correction | NO CHANGE | Preserve |
| Client deletion services listed in the prompt | PRESENT | Mix of server callables and a best-effort client wipe | NO CHANGE | Prefer the server job. Do not add a second client wipe |
| `settings/delete.tsx`, `account-pending-deletion.tsx` | PRESENT | User-facing deletion and reactivation | NO CHANGE | Copy changes only with the retention decision |
| `sessionSecurityPolicy.ts`, `logoutAllDevices.ts` | PRESENT | Cutoff and phone-origin checks | NO CHANGE | Do not delete `authSecurity` as part of purge without a fence design |
| `processorDeletion.ts`, `restoreSuppression.ts`, `retentionPolicy.ts` | ABSENT | — | NO CHANGE | ADD only if the existing job cannot record processor tails |
| Deletion audit docs | PRESENT | July / later engineering notes | Banners only | Update runbooks when a live read exists |

### Stage 7 — proof

| Path | Status | Checkpoint | Later |
|---|---|---|---|
| `deletion.unit.test.ts`, `grinCleanup.unit.test.ts`, `reactivationOtp.unit.test.ts` | PRESENT | NO CHANGE | Extend when grace or purge behavior changes. Do not weaken the 45-day or flag-false assertions before that |
| Consent, crash, logger, local-device, storage-path, rules tests | PRESENT | NO CHANGE | Add cases with the feature |
| `privacyLifecycle.integration.test.ts`, `privacyLifecycle.emulator.test.ts` | ABSENT | NO CHANGE | ADD only for behavior the existing suites do not cover |
| `package.json`, lockfiles, `functions/package.json`, `ci.yml` | PRESENT | NO CHANGE | No dependency and no CI edit in this checkpoint |
| `RELEASE_COMPLETION_REGISTER.md`, verification template | PRESENT | NO CHANGE | One release identity when an implementation candidate exists |

Rollback for this checkpoint is deleting the audit-note edits. There is no schema, key, or job change to roll back.

## 6. Approved decisions (implemented in source)

1. **Custody is Option A.** Diary business fields and original attachment bytes are sealed with AES-256-GCM. The key stays in the server secret `CONTENT_DATA_KEY`. An admitted owner session can open the ciphertext. A direct database or object reader sees the envelope. This is not end-to-end encryption.
2. **Replacement-phone recovery** uses normal authenticated sign-in. The second device reads the envelope and asks the server to open it. No content key is stored on the phone.
3. **Age** is a self-declared `YYYY-MM-DD` checked as completed years on the server’s Asia/Kolkata date. The eighteenth birthday is allowed. The day before is blocked. A 29 February birthday is observed on 1 March in a non-leap year. The full date is not stored. Existing accounts stay unassessed. There is no Aadhaar collection and no reviewer bypass.
4. **New deletion requests** use policy version 2: 15 days from the server-accepted request, reactivation for 13 days, and 2 days reserved for processing and retries. Existing stored deadlines stay. A missing legacy deadline is the request time plus 45 days. The global GRIN flag stays false for legacy jobs. Policy version 2 includes GRIN. Provider backups, legally retained billing records, and exported PDFs are exceptions.

The 15-day figure is the owner’s operational target. It is not labeled as a DPDP statutory period.

## 7. Preserved boundaries

Session fencing, serialized session cleanup, origin revocation, production reactivation email OTP, Play reviewer sign-in, `PDF_CLOUD_BACKUP_ENABLED = false`, billing behavior, the billing KMS key, and the logout-all control (`false`) stay. Local diary SQLite remains the on-device record. Cloud credit, purchase-order, pack, and letterhead document bodies are not sealed by this change. That gap is recorded in the deployment note. No live deploy, key creation, migration, or purge was run.

## 8. Files changed for the approved implementation

| Stage | Files |
|---|---|
| Age gate | `src/domain/ageEligibility.ts`, `functions/src/identity/ageEligibility.ts`, `functions/src/identity/recordAgeAssessment.ts`, `app/(auth)/age-declaration.tsx`, `src/auth-v2/screens/AgeDeclarationScreen.tsx` |
| Encryption and recovery | `functions/src/privacy/contentEncryption.ts`, `functions/src/privacy/ownerContent.ts`, `src/services/privacy/diarySealDocument.ts`, `src/services/privacy/ownerContentApi.ts`, `src/services/diary/firebase.ts`, `src/services/diary/atomicCreate.ts`, `src/services/diary/firebaseUpdate.ts`, `src/services/storage/userStorage.ts`, `src/services/letterhead/letterheadImageResolver.ts`, `src/constants/contentSeal.ts` |
| Consent | `src/domain/processingPurpose.ts`, `src/services/consent/purposeConsent.ts`, `src/domain/legalConsent.ts` |
| Deletion | `src/domain/identityLifecycle.ts`, `functions/src/deletion/deletionPolicy.ts`, `functions/src/deletion/deletionJob.ts`, `functions/src/deletion/finalPurge.ts`, `functions/src/deletion/lifecycle.ts`, `functions/src/deletion/restoreSuppression.ts`, `src/services/accountDeletion/pendingDeletion.ts` |
| Shared contracts | `firestore.rules`, `functions/src/index.ts`, `functions/src/identity/callableSessionCoverage.ts`, `src/domain/types.ts`, `src/services/auth/normalizeProfile.ts`, `src/content/legal/documents.ts`, locale copy, `package.json` |
| Proof and rollout notes | `src/domain/ageEligibility.test.ts`, `functions/src/privacy/contentEncryption.unit.test.ts`, `functions/src/deletion/deletionPolicy.unit.test.ts`, `src/services/privacy/diarySealDocument.test.ts`, `firestore.rules.test.ts`, `PRIVACY_DEPLOYMENT_SEQUENCE.md` |
