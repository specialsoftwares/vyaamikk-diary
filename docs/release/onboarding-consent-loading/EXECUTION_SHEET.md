# Onboarding, consent, errors, and loading

Source branch: `fix/onboarding-consent-loading`.
Base: `5827ddb54faf777e900c563d16e8bb2df33dfc07` (`origin/main` on 1 Nov 2026). That commit is also the signed internal-grin artifact `722e4e4c-9d0a-402b-8099-4dc0e27b5de3`, versionName `1.0.0`, versionCode `32`. This branch does not change that artifact.
Code head verified by GitHub run `41299395405`: `7babf9c30a3b745a565012674009151b5257828f`.

Installed-device version was not read. Missing device evidence did not block the source fix.

Serving functions last confirmed for content sealing, and not redeployed here:

- `sealOwnerContent` revision `sealownercontent-00001-nol`
- `openOwnerContent` revision `openownercontent-00001-zuz`

`recordProcessingPurpose` was not re-read. `gcloud` token refresh failed in this session. This change does not edit that function.

Integration `7dd9155561d3267e10e17f533a398195c6f19d0d` and draft PR #42 were not merged, cherry-picked, or copied.

## 1. Onboarding and demographic age

Confirmed cause: after phone verification, the pending legal-consent patch went through `updateProfile`, which opened and sealed the profile. `sealOwnerContent` calls `assertBusinessAgeAdmitted`. An unassessed profile is rejected with `age_not_admitted`, and that token reached the screen. Launch also sent any profile that was not `ageEligibility === "eligible"` to `/(auth)/age-declaration`.

Correction: phone, then email, then profile details. Demographic age is an optional band on the profile step (`under_18`, `18_24`, `25_34`, `35_44`, `45_54`, `55_plus`, `prefer_not_to_say`). It is stored on the device only. It is not a date of birth, not written to `ageEligibility`, and not sent to crash reporting. `profileNeedsAgeGate` no longer redirects. A returning user with no band is not stopped at launch.

A patch that is only `legalConsents` merges those fields and does not call `openBusinessCloud` or `protectBusinessCloud`. Any other profile patch still seals. Pending consent stays until that write succeeds. Saves and acknowledgements are serialized, and an older acknowledgement cannot clear a newer choice. The write checks the current auth uid immediately before merging or sealing.

Regression: `npm run test:onboarding-consent-loading` calls `updateProfileWithIo` and `resolveSignedInOnboardingContinuation` with fakes. Local result recorded below.

### Eligibility conflict, left unchanged

`functions/src/identity/businessAdmission.ts` `assertBusinessAgeAdmitted` still throws `age_not_admitted` unless `ageEligibility === "eligible"`. `sealOwnerContent`, `openOwnerContent`, and GRIN admission still call it. `firestore.rules` `isActiveUser` still requires `ageEligibility == 'eligible'` for diary, credit, purchase orders, and the other owner subcollections. The user profile update rule does not. Consent can be saved without that flag. Creating sealed business records still cannot.

Proposed later resolution, not done in this change: decide whether business writes still need a separate 18+ admission. If they do, collect that admission explicitly and do not infer it from the demographic band. If they do not, remove the age check from `assertBusinessAgeAdmitted` and from `isActiveUser` while keeping owner, session, restore, and deletion checks. Do not mark a band as `eligible`.

No Functions or Rules deploy is required for the consent-only client path. A later eligibility change would be a separate deploy, with the previous `sealownercontent-00001-nol` and `openownercontent-00001-zuz` revisions as the rollback.

## 2. Crash-report consent

Confirmed cause: `purposeConsentQueue` treated a watcher that had not yet delivered a server snapshot as unhealthy, then deleted a pending Allow and left reporting off. Settings then showed Off.

Correction: the user's Allow stays pending across a missing snapshot, a failed listener, and an app restart for that same account. Reporting stays off until the choice is stored, the server acknowledges the grant, and native activation succeeds. Withdrawal disables collection immediately and beats an in-flight grant. A newer choice, revision conflict, account change, or session replacement drops the stale grant. Settings and the prompt read the same queue. The row can show Saving, Waiting to sync, Activation failed, or Unavailable. Off is an explicit withdrawal or no choice.

