# Phone OTP resend and pending-deletion reactivation

## Controlled internal release

PR #48 was still `1bf8fd0` with required check `verify` passing. The only
later commit on that branch is `901693c`, the production-path compatibility
test. Its canonical run `41342322400`, job `124954770949`, printed
`ci:verify PASS` at `2026-11-01T19:55:17Z`. PR #48 merged as
`d98bffbefdb62e1aa28698cf53fd1ca48f3057e5`. Main CI run `41344226139`, job
`124960487632`, printed `ci:verify PASS` at `2026-11-01T20:19:30Z`.

Play and EAS were re-read before the version bump. Internal testing was still
`1.0.0 (33)`, the bundle list still started at 33, and EAS Android builds
still topped out at 33. versionCode 34 was unused. PR #49 changed only
`app.json` and the isolation-contract check. Its run `41344289923`, job
`124960682019`, printed `ci:verify PASS` at `2026-11-01T20:20:19Z`. The merge
is `a3db411cc7bad477f82322a31c310376dec68149`. Main CI run `41346365017`, job
`124966921395`, printed `ci:verify PASS` at `2026-11-01T20:39:54Z`.

Integration remains `7dd9155` on `integration`. Draft PR #42 was not changed.
The reported account, its deletion job, keys, billing access, Rules, and
other functions were not changed. The bundle was not uploaded to Play.

### Source tests

`reactivationOtp.unit.test.ts` runs the serving resolver's deletion decision
from `e6f09b6` (`resolveorcreateuserbyphone-00009-ket`) and then the new
reactivation handlers. A stored legacy deadline is returned unchanged and is
not rewritten. The resolver write sets `reactivationPhoneVerifiedAt` to the
request time. The new start and complete calls succeed for that authenticated
UID inside the phone-proof window and before the stored deadline. A different
UID is rejected. A profile without that fresh proof is rejected. A phone
token with no revocation cutoff is admitted; a cutoff at the same auth time
is not. The client routes the resolver's `deletion_pending` response to
reactivation with the stored date.

When `deletionScheduledFor` is absent, the serving resolver's response
fallback is 15 days and the new handler's fallback is the existing 45-day
grace. The resolver does not write that 15-day value. That difference does
not change a stored deadline, so the resolver was not added to the deploy.

Host tests do not prove SMS delivery.

### Deployment verification

Immediately before deploy, both functions were still the 21 Sep 2026
nodejs20 revisions at 100% traffic: `startaccountreactivation-00006-kec` and
`completeaccountreactivation-00007-tik`, 256Mi, CPU 0.1666, concurrency 1,
max instances 3, no email secrets. The resolver was
`resolveorcreateuserbyphone-00009-ket`.

Both functions were updated together from `a3db411`. Both updates succeeded.
Re-read after deploy:

| Function | Serving revision | Traffic | Runtime | Secrets |
| --- | --- | --- | --- | --- |
| startAccountReactivation | startaccountreactivation-00007-vih | 100% latest | nodejs22 | HMAC v1, provider key v4, from-address v2 |
| completeAccountReactivation | completeaccountreactivation-00008-doh | 100% latest | nodejs22 | HMAC v1, provider key v4, from-address v2 |
| resolveOrCreateUserByPhone | resolveorcreateuserbyphone-00009-ket | 100% latest | nodejs20 | none |

Memory 256Mi, CPU 0.1666, concurrency 1, and max instances 3 are unchanged.
No new secret versions were created. Rollback is the two September revision
names above. The deploy also attached the existing plain environment keys
`BILLING_RECONCILIATION_ENABLED` (still false), `GRIN_GOODS_EVIDENCE_FUNCTIONS`
(still true), `PLAY_RTDN_PUSH_AUDIENCE`, and `PLAY_RTDN_PUSH_SERVICE_ACCOUNT`
because the CLI loads that dotenv while resolving other functions' parameters.
Those keys do not change reactivation behavior.

### Artifact verification

