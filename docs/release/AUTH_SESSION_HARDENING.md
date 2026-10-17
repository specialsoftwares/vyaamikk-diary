# Firebase session hardening — deployment packet

Source only. Do not deploy Functions, Rules, indexes, IAM, secrets, or Auth configuration from this packet until a separate authorization. Do not delete `authSecurity` documents on rollback.

## What changed

- Shared auth mutations are serialized. Logout retires JS bridge admission and the native callable gate before either SDK is cleaned. JS and native sign-out run independently. A cleanup queued for an older generation does not sign out a newer login.
- `mintClientAuthToken` verifies the bearer with revocation checking, requires the phone provider, ignores caller-supplied uid and `request.data`, and stamps `vydOriginAuthTime` from the verified native `auth_time`.
- `logoutAllDevices` calls Admin `revokeRefreshTokens` and writes server-owned `authSecurity/{uid}`. A session document's `status: "revoked"` is metadata only.
- Firestore and Storage rules admit a session only when no cutoff exists, or when the origin second is strictly greater than `revokedBeforeAuthTimeSeconds`. Admin `verifyIdToken(..., true)` rejects `auth_time * 1000 < tokensValidAfterTime` and allows an equal millisecond (`firebase-admin` 13.10.0 `base-auth.js`). The rules deny that same second so a rollback cannot treat it as still valid.
- JS Auth stays on AsyncStorage via `getReactNativePersistence`. The SecureStore profile cache is unchanged and still holds no raw token.

## Evidence labels

| Check | Label |
| --- | --- |
| Fence, mint policy, logout-all policy, persistence decision | SOURCE |
| Rules unit tests against the emulators | EMULATOR |
| Injected verifier failures | SOURCE, not revocation |
| Owner phone, Play, or production Auth revocation | not run |

RTDN (`functions/src/billing/callables/androidRtdn.ts`) stays on OIDC. `scheduledBillingReconciliation` is unchanged. `getDownloadURL` bearer file URLs are a separate capability and are not revoked by logout.

## Rollout

1. Deploy `mintClientAuthToken` and `logoutAllDevices` first. Until a cutoff document exists, current clients keep working. New mints carry `vydOriginAuthTime`.
2. Ship a client that uses the fenced sign-out. Local sign-out stays offline and does not call `logoutAllDevices`.
3. Deploy `firestore.rules` and `storage.rules` together. Missing `authSecurity/{uid}` still allows access, so this does not lock out sessions that have never used logout-all.
4. Enable the logout-all control only after that client is the one users have. A custom token without `vydOriginAuthTime` is denied once a cutoff exists. Phone sign-in after the cutoff is admitted.

`userSessions/{uid}/sessions/{sessionId}` stays device metadata. Do not treat its `status` as Firebase revocation.

## Rollback

- Redeploying the previous rules restores data access for ID tokens that have not expired, including tokens whose refresh tokens were revoked. That resurrects access until expiry. Prefer leaving the rules in place.
- Do not delete `authSecurity` documents and do not lower `revokedBeforeAuthTimeSeconds`.
- The previous `mintClientAuthToken` can be restored only while the new rules are not enforcing a cutoff. A token minted without `vydOriginAuthTime` fails those rules after logout-all.
- `continuePendingLogoutAllForUid` is the server retry for a `pending` cutoff. It is not a client callable. A failed `revokeRefreshTokens` returns `failed-precondition` and leaves the cutoff pending.

## Not in this change

Other user callables still accept the Functions framework's `request.auth` and can bypass these rules with the Admin SDK. They are not wrapped in this packet. No second JWT issuer was added. No Firebase refresh-token database was added.
