# Phone OTP resend and pending-deletion reactivation

Branch `fix/phone-otp-reactivation` from main `e49dd2e2808d4ad99aa1d3d7ee77c73870dcf73e`.
Integration and draft PR #42 were not changed. No live account, test-number
configuration, deploy, or Play upload was changed.

## Confirmed findings

### Live account, read-only

The reported number is an existing Firebase Auth user. It is not disabled, its
only provider is phone, and it is not one of the five Firebase fictional test
numbers. Phone sign-in is enabled. SMS regions are allowlisted to `IN`.

The profile status is `pending_deletion`. Email status is verified. The phone
index matches the Auth user. Deletion was requested `2026-10-15T10:08:53Z`.
`deletionScheduledFor` and the deletion job `graceExpiresAt` are both
`2026-11-29T10:08:53Z`, a 45-day stored window. `deletionPolicyVersion`,
`reactivationCutoff`, and `erasureDeadline` are absent, so this row stays on
the legacy deadline. The deletion job is generation 1, status `awaiting_grace`,
with no lease and every phase `pending`. `retiredUeid` is false.

The last Auth login is `2026-10-25T22:16:02Z`. One second later the profile
recorded `reactivationPhoneVerifiedAt`, and about five seconds later
`reactivationRequestedAt`. That is a completed phone verification on that date,
not proof about a later attempt.

### SMS delivery is not established

No timestamped native diagnostic from the reported attempt was available.
Cloud Logging returned no Identity Toolkit or phone-verification entries for
1 Nov 2026. An OTP screen can be a restored challenge and does not prove a
new SMS request. The resend mismatch below can make a retry inside the
Android verification window ineffective. It is not evidence that the first
SMS was suppressed by the deletion state.

Missing evidence: one redacted log of a single owner-operated attempt showing
whether the client restored a challenge, called Firebase, received
`onCodeSent` or instant verification, or got a Firebase error. Do not repeat
SMS requests to collect it.

### Source

On main, OTP completion routes `account_pending_deletion` to the reactivation
screen. `handleRetryAccountSetup` displayed that error instead. Both paths now
use `routeAccountSetupFailure`. A stale attempt returns `stale` and does not
navigate.

The login sender called Android `signInWithPhoneNumber` without `forceResend`.
RNFirebase Auth 24.1.0 uses a 60-second verification window and attaches the
force-resending token only when `forceResend` is true. The screen offered
resend after 30 seconds. Explicit resend now plans `forceResend: true` after
the cooldown. A restored challenge still does not send. A fresh send still
does not force resend.

Stored `reactivationCutoff`, when present, closes reactivation even if a later
`deletionScheduledFor` or `graceExpiresAt` remains. A missing cutoff keeps the
legacy 45-day deadline. Purge leasing was not retimed.

### Installed binary and serving backend

VersionCode 33 was built from `b4126e4` and was not uploaded. The last Play
internal release read in this workspace was versionCode 32. The handset's
installed versionCode was not read from the device. Packaged Firebase identity
for the versionCode 33 build was project `vyaamikk-diary`, package
`com.specialsoftwares.vyaamikkdiary`.

Serving functions, re-read 1 Nov 2026, are still the 21 Sep 2026 nodejs20
revisions:

| Function | Revision |
| --- | --- |
| resolveOrCreateUserByPhone | resolveorcreateuserbyphone-00009-ket |
| startAccountReactivation | startaccountreactivation-00006-kec |
| completeAccountReactivation | completeaccountreactivation-00007-tik |

Current main has later source for these handlers. This PR does not deploy them.

## Regression evidence

`reactivationRouting.test.ts` routes pending deletion for both initial
completion and authenticated retry, and returns `stale` when the attempt is
no longer current. `phoneVerificationPlan.test.ts` covers restore without
send, fresh send without force, early cooldown, eligible forced resend, and
throttled `auth/too-many-requests` as the public "Too many attempts" message.
`reactivationOtp.unit.test.ts` covers successful reactivation, wrong, expired,
and superseded codes, a leased purge, an expired stored cutoff with a later
schedule, a legacy 45-day deadline, and no active status after failed recovery.

Host tests do not prove SMS delivery or device acceptance.

## Canonical CI

Not yet recorded for this head. GitHub Actions must print `ci:verify PASS` on
the published head before merge.

## Deployment and build

Do not merge from this sheet. After review:

- Deploy `resolveOrCreateUserByPhone`, `startAccountReactivation`, and
  `completeAccountReactivation` from the accepted main SHA only if that SHA
  contains this correction. Re-read revisions after deploy. Do not deploy
  deletion functions, change retention, or rotate keys.
- A client resend fix reaches a device only in a new internal-grin build from
  that main SHA. Do not reuse versionCode 32 or 33. Do not upload until a
  separate publication decision.
- Device acceptance remains open: one signed-in attempt on the reported
  account, then the reactivation email path. Do not activate the account by
  hand.