EAS build `d9db5252-b1b9-401c-9dd5-776f079efc69` finished from
`a3db411cc7bad477f82322a31c310376dec68149`, profile `internal-grin`,
SDK 54.0.0, version 1.0.0 / versionCode 34. Artifact
`https://expo.dev/artifacts/eas/y1MOedxy8mIbObeZtxOEGbMtp6zSEL-fstqOIengu28.aab`,
79,768,195 bytes, SHA-256
`a93a81cd46030489eea319e3fdb989c972788d616aef4d139b6f6c608c94906e`.
Local copy `/tmp/vyaamikk-a3db411-vc34.aab`.

The manifest package is `com.specialsoftwares.vyaamikkdiary`, versionName
1.0.0, versionCode 34. The upload certificate SHA-256 is
`E6:88:FA:0B:A5:FA:3B:D3:05:85:11:4F:8C:21:43:E1:EF:DD:A1:AC:BF:DB:9D:AA:DC:42:DA:89:61:78:75:2A`
and SHA-1 is
`20:F8:15:0E:21:3C:9C:3F:84:FD:CA:C5:1E:9E:4D:CC:EE:A2:42:AD`.
The packaged resources contain Firebase project `vyaamikk-diary` and the
existing Android app id. This binary was not uploaded.

### Signed-device acceptance

Not done. One attempt each, on this binary, without changing the live
deletion job and without repeating SMS sends:

- Fresh login: one SMS, code accepted, the first send is not forced.
- Resend only after the cooldown, once.
- Pending deletion: OTP completion and account-setup retry both open
  reactivation. A wrong, expired, or superseded email code leaves the
  account `pending_deletion`.
- Sign out or switch account during entry does not open reactivation for
  the retired attempt.
- An active account continues to its existing next step.

The original missing SMS is still unresolved. During the owner's next normal
login, capture whether the screen was restored before a send, whether
`forceResend` was false or true, whether the result was `onCodeSent`, instant
verification, or a Firebase error code, and whether the handset received one
SMS. Redact the number, the code, tokens, and the UID.

## Investigation record

The notes below are the review that preceded this release. They are not the
deployment or artifact evidence above.

## VersionCode 33

Owner-confirmed upload, not an agent upload. The owner downloaded the existing
internal-grin artifact and uploaded it to Play internal testing. It was not
rebuilt.

| Item | Value |
| --- | --- |
| EAS build | `ca29e47e-3b72-4f71-8c15-07d97cfda2f8` |
| Source | `b4126e421ea026248302d074d41401762b456950` |
| Version | 1.0.0 / versionCode 33 |
| Profile | `internal-grin` |

Play re-read on 2 Nov 2026: internal testing is Active. Latest release is
`1.0.0 (33) – Onboarding and Reliability Fixes`, available to internal testers,
one version code, released 1 Nov 2026 21:32. Release history shows 32 replaced
at that time, then 31 down through 23. Production is Inactive and has no
release. Latest releases lists only that internal release. The bundle list
starts at versionCode 33, uploaded 1 Nov 2026 16:00, status Active, then 32,
31, 30, and 29. EAS Android builds top out at versionCode 33. No versionCode
34 was found.

This binary predates PR #48 and contains none of its corrections.

The affected handset's installed versionCode was not read. `adb devices`
showed no attached device. Play availability is not an installed-version
reading. Install base on the active bundle is at most 100 and does not
identify the handset.

## Review result

The three corrections on `ec80c33` and `186fa09` hold for the paths they
cover. This review found two production-path holes and fixed them in
`dd1f1b04427526d38ee76bc56e42ae17d25cbad3`. No deletion constant was changed
and no account-specific bypass was added.

### Pending-deletion routing

Initial OTP completion and the authenticated retry both call
`routeAccountSetupFailure`. A non-current attempt returns `stale` and does
not navigate or publish a profile. The retry path already captured ownership
before the callable and returned when that ownership was gone.

The initial path did not. `confirmOtp` advances the session epoch, then the
identity call can throw `account_pending_deletion` before the success-path
epoch check. A sign-out or same-UID replacement during that call left the
pending-deletion error intact, and the screen treated it as current.
`confirmFailureForOwnedEpoch` now replaces that error with `session_changed`
when the epoch moved. The screen already returns on that message without
navigating.

### Explicit resend

