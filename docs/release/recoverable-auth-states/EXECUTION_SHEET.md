# Recoverable authentication and truthful UI states

This sheet records the integration correction. It is not a release approval.

## Baseline

| Line | SHA | Role |
| --- | --- | --- |
| integration, draft PR #42 | `7dd9155561d3267e10e17f533a398195c6f19d0d` | Base. Left untouched on its own branch. |
| main | `695833453b9524b34d4ecc857ebdfa58c0bc04b8` | Comparison only. Not merged. |
| PR #51 | `66f276546c90e8b22ca9417be552523e12ffc60a` | Saved-challenge resume. Still draft. |
| PR #52 | `2361f6c1605772ded7af1a9b129b0a4234b5c2f0` | Reactivation email verification. Still draft. |
| PR #53 code | `057086f60bac7507434cc6eb84430de4d1d3e0fb` | Phone-auth attempt controller. |
| PR #53 tip | `86c16972c4adb4ffede2b18ac15fd50dc7e69ab9` | Same controller plus its CI note. |

Merge-base of main and integration: `ba317f5b17b73164f5c9768d783cf52128339511`.

Reviewed main fixes selected for behavior, not wholesale replacement:

- `ef9c77f` consent ownership, crash activation, and age-independent onboarding authorization.
- `7babf9c` separate onboarding, crash-consent, and loading states, plus the public-error catalogue.
- `1c1a014` keep a newer challenge and retry crash-report cleanup after restart.
- `dd1f1b0` a replaced session and a missing resend deadline must not send or navigate.

Integration behavior that must survive:

- `a0b9eea` generation-bound GRIN sealing.
- `4910c00` and `8524b70` attempt-specific seal cleanup and retry.
- `d3059a8` and `815db79` session publication ownership.
- `2a93524` older consent acknowledgement cannot delete a newer choice.

No deploy, signed build, Play upload, or merge to main is part of this change. The missing-SMS incident stays open.

## Onboarding review

[Onboarding](5bbbb255-515b-457f-8075-43c371c29a6f) removed `ageEligibility == 'eligible'` from the active-user helpers in the four rules files. Owner, active status, restore, and deletion checks remain. The demographic band stays on the device and is not written as eligibility. Unit tests named by that agent passed. Rules were not deployed.

Coordinator follow-up: the old `/(auth)/age-declaration` route still mounted the date-of-birth screen and could call `recordAgeAssessment`. That route now continues to profile details, or to sign-in when no account is present. The callable remains deployed and unchanged until a separate functions release; it is no longer on the new-user path.

## Authentication review

[Phone auth](43647aa7-93d4-4243-9fbe-a10591f0d600) owns each send, confirmation, restore, resend, reactivation, and session publication. Verifying starts only after accept. The visible bounds remain 45 seconds overall, 20 seconds for native send, confirmation, account resolution, and session preparation, and 3 seconds for cleanup. Session ownership helpers from integration are still present. The reported tests passed.

Coordinator follow-up: a 16-hex attempt id, phone-auth stage, and reactivation stage now pass the diagnostic allowlist. Phone numbers, verification ids, codes, and non-hex attempt ids stay dropped.

## Screen states

[Screen states](0b8a8f70-2c4c-4431-b9e8-cb9abb06c5eb) wired the shared catalogue and the ten patterns on the diary, search, credit, records, calendar, insights, drafts, and form screens that already had those states. `presentPublicError` does not return a raw exception, a stack, or a `functions/` identifier. Session copy does not state a duration. Dashboard, professional packs, GRIN, and settings were not wired. GRIN sealing was not edited.

## Crash consent

[Crash consent](073f8aa9-9711-4d85-bab4-60643aadbfec) uses one account-scoped model: choice, pending sync, acknowledgement, and native state. The locked Crashlytics SDK is 24.1.0 and exports `deleteUnsentReports`. Withdrawal requests deletion of unsent reports only. Settings says reports already uploaded are not deleted. Reporting is active only after the choice is saved, the acknowledgement matches, and native activation succeeds. The reported consent tests passed.

Coordinator follow-up: the combined tree typecheck is clean. A stale grant acknowledgement cannot be compared as if it were an unset choice. The local Firebase auth stub now includes the SDK's optional resend flag. Reactivation route params are passed as a plain object.

## CI on the reviewed head

A workflow dispatch on `d9a5b8f1179bee9798ce52cdd15b58b4fb41e902` completed in 20m20s: https://github.com/specialsoftwares/vyaamikk-diary/actions/runs/42707638255. That run is not verification of the corrections in this sheet. It was not an automatic pull request check into integration, and it does not include the native-lock, consent, screen-ownership, or age-lifecycle corrections.

## Acceptance of this correction

| Gate | What it proves | Status in this change |
| --- | --- | --- |
| Source corrections | Auth recovery, crash consent, screen ownership, age lifecycle, and the delivery configuration are in the commit that contains this section. | Recorded by that commit. Host regressions are not handset delivery. |
| Exact-head CI | The automatic pull request check into integration, and the canonical CI job, on that same commit. | Not the dispatch above. Record the run id and head SHA when GitHub starts the check. A missing check is a gap, not a pass. |
| Serving Functions and Rules | The deployed functions runtime and the live ruleset. | Not changed. Node 22 is a source engine pin only. No rules or functions deploy. |
| Signed artifact | An internal build with a freshly checked unused versionCode. | Not built. Do not reuse versionCode 32 or build from `d9a5b8f`. |
| Device acceptance | A signed binary on a handset, including SMS delivery and reactivation. | Not run. The missing-SMS incident stays open. |

## Native lock that never settles

`signInWithPhoneNumber` on Android calls `verifyPhoneNumber` only when `getCurrentActivity()` is non-null. A null activity leaves the JavaScript promise pending forever. The visible 45s and 20s deadlines stop the busy UI and leave Change number and Back usable. They do not cancel that native call.

The send and confirm slot lives in `PhoneAuthActivity`, which reads `ReactApplicationContext.currentActivity` and returns `missing` or `present:` plus that Activity's identity hash. Module presence is not a signal. While the same Activity is current, the slot stays `held` and a second `verifyPhoneNumber` is refused. The slot becomes `recovered` only when that Activity is gone or replaced, because the unfinished callback can no longer be delivered there. The next send is then the first native call on the new Activity. Clearing the JavaScript busy flag while the same Activity is still current does not start another native authentication.

Installed binaries do not contain this module until a later signed build. This sheet does not approve that build.

## Ownership

- Authentication: phone attempt controller, restoration, resend, reactivation, session publication.
- Onboarding: optional demographic age band, admission without an age grant, rules conjunct only.
- Privacy: crash-consent choice, pending sync, acknowledgement, and native state.
- UI: public-error catalogue and real screen states.
- Coordinator: integration review, locale merge, CI, and this sheet.
