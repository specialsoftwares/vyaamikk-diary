# Approval packet 1 — first internal core-flow milestone

**Not self-approved. Core QA has not passed. This is a request packet, not a green light. Do not build or upload in this assignment.**

## Combined app

- Branch: `release/public-android-combined`
- Combination merge: `a3317148d6e24bc980bbe5637b65ecac84e45b0d` (#22+#24+#25)
- Implementation (VYD-38/39, App Check source, Rules compat): `5d148f355a82a6bfae8b176d101ebce0b9877d16`
- Previously reviewed docs head: `f875356efb4030d24fd60c5b80f1470b13d782a5` (Actions `35454180029` / job `105926441702` SUCCESS — **this packet’s core SHA is later**)
- **Exact core-app application commit for this packet:** `b5cfbf7050e1e75d30acf274e82ca90259f02950` (App Check probes off the startup path + subscription operation isolation + typecheck). Recheck `git rev-parse HEAD` on the branch before any later approved build if a later SHA follows.
- Paid-backend follow-up `24595dbd4ff6fe3c9c0031926e93ddeafae83954` is **not** required to review this internal-core source milestone.

## Requested binary (Play-installed production AAB)

- EAS profile: **`production`**
- `eas.json` `build.production.android.buildType`: **app-bundle**
- `EXPO_PUBLIC_APP_MODE=production`
- Android package: `com.specialsoftwares.vyaamikkdiary`
- Track: **Internal testing only**. No production track. No listing publish.
- Proposed versionCode: **19** (unused at 2026-09-19 Play inspection). Recheck a complete Play inventory before build/upload. 19 is not reserved for later binaries.

A sideload APK (`preview` / `development` APK profiles) is a **separately labelled later option**. It does not substitute for this Play-installed AAB milestone.

## Purchase-entry gates (all closed for this core milestone)

- `PLAY_BILLING_ENABLED` unset/false
- `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` off
- `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` off (Settings / management purchase entry)
- `UPDATE_BILLING_DETAILS_ENABLED` fail-closed
- `BILLING_RECONCILIATION_ENABLED` / `BILLING_RECONCILIATION_OPERATOR_ENABLED` fail-closed
- Purchases remain unavailable — expected

## Core-app corrections in this packet (source)

- Startup awaits bounded native App Check **provider initialize** only. Optional `getToken(false)` is detached; boot does not `getToken(true)`. Late diagnostics cannot replace a newer attempt. Production debug tokens remain forbidden. JS App Check is still uninitialized. No enforcement.
- Subscription management uses separate load/save/restore/manage identities. Live auth UID must match the captured session UID. The screen publishes `maskManagementSnapshot` against live session, not a retired runtime snapshot. One IAP controller is preserved.

Local `test:all` **139/139** in 250.4s on the later paid follow-up tree; focused App Check barrier + subscription-plan-static + runtime tests PASS on the core SHA. Fresh Actions are still required on HEAD.

## Rules (deploy-before-build for a working Save)

- Baseline Firestore sha256 `d8ee0abcd5a8f217f1fbe60af9651e5b4253b07cac72d0746c4e781a48052aa2`
- Proposed compat sha256 `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c`
- Emulator: `LIVE_RULES_COMPAT` including production `saveComposerEntry` / `saveLetterheadCreateWithPdf` / other family save callers (see `docs/release/rules-compat/LIVE_RULES_COMPAT.md`)
- Before any deploy: re-export live Rules and diff against `docs/release/rules-compat/baseline/`
- Do **not** deploy canonical repo `firestore.rules` (quota/usage writes) for this internal billing-off build
- Storage: no change

## Signing evidence (dated 2026-09-19, recheck before upload)

Upload and Play App Signing SHA-1/SHA-256 matched Firebase Android hashes. Recheck Play copy controls before upload.

## Backend for internal billing-off

- Billing Functions may remain undeployed
- After Rules compat deploy, ordinary Save should acquire locks and CREATE with enforcement off / missing usage

## Rollback / recovery

- **Distribution:** stopping or removing the Internal Testing artifact does **not** uninstall binaries already on tester devices. Plan recovery of installed testers and, if needed, a corrective AAB with a **higher unused versionCode**.
- **Rules:** redeploy hashed live baseline. A Rules rollback can reintroduce save failures for the new binary; preserve local recovery data on device. Do not claim “unpublish” removes installed copies.
- Do not promote the internal artifact.

## Installed-device plan (after a later approved Play AAB)

Startup, real phone OTP (not Expo Go), JS auth bridge, onboarding, offline/revocation, deletion, ordinary records, free letterhead/PDF/share, process death, same-ID retry, press cancellation, splash, font scale/TalkBack. Do not claim device coverage from web captures. Do not write production customer records.
