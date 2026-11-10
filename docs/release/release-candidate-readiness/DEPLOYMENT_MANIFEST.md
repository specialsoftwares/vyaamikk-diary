# Deployment manifest — read on 2026-11-10, updated for the transfer-correction source

This is a comparison. Nothing in this document was deployed, built, or changed in Google Cloud.

Read by `support.vyd@specialsoftwares.com`, project `vyaamikk-diary` (number `982505811909`), region `asia-south1`. Serving inventory was read on 2026-11-10. The corrected candidate source for this manifest is the transfer-contract head that supersedes `b34232d8ee352e889a1b4d894e2044a676b04d15` (see the execution sheet for the certified SHA after canonical CI). Compared with main `695833453b9524b34d4ecc857ebdfa58c0bc04b8`. Selected build profile: `internal-grin`.

## What is serving

Forty-nine Gen 2 Cloud Run services. Every one is `ACTIVE`, traffic `100%` on its latest ready revision, `256Mi`, CPU `0.1666`, concurrency `1`, max instances `3`, ingress `ALLOW_ALL`, runtime service account `982505811909-compute@developer.gserviceaccount.com`. There is no `ownerObjectTransfer` service.

| Function | Ready revision | Runtime | Updated | Deploy hash |
| --- | --- | --- | --- | --- |
| androidRtdn | androidrtdn-00004-tx6 | nodejs20 | 2026-10-14 | e4e48258dd26 |
| appStoreServerNotificationsV2 | appstoreservernotificationsv2-00002-rih | nodejs20 | 2026-10-14 | e4e48258dd26 |
| changeVerifiedEmail | changeverifiedemail-00007-hiv | nodejs20 | 2026-09-21 | 0d5712a41fd7 |
| checkMobileQuarantine | checkmobilequarantine-00006-jih | nodejs20 | 2026-09-21 | f544643586ae |
| claimMobile | claimmobile-00009-ram | nodejs20 | 2026-09-21 | f544643586ae |
| completeAccountDeletion | completeaccountdeletion-00006-law | nodejs20 | 2026-09-21 | f544643586ae |
| completeAccountReactivation | completeaccountreactivation-00008-doh | nodejs22 | 2026-11-01 | f4b3f1aaf78f |
| completeAccountRecovery | completeaccountrecovery-00007-jik | nodejs20 | 2026-09-21 | 0d5712a41fd7 |
| confirmVerifiedMobileContactChange | confirmverifiedmobilecontactchange-00004-sar | nodejs20 | 2026-09-21 | f544643586ae |
| ensureAccountDeletionJob | ensureaccountdeletionjob-00007-moq | nodejs20 | 2026-09-21 | f544643586ae |
| generateGstr1WorkingPapers | generategstr1workingpapers-00001-qaw | nodejs20 | 2026-09-21 | f544643586ae |
| getInvoiceDownloadUrl | getinvoicedownloadurl-00001-hob | nodejs20 | 2026-09-21 | f544643586ae |
| getPlayPurchaseAdmission | getplaypurchaseadmission-00002-gzz | nodejs20 | 2026-10-15 | df9e9b056c59 |
| grinBeginEvidenceUpload | grinbeginevidenceupload-00004-sep | nodejs22 | 2026-11-01 | 8ff10a504d1f |
| grinMutateGoodsReceipt | grinmutategoodsreceipt-00004-fev | nodejs22 | 2026-11-01 | 8ff10a504d1f |
| grinReadGoodsReceipt | grinreadgoodsreceipt-00004-tuv | nodejs22 | 2026-11-01 | 8ff10a504d1f |
| grinReconcileCommand | grinreconcilecommand-00004-dex | nodejs22 | 2026-11-01 | 8ff10a504d1f |
| grinRegisterGoodsReceipt | grinregistergoodsreceipt-00004-mux | nodejs22 | 2026-11-01 | 8ff10a504d1f |
| grinReserveEvidence | grinreserveevidence-00004-yom | nodejs22 | 2026-11-01 | 8ff10a504d1f |
| grinUploadEvidence | grinuploadevidence-00004-hew | nodejs22 | 2026-11-01 | 8ff10a504d1f |
| handleWasNotMeToken | handlewasnotmetoken-00006-lib | nodejs20 | 2026-09-21 | f544643586ae |
| handleWasNotMeTokenHttp | handlewasnotmetokenhttp-00007-xog | nodejs20 | 2026-09-21 | f544643586ae |
| markGstr1Filed | markgstr1filed-00001-vay | nodejs20 | 2026-09-21 | f544643586ae |
| mintClientAuthToken | mintclientauthtoken-00007-fir | nodejs20 | 2026-09-21 | f544643586ae |
| openManualRecoveryCase | openmanualrecoverycase-00006-nuh | nodejs20 | 2026-09-21 | f544643586ae |
| openOwnerContent | openownercontent-00002-ban | nodejs22 | 2026-11-01 | 93cc6304796e |
| preflightVerifiedMobileContactChange | preflightverifiedmobilecontactchange-00004-vim | nodejs20 | 2026-09-21 | f544643586ae |
| prepareAndroidBillingAccount | prepareandroidbillingaccount-00003-jqc | nodejs20 | 2026-10-15 | df9e9b056c59 |
| prepareIOSBillingAccount | prepareiosbillingaccount-00001-cem | nodejs20 | 2026-09-21 | f544643586ae |
| rebindQuarantinedMobileCallable | rebindquarantinedmobilecallable-00006-gex | nodejs20 | 2026-09-21 | f544643586ae |
| registerNewDeviceSecurityEvent | registernewdevicesecurityevent-00007-kis | nodejs20 | 2026-09-21 | f544643586ae |
| resendEmailVerification | resendemailverification-00013-qur | nodejs20 | 2026-09-21 | 0d5712a41fd7 |
| resolveManualRecoveryCase | resolvemanualrecoverycase-00007-sir | nodejs20 | 2026-09-21 | 0d5712a41fd7 |
| resolveOrCreateUserByPhone | resolveorcreateuserbyphone-00009-ket | nodejs20 | 2026-09-21 | f544643586ae |
| retireIdentity | retireidentity-00006-sog | nodejs20 | 2026-09-21 | f544643586ae |
| retryNewDeviceSecurityEmail | retrynewdevicesecurityemail-00006-vip | nodejs20 | 2026-09-21 | f544643586ae |
| retryReconciliationWorkItem | retryreconciliationworkitem-00001-yek | nodejs20 | 2026-09-21 | f544643586ae |
| reviewSubscriptionTaxCompliance | reviewsubscriptiontaxcompliance-00001-jid | nodejs20 | 2026-09-21 | f544643586ae |
| scheduledBillingReconciliation | scheduledbillingreconciliation-00005-sfb | nodejs20 | 2026-10-14 | e4e48258dd26 |
| scheduledDeletionCleanup | scheduleddeletioncleanup-00006-sul | nodejs20 | 2026-09-21 | f544643586ae |
| sealOwnerContent | sealownercontent-00002-fey | nodejs22 | 2026-11-01 | 93cc6304796e |
| startAccountReactivation | startaccountreactivation-00007-vih | nodejs22 | 2026-11-01 | f4b3f1aaf78f |
| startAccountRecovery | startaccountrecovery-00008-gim | nodejs20 | 2026-09-21 | 0d5712a41fd7 |
| startEmailVerification | startemailverification-00015-del | nodejs20 | 2026-09-21 | 0d5712a41fd7 |
| updateBillingDetails | updatebillingdetails-00001-yar | nodejs20 | 2026-09-21 | f544643586ae |
| validateAndActivateAndroid | validateandactivateandroid-00004-jks | nodejs20 | 2026-10-14 | e4e48258dd26 |
| validateAndActivateIOS | validateandactivateios-00002-sev | nodejs20 | 2026-10-14 | e4e48258dd26 |
| verifyAndBindEmail | verifyandbindemail-00013-viy | nodejs20 | 2026-09-21 | 0d5712a41fd7 |
| verifyGstinManual | verifygstinmanual-00001-pic | nodejs20 | 2026-09-21 | f544643586ae |