`planPhoneVerification` still returns no send for a restored challenge and
`forceResend: false` for a fresh send. An explicit resend at or after the
stored cooldown still returns `forceResend: true`, which is the only path
that passes true into `signInWithPhoneNumber`. The locked Android SDK uses a
60-second window; the app cooldown stays 30 seconds.

Two holes: a missing `resendAvailableAt` was treated as already elapsed, so a
restored screen without a stored deadline could force a send immediately; and
the resend handler retired the current challenge before knowing the plan, so
a cooldown cleared the verification id without sending. A missing deadline
now stays on cooldown for the existing 30-second interval. The stored digit
snapshot's deadline is restored when its verification id and phone match the
saved challenge. The handler plans first and starts a send only when the plan
is an eligible force resend. In-flight duplicate sends, throttling mapped to
the public "Too many attempts" sentence, and stale generation checks after
the await are unchanged.

### Reactivation cutoff

`reactivationWindowDeadline` uses a stored cutoff when it is earlier than the
scheduled deletion date, and the scheduled date or the existing 45-day grace
when no cutoff is stored. `automaticRestorationAllowed` uses that earlier
deadline. `canAcquireLease` still uses `graceExpiresAt`. Legacy rows without a
cutoff, including the reported account, keep the stored 45-day date. No new
deadline was created.

## Original SMS incident

Still unresolved. Re-read on 2 Nov 2026: Cloud Logging returned no Identity
Toolkit or phone-verification entries from 1 Nov 2026 through this review.
No device log was available. The earlier account read still stands: a real
phone user, SMS allowed to India, account not disabled, phone index matches,
profile `pending_deletion`, legacy deadline `2026-11-29T10:08:53Z`, deletion
job generation 1 `awaiting_grace` with no lease and every phase pending.
Those facts do not show whether the reported attempt restored a challenge,
sent a fresh request, completed instant verification, hit a verification
error or throttle, had a resend swallowed by the 60-second window, or
reported a send the handset never received. An OTP screen, a verification id,
or `onCodeSent` is not handset delivery. No additional SMS was requested.

The next evidence has to come from one normal login the owner performs.
Capture only:

- whether the OTP screen appeared from a saved challenge before any new send
- whether the client called phone verification, and whether `forceResend` was false or true
- `onCodeSent`, instant verification, or the Firebase error code
- whether the handset received an SMS

Redact the phone number, the code, tokens, and the UID before sharing the
log. Do not repeat the attempt to manufacture a log.

## Serving backend

Re-read 2 Nov 2026. All three are ACTIVE, nodejs20, 256Mi, CPU 0.1666,
concurrency 1, max instances 3. Updated `2026-09-21T09:08:1xZ`.

| Function | Serving revision | Email secrets on this revision |
| --- | --- | --- |
| resolveOrCreateUserByPhone | resolveorcreateuserbyphone-00009-ket | none |
| startAccountReactivation | startaccountreactivation-00006-kec | none |
| completeAccountReactivation | completeaccountreactivation-00007-tik | none |

Rollback is those three revision names. Secret Manager already has
`EMAIL_OTP_HMAC_SECRET` version 1 enabled, `EMAIL_FROM_ADDRESS` version 2
enabled (version 1 disabled), and `EMAIL_PROVIDER_API_KEY` versions 1 through
4 enabled. None of those are bound to the serving reactivation revisions.
The September `resolveOrCreateUserByPhone` source used a 15-day local grace
constant. Current source uses the shared 45-day constant and
`assertAdmittedCallableUser`. PR #48 does not change that function. The
reported account's stored deadline is already the 45-day date, so the serving
function did not create that row's window.

Current `startAccountReactivation` and `completeAccountReactivation` declare
`EMAIL_OTP_RUNTIME_SECRETS` and call `reactivationWindowDeadline`. That
deadline change is not serving until those two functions are deployed from
the accepted main SHA. A deploy from that SHA also moves their runtime to
nodejs22 because `functions/package.json` engines is `"22"`, and it binds the
three existing email secrets. Do not deploy `resolveOrCreateUserByPhone` in
that step. Its admission and grace-constant delta is separate from this PR
and would change the function versionCode 33 already calls. Do not deploy
deletion functions, change retention, rotate keys, or edit the live deletion
job.

