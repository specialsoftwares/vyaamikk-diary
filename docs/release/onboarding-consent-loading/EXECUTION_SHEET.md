# PR #45 corrective execution sheet

## Source and scope

Branch: `fix/onboarding-consent-loading`, correcting reviewed head
`092527efba87b6abdd029cbf8eba0fcaaa58b81e`. The corrective commit containing
this sheet is the candidate; identify it with `git rev-parse HEAD` before
publication. PR #45 remains draft until its actual remote head is verified.
Main base: `5827ddb54faf777e900c563d16e8bb2df33dfc07`.
Integration `7dd9155561d3267e10e17f533a398195c6f19d0d` and PR #42 were not
merged, cherry-picked, or copied. No other worktree was reset or overwritten.

This correction resolves the age authorization mismatch as requested: age is
optional demographic input, not business admission. It does not declare legal
compliance, infer an adult status, or change historical age fields. The age band
remains device-only; company demographic analytics are not implemented here.

## Corrections and regression evidence

### Consent acknowledgement

A numeric counter could repeat after clearing/restarting storage, allowing an
older acknowledgement to remove a newer choice. Each saved choice now has a
persisted cryptographically random operation identity. Acknowledgement compares
that identity, phone owner, and exact payload inside the same serialized queue
as saves and clears. Legacy envelopes receive an identity inside that queue.
Session ownership is checked again inside acknowledgement, not only before it.

`pendingConsentAcknowledgement.test.ts` failed before the correction (`true !==
false`) and passes afterward. It exercises the production persistence functions
with injected storage, including clear/save/late acknowledgement, identical
payload replacement, account replacement, legacy upgrade, and session loss
during the acknowledgement read. A failed profile write retains the choice.

### Session ownership and publication

Profile writes capture the initiating UID, auth generation, and sign-in epoch.
A positive live UID match is required after asynchronous preparation and
immediately before the Firestore write. Native uses native Auth only; a stale JS
Auth user cannot replace a missing native UID. Web uses JS Auth. Platform read
failure denies the write. A same-UID sign-in replaces the epoch without retiring
a shared bridge.

The same ownership accompanies session persistence, state publication, phone
continuation, authenticated retry, email completion, and reactivation. Delayed
continuations must not navigate, acknowledge consent, or clear a replacement
challenge. Session persistence continues to use the local-key readiness gate;
transient key failures preserve retained sessions and encrypted rows.

`profileWriteOwnership.regression.test.ts` reproduced a same-UID replacement
calling the old production writer (missing expected rejection). The corrected
writer rejects without issuing a write. It also exercises the shared production
session-publication helper through bridge, key-preparation, and persistence
replacement, plus successful publication and native identity-loss behavior.
A write already submitted to Firestore cannot be recalled by a later local
session change; subsequent local publication is denied.

### Crash consent and the locked SDK

The locked `@react-native-firebase/crashlytics` version is **24.1.0**. Its installed
`lib/namespaced.ts`, `lib/types/crashlytics.ts`, and Android
`ReactNativeFirebaseCrashlyticsModule.java` expose `deleteUnsentReports`.
The previous statement that this SDK cannot delete unsent reports was wrong.

The JS reporting gate stays closed until the current native enable request
succeeds. Failed or superseded activation cannot record errors. Native requests
are ordered; withdrawal closes the JS gate immediately and requests native
disable immediately, then repeats disable in order after earlier activation.

Startup, reconciliation, and uncertain server snapshots **pause collection and
retain previously consented cached reports**. Explicit withdrawal or account
retirement requests `deleteUnsentReports` after disabling collection. Failed
cleanup blocks later enable until cleanup is retried. The result records
`deletion_requested`, not proof that native deletion finished. This SDK operation
cannot recall reports already transmitted or reliably cancel an in-flight
upload. No `sendUnsentReports` call is introduced. Native-device validation is
still required; injected clients do not execute Android Crashlytics.

`crashActivation.contract.test.ts` reproduced reporting during pending activation
before the fix (`1 !== 0`). It now covers rejected activation, withdrawal during
activation, cleanup failure/retry, and missing SDK. Its production queue/adapter
regression also reproduced deletion during ordinary startup (`0 !== 1`);
startup/listener uncertainty now retain reports, while explicit withdrawal and
account retirement request deletion. Related queue, preference, error-boundary,
and diagnostic privacy tests pass.

### Onboarding, profile completion, and first business save

Phone OTP → email OTP → profile details remains the onboarding order. No standalone
age gate or demographic-based eligibility assignment is introduced. Consent-only
profile patches merge legal consent without opening or sealing the profile.
Sensitive profile patches still seal.

`assertBusinessAccountActive` replaces age admission in seal/open and the shared
seven-GRIN-callable wrapper. Firestore and Storage Rules, including activated
rule templates, remove only the age predicate. Missing users, inactive accounts,
owner mismatch, session admission, restore fencing, and deletion protections
remain enforced. Existing legacy active-status interpretation is preserved.

Before correction, the original admission guard replayed through the extracted
production seal handler rejected an active unassessed user's profile with
`age_not_admitted`. `ownerContent.admission.test.ts` now invokes the same helpers
as the deployed callables with real AES-GCM sealing/opening and injected auth/DB
ports. Profile completion and first diary content work for missing, unassessed,
historical ineligible, and eligible age values. Wrong owner/path, tamper, missing
key, session rejection, restore rejection, and inactive/missing accounts deny.