## Absent callables versus the selected build

Candidate exports with no Cloud Run service:

| Export | Selected-build disposition | Configuration and rules dependencies |
| --- | --- | --- |
| `ownerObjectTransfer` | Required. Production letterhead, attachment, PDF, and GRIN original bytes use this path. | No secret. Shared fractional CPU limits. Attempt docs in `ownerObjectTransfers/{id}` (Admin-only; unmatched client path). Does not replace live Storage rules. |
| `recordProcessingPurpose` | Required. Crash-diagnostics grant and withdraw go through `callRecordProcessingPurpose`. | No secret. Region `asia-south1`. Writes `users/{uid}/processingPurposes/{purpose}` and `processingPurposeEvents/{operationId}` with the Admin SDK. Withdrawal also calls `projectRestoreAuthority` and notes the deletion job. Candidate Firestore allows owner read of `processingPurposes` and denies client writes. The serving Firestore release has no `processingPurposes` matcher, so a direct client snapshot can fail while the callable still works. Deploying that matcher is a Firestore rules decision, not a Storage rules decision. |
| `readRestoreAuthorityWatermark` | Not required for `internal-grin`. `eas.json` leaves `EXPO_PUBLIC_RESTORE_ADMISSION_REFRESH` unset, so the JS bridge skips the callable. | Required only for profiles that set that flag (for example `acceptance-android`). Depends on restore-authority projection and `restoreControl` documents that are not in the serving Firestore release. |
| `recordAgeAssessment` | Not required. The `age-declaration` route is retired and does not collect a date of birth or call this export. Demographic age stays optional on profile details. Do not restore an age authorization gate. | Callable remains exported for a separate functions release if a later product path needs it. |
| `logoutAllDevices` | Not required. `LOGOUT_ALL_CONTROL_ENABLED` is false, so Settings does not render the control. | Enabling it needs the callable, `authSecurity` cutoff writers, and validated Firestore session cutoff rules. Those candidate session fences are not the serving Firestore release. |