The installed Crashlytics client is disabled by default. Withdrawal calls `setCrashlyticsCollectionEnabled(false)`. That client has no API to delete unsent reports, so a report already queued on the device may still be sent. The settings sentence says that. It does not claim anonymity.

`recordProcessingPurpose` source was not changed. The defect was the client queue. No function deploy is required for this fix.

## 3. Public errors and diagnostics

Confirmed cause: `userFacingMessage` could show `error.message`, including `age_not_admitted`. `createSafeDiagnosticError` replaced every stack with one synthetic frame.

Correction: recognised network, OTP, session, and `age_not_admitted` failures use fixed catalogue sentences. Unknown failures use "Something went wrong. Please try again." Identifier-only messages such as `session_changed` are not shown. Diagnostic errors keep a classified code, an allow-listed context, a correlation id, and sanitised `src/` or `app/` frames. `node_modules`, emails, tokens, and raw messages are dropped.

## 4. Loading

Confirmed cause: `SkeletonLoadingPanel` removed the skeleton after about 6.5 seconds and left only the slow message. `app/(app)/(tabs)/you.tsx` ignored `useDiaryList`'s loading flag.

Correction: a slow initial load keeps the skeleton and adds the message. Refresh keeps rows. Account changes drop the previous account's rows where those screens were updated.

### Skeleton coverage

Updated:

- Dashboard `you.tsx`
- Diary work team and material movement
- Customer credit list
- Purchase order list
- Professional pack history
- Business insights dashboard, parties, customers, cash paid, category, and financial-year recap

Already using a skeleton, left as they were: diary index, search, settings tab, calendar, at-a-glance, drafts, statutory information.

Genuine exceptions: GRIN lists are synchronous local reads with no loading flag. Forms and record-detail screens keep their own submission or detail state. Letterhead history still uses its existing loader and was outside this pass.

## Verification

Focused suite: `npm run test:onboarding-consent-loading` passed on 1 Nov 2026.
It calls `updateProfileWithIo`, `applyConsentPatchAfterPhoneVerify`, `createPurposeConsentQueue`, `presentCrashConsent`, `applyDiagnosticsChoice`, `publicMessage`, `userFacingMessage`, `createSafeDiagnosticError`, and `skeletonPanelMode`.

Local canonical CI, same day, worktree `/Users/shivamsaurav/vyaamikk-onboarding-fix`, before this result paragraph was added:

- Command: `npm run ci:verify`
- Exit code: 0
- Exact line: `ci:verify PASS`
- Elapsed: 633419 ms, ended `2026-11-01T10:51:32.711Z`
- Node: v20.19.4
- The invoice-renderer Docker step printed `docker not available locally; GitHub Actions CI will run the renderer image build`. Every earlier local stage passed, including `test:all`.

GitHub Actions on head `7babf9c30a3b745a565012674009151b5257828f`:

- Run: https://github.com/specialsoftwares/vyaamikk-diary/actions/runs/41299395405
- Run id: `41299395405`
- Job: `124827005967` (`verify`)
- Conclusion: success
- Exact line: `ci:verify PASS` at `2026-11-01T11:15:57.6709079Z`
- Renderer runtime: `v22.19.0`

The commit that records this paragraph is docs-only. Its pull-request check is separate from run `41299395405`.

## Deployment, build, and device acceptance

These are separate from the source checks above.

- Deployment: none in this change. Do not deploy Functions or Rules for this branch. Keys, retention, deletion schedules, billing access, and GRIN admission flags were not changed.
- Native build: required after this branch is merged, from that merged commit. The versionCode 32 artifact of `5827ddb` does not contain these fixes. This task does not start a build and does not upload to Play.
- Device acceptance, for a signed build of the eventual merged main commit, not yet run:
  1. Fresh phone and email onboarding does not show an age gate.
  2. Profile demographic entry is optional, including Prefer not to say. A returning user with no band is not gated.
  3. Crash consent in Settings matches the choice immediately: Saving, Waiting to sync, On only after activation, or an honest failure.
  4. After consent, a redacted test report is received. After withdrawal, new reporting is off. A report already queued may still arrive.
  5. Slow network, offline, retry, and cached data match the loading states above.
  6. Public screens do not show `age_not_admitted` or other backend codes.

Sealed business saves by a user who has never been marked `ageEligibility: eligible` are still expected to fail until the eligibility conflict above is resolved. That is not a device pass for diary creation.