Full Firestore and Storage Rules emulator suites passed with new unassessed-user
allows and preserved security denials. The production diary adapter and Storage
SDK tests passed with an unassessed profile. Suites require isolated emulators:
combining them in one run initially carried a closed restore fence into the next
suite; isolated runs passed. Functions TypeScript build passed.

### Public errors and loading retained

Public failures use fixed catalogue messages; internal codes and backend stacks
are not displayed. Diagnostics retain classified, sanitized context only.
The prior skeleton correction remains: initial loading retains skeletons and a
slow message; refresh retains existing rows. This pass does not expand loader
coverage beyond the routes documented in the original PR.

## Verification and publication status

Historical GitHub runs `41299395405` (7babf9c) and `41301167007` (092527e)
succeeded, but **do not certify this corrective commit**. The earlier stopped
local run was superseded by the historical passing run; neither certifies this
correction.

Local correction verification on 1 Nov 2026:

- Root `tsc --noEmit`: pass. Functions `npm --prefix functions run build`: pass.
- ESLint on changed client TypeScript files: zero errors (14 warnings).
- Complete `test:onboarding-consent-loading`, `test:auth-session-security`, and
  `test:main-android-readiness` scripts: pass with the direct loader.
- Firestore Rules, Storage Rules, production diary adapter, and Storage SDK
  emulator suites: pass in separate emulator sessions.
- Independent review rechecked crash pause/deletion, reactivation publication,
  continuation ownership, and serialized conditional challenge cleanup; no
  remaining blocking finding was reported in those inspected paths.
- An exploratory host-adapted aggregate initially passed 163/180 suites. It
  exposed a stale session-security source contract after handler extraction;
  the contract now follows and negatively tests actual admission delegation,
  and the security suite passes. Ten other suites passed on recheck using the
  current tsx loader (4.23.15) and disabling Node 24's global navigator to match
  the Node 20 fake-DOM test environment. The six remaining aggregate failures
  require missing local `.env`, Chrome, nested tsx CLI IPC, or CLI environment
  setup. This is not a canonical aggregate pass.
- `ownedPhoneContinuation.regression.test.ts` additionally fails on the original
  production wrapper (`undefined !== 'new'`) and passes with queued conditional
  cleanup. It covers delayed marker/acknowledgement/cleanup/import and retained
  same-UID epoch ownership. It is included in the focused canonical script.

The canonical gate must still pass on the published corrective SHA. The host
runs Node 24.22.1. Its sandbox blocks the Unix IPC socket created by the `tsx` CLI
(`listen EPERM /tmp/tsx-0/*.pipe`). `npm run ci:verify` was attempted and cannot
be reported as passing. Direct `node --import .../tsx/dist/loader.mjs` execution
runs the same test modules without that CLI socket; it is explicitly host-adapted
verification, not canonical CI. No repository gate is bypassed or weakened.

The connected GitHub app rejected a Git object write with HTTP 403,
`Resource not accessible by integration`. No corrective branch push or new
GitHub CI run is claimed. Main and the published PR remain unchanged unless a
later authorized publisher records a successful update. A local commit/patch
is the handoff; GitHub Actions must run on the actual corrective head.

## Deployment and build requirements

This is **no longer a client-only correction**. Before end-to-end acceptance,
deploy from the accepted corrected source:

- `sealOwnerContent`, `openOwnerContent`, using the existing content-key version.
- The seven GRIN callables using the changed shared active-account guard:
  `grinRegisterGoodsReceipt`, `grinReconcileCommand`, `grinMutateGoodsReceipt`,
  `grinReadGoodsReceipt`, `grinReserveEvidence`, `grinBeginEvidenceUpload`,
  `grinUploadEvidence`.
- Firestore and Storage Rules from that same accepted source. Preserve the
  appropriate activated/nonactivated configuration; do not toggle admission flags.

Re-read serving revisions, secret bindings, and Rules releases before deployment.
Previously recorded seal/open revisions `sealownercontent-00001-nol` and
`openownercontent-00001-zuz` are historical, not verified rollback targets.
No deletion Functions, retention constants, keys, billing allowlist, Rules flags,
or live data migration/purge are part of this correction. No deployment occurred
in this workspace. `recordProcessingPurpose` was not changed or live-verified.

The user authorized a build if checks pass and continues to require a **main-only
build**. After the corrected PR is accepted into main and the actual main commit
passes canonical CI, build that clean main commit with `internal-grin`. Verify
an unused versionCode against Play, the upload certificate, and the packaged
Firebase identity first. VersionCode 32's existing artifact
`722e4e4c-9d0a-402b-8099-4dc0e27b5de3` contains none of these corrections.
No signed build or upload is claimed. An app build does not deploy backend fixes.
Public rollout remains on hold.

## Signed-device acceptance (pending)

1. Fresh phone/email verification, optional age band/Prefer not to say, profile
   completion, first diary save/open/relaunch, and first attachment upload/open.
2. Missing demographic band and historical age values never create an age gate.
3. Account switch, sign-out, and same-UID replacement during each async stage
   cannot publish an old session, navigate, or clear a newer challenge/consent.
4. Crash Allow: pending until server acknowledgement and native activation;
   restart/reconnect retains previously consented reports. Withdrawal stops new
   reporting and requests cached-report deletion; no remote-recall claim.
5. Controlled redacted report receipt only with acknowledged consent. No OTP,
   token, phone, email, record content, or raw error message in telemetry.
6. Offline/slow/retry/cached loading states and safe public errors on signed build.
7. Owner isolation, restore closure, pending/completed deletion, and revoked
   session remain denied against the named deployed revisions and Rules release.