Deploying only `ownerObjectTransfer` does not create the other four and does not make recovery, mailbox, quarantine, GRIN, or purpose-consent corrections serving.

The candidate `engines.node` is `22`. A later deploy of a September `nodejs20` function would move that service to Node 22. Reactivation, GRIN, and owner-content are already Node 22.

## Secret bindings

Names and versions only. No value was read. No version was created, disabled, or changed.

| Secret | Enabled versions | Version bound on serving functions |
| --- | --- | --- |
| EMAIL_FROM_ADDRESS | 2 (1 is disabled) | 2, on the email, recovery, and reactivation functions that send mail |
| EMAIL_OTP_HMAC_SECRET | 1 | 1, same mail functions |
| EMAIL_PROVIDER_API_KEY | 1, 2, 3, and 4 | 4, same mail functions. A new deploy that asks for the latest version still resolves to 4 only while 4 remains the newest. |
| CONTENT_DATA_KEY | 1 | 1, on `openOwnerContent` and `sealOwnerContent` only |
| BILLING_DIAG_UID_SECRET | 1 | 1, on the Play and App Store billing functions |

`openManualRecoveryCase` has no secret binding. The seven GRIN functions have no `CONTENT_DATA_KEY` binding. The candidate wraps those GRIN callables with `secrets: [contentDataKey]`, so a GRIN redeploy would attach the existing version 1. That is a new binding, not a rotation.

Runtime flags read as values, because they are switches rather than credentials:

- `GRIN_GOODS_EVIDENCE_FUNCTIONS=true` on both reactivation functions, both owner-content functions, and all seven GRIN functions.
- `PLAY_BILLING_ENABLED=true` on `prepareAndroidBillingAccount`, `getPlayPurchaseAdmission`, `validateAndActivateAndroid`, `androidRtdn`, and `scheduledBillingReconciliation`.
- `BILLING_RECONCILIATION_ENABLED=true` only on `scheduledBillingReconciliation`. It is `false` on the other billing and GRIN/reactivation/owner-content services that carry the variable.

