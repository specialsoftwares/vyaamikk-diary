# Firebase session hardening — deployment packet

Source and prior emulator evidence. Do not deploy Functions, Rules, indexes, IAM, secrets, or Auth configuration from this packet until a separate authorization. Do not delete `authSecurity` documents on rollback.

## What changed

- Shared auth mutations are serialized. Logout retires JS bridge admission and the native callable gate before either SDK is cleaned. JS and native sign-out run independently. A cleanup queued for an older generation does not sign out a newer login.
- `mintClientAuthToken` verifies the bearer with revocation checking, requires the phone provider, ignores caller-supplied uid and `request.data`, and stamps `vydOriginAuthTime` from the verified native `auth_time`.
- `logoutAllDevices` calls Admin `revokeRefreshTokens` outside the Firestore transaction, then records server-owned `authSecurity/{uid}`. A session document's `status: "revoked"` is metadata only.
- User-authenticated callables that reach the Admin SDK call `assertAdmittedCallableUser` before that work. A missing `request.auth` still follows the callable's own unauthenticated path. A present session must verify and sit strictly after `revokedBeforeAuthTimeSeconds`. `claimMobile` is the `resolveOrCreateUserByPhone` alias, so that handler covers it.
- Logout-all updates are monotonic. A different operation replaces the current one only when its server second is greater than `startedAtSeconds`. The same operation id retries without lowering the cutoff. Completion updates only that operation id and never lowers the cutoff or changes the operation id. An older request or continuation that loses the race returns superseded or pending and does not mark the newer operation complete.
- A normal login on another phone does not revoke older sessions or their metadata. The “This wasn’t me” link records a report. Its response says the link did not sign any device out.
- Settings keeps a this-device sign-out that does not call `logoutAllDevices`. The sign-out-every-device control is present in source and is not rendered: `LOGOUT_ALL_CONTROL_ENABLED` stays false until the protected callables and both cutoff rules are deployed and validated. Confirmation captures the uid and pre-logout generation. Local sign-out retires that generation and keeps that retirement through the SDK and profile-cache awaits. A login that starts during either await is not cleared, and its completion does not navigate or alert. The logout's own generation bump still allows completion. Profile-cache deletion lives only in that sign-out. A server operation can finish for the original account when local completion is discarded. An unmounted screen does not navigate or alert. Only a `complete` result says refresh tokens were revoked.
- Firestore and Storage rules admit a session only when no cutoff exists, or when the origin second is strictly greater than `revokedBeforeAuthTimeSeconds`. Admin `verifyIdToken(..., true)` rejects `auth_time * 1000 < tokensValidAfterTime` and allows an equal millisecond (`firebase-admin` 13.10.0 `base-auth.js`). The rules deny that same second so a rollback cannot treat it as still valid.
- JS Auth stays on AsyncStorage via `getReactNativePersistence`. Installed `@firebase/auth` 1.13.2 implements that store with async `getItem` / `setItem` and `JSON.stringify`. The JS refresh and access token JSON remains in AsyncStorage, which is plaintext and can be included in device backups. SecureStore was not adopted: its item size limit can reject the Auth user blob, and that migration was not tested. The SecureStore profile cache still holds no raw token. `auth.signOut()` removes the Firebase persistence entry. Logout does not call `AsyncStorage.clear`.

## Entry points

Enforced: `mintClientAuthToken`, `logoutAllDevices`, `resolveOrCreateUserByPhone`, `checkMobileQuarantine`, `rebindQuarantinedMobileCallable`, `preflightVerifiedMobileContactChange`, `confirmVerifiedMobileContactChange`, `startEmailVerification`, `resendEmailVerification`, `verifyAndBindEmail`, `changeVerifiedEmail`, `startAccountRecovery`, `completeAccountRecovery`, `openManualRecoveryCase`, `resolveManualRecoveryCase`, `startAccountReactivation`, `completeAccountReactivation`, `ensureAccountDeletionJob`, `retireIdentity`, `completeAccountDeletion`, `registerNewDeviceSecurityEvent`, `retryNewDeviceSecurityEmail`, `verifyGstinManual`, `validateAndActivateIOS`, `validateAndActivateAndroid`, `updateBillingDetails`, `reviewSubscriptionTaxCompliance`, `retryReconciliationWorkItem`, `prepareIOSBillingAccount`, `prepareAndroidBillingAccount`, `markGstr1Filed`, `getPlayPurchaseAdmission`, `getInvoiceDownloadUrl`, `generateGstr1WorkingPapers`, and the production GRIN callables (`grinRegisterGoodsReceipt`, `grinReconcileCommand`, `grinMutateGoodsReceipt`, `grinReadGoodsReceipt`, `grinReserveEvidence`, `grinBeginEvidenceUpload`, `grinUploadEvidence`).

