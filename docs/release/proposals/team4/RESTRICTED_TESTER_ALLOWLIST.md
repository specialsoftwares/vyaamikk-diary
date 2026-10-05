# Restricted tester allowlist (SOURCE) — not enablement

**Not authorization.** No `PLAY_BILLING_ENABLED` flip, no tester UID invention,
no Play product create, no purchase.

## Why Internal track / hidden button is not enough

`PLAY_BILLING_ENABLED === "true"` on deployed `prepareAndroidBillingAccount`
and `validateAndActivateAndroid` would accept **every authenticated caller**,
not only Internal testers. Client
`EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` and Internal-track
membership do not bind the callable.

## Restriction (owner-named Firebase Auth UIDs)

Env: `PLAY_BILLING_TESTER_UIDS` — comma-separated Firebase Auth UIDs.

- Empty or absent → **deny all** (fail-closed) even if billing is enabled.
- Exact UID match only. Do not put emails here; do not invent UIDs.
- Used **only after** `PLAY_BILLING_ENABLED === "true"`.

Owner later supplies named accounts (Firebase UID ↔ Play license-test Google
account). This file does not list any.

## Implemented in this tree (still fail-closed)

`functions/src/billing/google/playConstants.ts`
`assertPlayBillingTesterAllowed` on prepare + validate callables.
Tests: `npm run test:billing-play-constants`.

Does **not** enable billing. Does **not** deploy. Does **not** seed UIDs.

## Residuals (not covered by this gate)

- `androidRtdn` and reconciliation: still only `PLAY_BILLING_ENABLED`. Live
  Pub/Sub topics were **0** (2026-10-06). If RTDN is later wired, a
  non-allowlisted purchase could still be processed until that path is gated.
- iOS callables: not in this Play restriction.
- Client purchase-entry `"0"` on ordinary Internal GRIN (`eas.json`). A
  billing-test binary is a **separate later profile/SHA** (Team 3).

## Activation (later owner approval — not now)

1. Freeze a billing-test AAB with purchase-entry `"1"` (not the GRIN Internal
   binary).
2. Owner names license testers in Play Console **and** corresponding Firebase
   UIDs in `PLAY_BILLING_TESTER_UIDS`.
3. Only then consider `PLAY_BILLING_ENABLED=true` on those Functions.
4. Disablement: unset enablement; next binary keeps purchase-entry `"0"`.
   In-flight Play purchases are not cancelled by a Functions gate.