Those switches were not changed. A redeploy must keep `GRIN_GOODS_EVIDENCE_FUNCTIONS` exactly `true` on the eleven services that have it. Clearing it fail-closes GRIN.

## Rules releases

Both releases were updated on 2026-10-06. The rules files themselves contain a comment that says they are not live. The release records say they are the serving releases.

| Release | Ruleset | SHA-256 | Bytes |
| --- | --- | --- | --- |
| `cloud.firestore`, updated 2026-10-06T13:14:58Z | `5ec37bc5-7407-437f-a567-3faaa6b0bbb7` | `551203b8b11991fc1d49d42aa6a818fedeca8530654f7505de949b62a1ae298b` | 17344 |
| `vyaamikk-diary.firebasestorage.app`, updated 2026-10-06T13:15:23Z | `a2b0bccc-92b9-43fe-b60f-d0e401963fab` | `6b8959929b86ac2eab41fc591dc1fbf5bb03b80a226226d43bf4c8e72391c76b` | 7942 |

Repository `firestore.rules` is `a936f18dc2877b720084f06906af1c5fccb8f8f4dd79c01ede98dd4cc230d52c` (53057 bytes). Repository `storage.rules` is `97ca9f4e607d2b6c201b9517d812060af5a24038e5eb7578a28ebda69e79120c` (4018 bytes). Neither matches the serving release.

### Firestore compatibility (separate from Storage)

Serving Firestore `isActiveUser` is owner plus `status == active`. It does not enforce the candidate's session cutoff, restore fence, or deletion fence. The candidate rules add those checks and add party-ledger, billing, processing-purpose, erasure, and restore matchers. Those candidate protections are source on this branch. They are not the serving release. Do not describe them as live.

A later Firestore rules deploy is a reviewed decision of its own. It is not implied by deploying Functions. Until that decision, Admin-backed callables still write purpose and restore documents, and client reads that depend on undeployed matchers can fail under the serving release.

### Storage compatibility (separate from Firestore)

Serving Storage allows owner image writes for letterhead and attachments, owner PDF writes, and GRIN original/derivative creates when the serving reservation helpers pass. GRIN update and delete are already false. The repository `storage.rules` file has no `grinEvidence` matcher and uses a different letterhead/attachment write predicate, including the content-seal type.

Do not deploy root `storage.rules` with the function set. Replacing the serving Storage release would remove the live GRIN create/read paths and change the direct letterhead, attachment, and PDF contract used by installed clients. A 60-second signed read URL remains usable until it expires; a rules deploy would not revoke one that was already issued.

### Direct-access boundary and release disposition

Installed binaries keep calling Storage directly under the 2026-10-06 Storage release. The `internal-grin` candidate uses `ownerObjectTransfer` for new uploads. That gateway does not change an already installed binary. The release disposition is: leave the serving Storage rules unchanged until a reviewed old-client transition; deploy the scoped Functions set, including `ownerObjectTransfer` and `recordProcessingPurpose`, before expecting the new client path to work; treat candidate Firestore session/restore/processingPurpose matchers as undeployed until their own review.

The default Firestore database is Native mode in `asia-south1`, with delete protection disabled. That setting was not changed.

## Bucket and IAM

App bucket `vyaamikk-diary.firebasestorage.app` is in `ASIA-SOUTH1`, object versioning is off, and uniform bucket-level access is off. Its IAM policy has no `allUsers` or `allAuthenticatedUsers`. It grants legacy bucket owner to project editors and owners, and legacy bucket reader to project viewers. The two Cloud Functions source buckets are also in `ASIA-SOUTH1` and have versioning off.

GCS still assigns a generation to the current object. With versioning off, an overwrite drops the previous generation. `ifGenerationMatch: 0` can still reject a second live object. A later list of generations cannot recover a generation that the bucket has already dropped. Turning versioning on is a separate bucket change and was not done.

