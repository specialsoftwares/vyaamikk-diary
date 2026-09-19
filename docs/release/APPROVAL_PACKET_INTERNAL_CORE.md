# Approval packet 1 — first internal core-flow milestone

**Not self-approved. Core QA has not passed. This is a request packet, not a green light.**

## Combined app

- Branch: `release/public-android-combined`
- Combination merge: `a3317148d6e24bc980bbe5637b65ecac84e45b0d` (#22+#24+#25)
- Subsequent source on this branch: VYD-38/39, App Check source, Rules compat artifacts (see git log after `a331714`)

## Rules (deploy-before-build for a working Save)

- Baseline Firestore sha256 `d8ee0abcd5a8f217f1fbe60af9651e5b4253b07cac72d0746c4e781a48052aa2`
- Proposed compat sha256 `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c`
- Emulator: `LIVE_RULES_COMPAT` PASS (2026-09-19)
- Before any deploy: re-export live Rules and diff against `docs/release/rules-compat/baseline/`
- Do **not** deploy canonical repo `firestore.rules` (quota/usage writes) for this internal billing-off build
- Storage: no change

## Environment

- Firebase project `vyaamikk-diary`
- Android package `com.specialsoftwares.vyaamikkdiary`
- Profile: EAS `preview` or `development` internal APK — **build not authorized in this assignment**
- Proposed versionCode: **19** (unused at 2026-09-19 Play inspection). Not reserved for later AABs.

## Signing evidence (dated 2026-09-19, recheck before upload)

Upload and Play App Signing SHA-1/SHA-256 matched Firebase Android hashes. Recheck Play copy controls before upload.

## Track

Internal testing track. No production track. No listing publish.

## Backend for internal billing-off

- Billing Functions may remain undeployed
- `PLAY_BILLING_ENABLED` stays unset/false
- `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` stays off
- After Rules compat deploy, ordinary Save should acquire locks and CREATE with enforcement off / missing usage
- Purchases will remain unavailable — expected

## Rollback / recovery

- Rules: redeploy hashed live baseline
- Binary: unpublish internal artifact; do not promote

## Installed-device plan (after a later approved build)

Startup, real phone OTP (not Expo Go), JS auth bridge, onboarding, offline/revocation, deletion, ordinary records, free letterhead/PDF/share, process death, same-ID retry, press cancellation, splash, font scale/TalkBack. Do not claim device coverage from web captures. Do not write production customer records.