Installed versionCode 33 remains compatible with the September functions
because those functions are what it already calls. The client corrections
need a later binary. They do not require the serving functions to change
before that binary can route pending deletion. The earlier cutoff is enforced
only after the two reactivation functions are deployed.

## Regression evidence

Local, before `dd1f1b0`:

- `phoneVerificationPlan.test.ts` ok. Restore does not send. Fresh send is
  not forced. A missing deadline is cooldown, not a send. An early explicit
  resend is cooldown. An eligible explicit resend is `forceResend: true`.
  Hydration loads the digit snapshot and does not call `startOtp`. The resend
  handler plans before `beginPhoneOtpSend`. Throttled `auth/too-many-requests`
  stays the public "Too many attempts" sentence.
- `profileWriteOwnership.regression.test.ts` ok. A pending-deletion error at a
  moved epoch becomes `session_changed`. The same error at the owned epoch is
  unchanged. `confirmOtp` calls the helper. Sign-out, account switch, and
  same-UID replacement still publish nothing.
- `reactivationRouting.test.ts` ok. Initial completion and authenticated
  retry both route a current pending-deletion account to reactivation. A
  non-current attempt is `stale`.
- `reactivationOtp.unit.test.ts` ok. Covers an earlier cutoff against a later
  scheduled date, a legacy deadline with no cutoff, expired and leased purge
  windows, and wrong, expired, and superseded email codes.
- `deletionGraceCopy.unit.test.ts` ok. The 45-day copy and the existing
  grace constant are unchanged.
- `tsc --noEmit` exited 0.

Host tests do not prove SMS delivery.

## Canonical CI

GitHub Actions run `41338192480` on `dd1f1b04427526d38ee76bc56e42ae17d25cbad3`
succeeded. Job `124942400112` printed `ci:verify PASS` at
`2026-11-01T19:07:46.2307292Z`. The previous head `db61a83` remains green on
run `41330942279` (`ci:verify PASS` at `2026-11-01T17:43:20.0048094Z`) and
does not include this review's two fixes. This paragraph is the only change
after the passing run.

## Release proposal

Executed by the controlled release at the top of this sheet. The steps below
are the proposal as it stood before that release:

1. Merge PR #48 through the normal pull-request path. Do not squash these
   commits onto another branch by hand.
2. Wait for canonical CI on the merge commit.
3. Re-read Play internal testing, the bundle list, and EAS Android builds.
   versionCode 33 is used. The next unused code on this reading is 34. If
   either system shows 34 or higher, use the next unused code instead.
4. Open a version-only pull request that changes `app.json` versionCode and
   the isolation-contract versionCode check. Run canonical CI, then merge.
5. From a clean checkout of that merged SHA, build only:
   `npx --yes eas-cli@16.28.0 build --platform android --profile internal-grin --non-interactive --wait`
   Do not reuse versionCode 32 or 33. Do not upload in that step.
6. Deploy only `startAccountReactivation` and `completeAccountReactivation`
   from the merged correction SHA, region `asia-south1`, preserving 256Mi,
   CPU 0.1666, concurrency 1, and max instances 3. Expect nodejs22 and new
   bindings for `EMAIL_OTP_HMAC_SECRET`, `EMAIL_PROVIDER_API_KEY`, and
   `EMAIL_FROM_ADDRESS`. Re-read the revisions. Rollback is
   `startaccountreactivation-00006-kec` and
   `completeaccountreactivation-00007-tik`. Leave
   `resolveOrCreateUserByPhone` on `resolveorcreateuserbyphone-00009-ket`.

Device acceptance on the new binary, one attempt each, without changing the
live deletion job:

- Fresh login for a new or active account: one SMS, code accepted, no forced
  resend on the first send.
- Resend: the button waits out the cooldown, then one explicit resend uses
  force resend. A restored OTP screen does not send by itself.
- Pending deletion inside the stored window: OTP completion and the
  account-setup retry both open reactivation. The email code path still
  rejects a wrong, expired, or superseded code. The account stays
  `pending_deletion` until a successful code.
- Sign out or switch account during the code entry: the screen does not open
  reactivation for the retired attempt.
- Normal login of an active account still reaches the existing next step.

The original missing SMS stays unresolved until the redacted capture above
exists. Do not activate the reported account by hand.