Project IAM has 27 bindings and no public member. `support.vyd@specialsoftwares.com` is an owner. The functions runtime service account is an editor, which is how the serving functions read their bound secret versions. `roles/storage.admin` is held by `firebase-adminsdk-fbsvc@vyaamikk-diary.iam.gserviceaccount.com`. `roles/secretmanager.admin` is held by the Developer Connect service agent. No binding was added or removed.

## Later deploy set

Not deployed. The set is the candidate source that differs from main and is not already represented by the serving revision. Billing, new-device, and verified-contact-change functions are outside it. Their serving revisions stay the rollback baseline as well as the current baseline.

Deploy together, or the new client still depends on an old bundle:

- Phone and quarantine: `resolveOrCreateUserByPhone`, `claimMobile`, `mintClientAuthToken`, `checkMobileQuarantine`, `rebindQuarantinedMobileCallable`. Rollback revisions are `00009-ket`, `00009-ram`, `00007-fir`, `00006-jih`, and `00006-gex`.
- Mail: `startEmailVerification`, `resendEmailVerification`, `verifyAndBindEmail`, `changeVerifiedEmail`. Rollback revisions are `00015-del`, `00013-qur`, `00013-viy`, and `00007-hiv`. Keep secret versions 2, 1, and 4.
- Recovery: `startAccountRecovery`, `completeAccountRecovery`, `openManualRecoveryCase`, `resolveManualRecoveryCase`. Rollback revisions are `00008-gim`, `00007-jik`, `00006-nuh`, and `00007-sir`. Keep the same mail secret versions on the three functions that already have them.
- Deletion: `ensureAccountDeletionJob`, `retireIdentity`, `completeAccountDeletion`, `scheduledDeletionCleanup`. Rollback revisions are `00007-moq`, `00006-sog`, `00006-law`, and `00006-sul`. `INCLUDE_GRIN_IN_ACCOUNT_PURGE` stays false in source.
- Reactivation: `startAccountReactivation`, `completeAccountReactivation`. Rollback revisions are `00007-vih` and `00008-doh`. Keep the GRIN flag and the mail secret versions.
- Owner content: `openOwnerContent`, `sealOwnerContent`. Rollback revisions are `00002-ban` and `00002-fey`. Keep `CONTENT_DATA_KEY` version 1.
- GRIN: the seven `grin*` functions. Rollback revisions are `00004-mux`, `00004-dex`, `00004-fev`, `00004-tuv`, `00004-yom`, `00004-sep`, and `00004-hew`. Keep `GRIN_GOODS_EVIDENCE_FUNCTIONS=true`. Attaching `CONTENT_DATA_KEY` version 1 is expected and is not a rotation.
- New, required by `internal-grin`: `ownerObjectTransfer` and `recordProcessingPurpose`, each with no previous revision. Rollback for either is to delete that one service. Neither has a secret. `ownerObjectTransfer` source limits are `asia-south1`, `256Mi`, 60 seconds, concurrency 1, max instances 3, and the shared fractional CPU. `recordProcessingPurpose` is `asia-south1` with default callable resources unless a later review pins them to the fleet limits.
- Outside this scoped set for `internal-grin`: `readRestoreAuthorityWatermark`, `recordAgeAssessment`, and `logoutAllDevices` stay undeployed until a profile or product path that actually calls them is selected.

Each updated service rolls back by returning 100% traffic to the revision named above. Rules do not move with that traffic change.

Leaving the September contact-change and new-device revisions in place also leaves them on their current admission bundle. They do not pick up `admitCallableUser` until their own deploy. That deploy is not part of this set.

Adding new services consumes another `0.1666 × 3` vCPU per service at its maximum when pinned to the fleet limits. The regional quota was not read, so the manifest does not claim the quota has room.

Play inventory and the upload certificate were not re-read in this pass. Version codes 34 and 35 stay unused for this candidate. Public release remains HOLD.
