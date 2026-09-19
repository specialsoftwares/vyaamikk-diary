# Approval packet 1 — first internal core-flow milestone

**Not self-approved. Core QA has not passed. This is a request packet, not a green light. Do not build or upload in this assignment.**

## Combined app

- Branch: `release/public-android-combined`
- Combination merge: `a3317148d6e24bc980bbe5637b65ecac84e45b0d` (#22+#24+#25)
- Implementation (VYD-38/39, App Check source, Rules compat): `5d148f355a82a6bfae8b176d101ebce0b9877d16`
- Previously reviewed docs head: `6c46a7067269eed679d9079efcf2bb30d43a588f`
- **Exact application commit for this packet:** recorded on this file immediately after the continuation commit (distinct from the docs-only reviewed head above). Recheck `git rev-parse HEAD` on the branch before any later approved build.

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