Excluded:

- `androidRtdn` — Play RTDN authenticates the push with OIDC, not a user ID token.
- `appStoreServerNotificationsV2` — Apple's signed payload, not a user ID token.
- `scheduledBillingReconciliation` and `scheduledDeletionCleanup` — Cloud Scheduler and the Functions service identity.
- `handleWasNotMeToken` and `handleWasNotMeTokenHttp` — the signed single-use link is the credential. The handler records a report and does not revoke Firebase refresh tokens.

`retryReconciliationWorkItem` and `resolveManualRecoveryCase` still require the caller's own session to pass the cutoff. An admin or support claim does not bypass it. `getDownloadURL` bearer file URLs are a separate capability and are not revoked by logout.

## Evidence labels

| Check | Label |
| --- | --- |
| Fence, mint policy, transactional logout-all, callable inventory, new-device unit tests, persistence rationale against `@firebase/auth` 1.13.2, logout-all completion bound to the confirming identity, and local sign-out ownership across deferred SDK and profile-cache cleanup | SOURCE |
| Rules unit tests and letterhead static access estimates on `ee54f0e`. Rules files were not changed after that | EMULATOR, prior run |
| Injected verifier failures | SOURCE, not revocation |
| Controlled live Firebase Auth revocation | not run |
| Two-device or owner-phone enforcement | not run |

## Rollout

1. Deploy the protected callables in this packet, including `mintClientAuthToken` and `logoutAllDevices`. Do not enable `LOGOUT_ALL_CONTROL_ENABLED` in this step. Until a cutoff document exists, current clients keep working. New mints carry `vydOriginAuthTime`. This-device sign-out does not call `logoutAllDevices`.
2. Deploy `firestore.rules` and `storage.rules` together, then validate cutoff enforcement on both. Missing `authSecurity/{uid}` still allows access, so this does not lock out sessions that have never used logout-all. Each signed-in rule evaluation adds an `exists` and, when that document is present, a `get` on `authSecurity/{uid}`. Letterhead create stays within the 20-access cap (static estimate 3, mirror create 4). A custom token without `vydOriginAuthTime` is denied once a cutoff exists. Phone sign-in after the cutoff is admitted.
3. Enable the logout-all control only after those callables and both rules are deployed and the cutoff validation has passed. Shipping the enabled control before Rules enforcement leaves an access window for Admin SDK calls and for clients that have not yet been denied by Rules.

`userSessions/{uid}/sessions/{sessionId}` stays device metadata. Do not treat its `status` as Firebase revocation.

## Rollback

- Redeploying the previous rules restores data access for ID tokens that have not expired, including tokens whose refresh tokens were revoked. That resurrects access until expiry. Prefer leaving the rules in place.
- Do not delete `authSecurity` documents and do not lower `revokedBeforeAuthTimeSeconds`.
- The previous `mintClientAuthToken` can be restored only while the new rules are not enforcing a cutoff. A token minted without `vydOriginAuthTime` fails those rules after logout-all.
- `continuePendingLogoutAllForUid` is the server retry for a `pending` cutoff. It is not a client callable. A failed `revokeRefreshTokens` returns `failed-precondition` and leaves the cutoff pending. A continuation that finds a newer operation returns pending and does not mark that operation complete.

## Not in this change

No second JWT issuer was added. No Firebase refresh-token database was added. No rate-limit or broader architecture review was done. The AsyncStorage credential store was not migrated. Controlled live Firebase revocation and two-device enforcement were not run.
