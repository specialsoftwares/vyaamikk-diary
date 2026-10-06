# Restricted billing — executable acceptance plan

**Not authorization.** No `PLAY_BILLING_ENABLED` flip, product create, price
change, purchase, RTDN wiring, Play Save, website publish, or submission.
Public purchases stay **off** until a **separate** Approval E / public packet.
**GRIN readiness is not billing readiness.**

**Coordinator supersession:** Combined application is
`fcda7cd64e9622e50c38223a7156f0f6b8ca5576`. Historical T4 drafts that named
`56f2040` / `c45518a` are superseded for identity only. Client purchase-entry
stays `"0"`.

Packet: `docs/release/packets/APPROVAL_C_RESTRICTED_BILLING.md`.

---

## How to run SOURCE now

From this worktree:

```bash
bash tools/billing-acceptance/run-restricted-billing-source.sh
```

That script:

1. Refuses if `PLAY_BILLING_ENABLED=true` in the shell.
2. Asserts `eas.json` preview / production / `internal-grin` keep
   `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` and
   `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` at `"0"`.
3. Runs the SOURCE suites below.
4. Does **not** call Play, Pub/Sub, or Android Publisher.

---

## SOURCE matrix (executable)

| Case | SOURCE command / file | What it proves | LIVE_STORE |
|---|---|---|---|
| Purchase success | `npm run test:billing-google-play` (`androidPlay.unit.test.ts` ACTIVE + catalog mapping); `npm run test:billing-google-play-emulator` (optional; needs Firestore emulator) | Token → owner fence → entitlement write; not a store purchase | **NOT RUN** |
| Pending payment | `androidPlay.unit.test.ts` `SUBSCRIPTION_STATE_PENDING`; `src/billing/iap/iapPendingPurchase.test.ts`; `iapPurchaseProcessor.test.ts` | Pending does not grant; client pending envelope | **NOT RUN** |
| User cancellation | `androidPlay.unit.test.ts` `SUBSCRIPTION_STATE_CANCELED` / `PENDING_PURCHASE_CANCELED`; `iapPurchaseProcessor.test.ts` cancellation | Cancelled while period remains entitled; pending-cancel skip | **NOT RUN** |
| Restore / reinstall | `src/billing/iap/iapPurchaseProcessor.test.ts` (`source: "restore"`); `src/billing/iap/iapSession.test.ts` `restorePurchases` | Restore validates; does not revoke; uid/generation fence | **NOT RUN** |
| Duplicate delivery | `androidPlay.unit.test.ts` duplicate callable/RTDN (`already_processed`, one ledger row) | Idempotent delivery | **NOT RUN** (Pub/Sub **NOT RUN** this session) |
| Account switch | `src/billing/iap/iapSession.test.ts` `setAuth` `uid-a` → `uid-b`; `androidPlay.unit.test.ts` `play_account_owner_mismatch` | Client session fence + server owner mismatch | **NOT RUN** |
| Refund / revocation | `androidPlay.unit.test.ts` `processAndroidVoidedPurchase` (refund vs chargeback) | Full refund/void updates entitlement; allowlist does **not** block revoke | **NOT RUN** |
| Reconciliation | `npm run test:billing-reconciliation-queue` | Queue/consumer/maintenance; production tick still fail-closed unless `BILLING_RECONCILIATION_ENABLED === "true"` | **NOT RUN** |
| Tester restriction | `npm run test:billing-play-constants`; restricted-grant block in `androidPlay.unit.test.ts` | `PLAY_BILLING_ENABLED` fail-closed; empty `PLAY_BILLING_TESTER_UIDS` denies all; JSON/CSV parse; RTDN grant denied; hidden buttons are not this control | **NOT RUN** (no UID seed) |

A completed purchase **callback** is not complete billing acceptance.

---

## Official Play test facilities (later — do not execute now)

Use **only** Google’s documented test facilities after a separate activation
approval and after owner-named license testers exist in Play Console **and**
matching Firebase Auth UIDs in `PLAY_BILLING_TESTER_UIDS` (private; never
commit):

1. [Play Billing test / license testers](https://developer.android.com/google/play/billing/test)
2. Play Console **Internal testing** track (distribution only — **not** a
   backend allowlist)
3. [Play Billing Lab](https://developer.android.com/google/play/billing/test) where applicable

Internal-track membership and hiding the purchase button are **not**
authorization. Server `PLAY_BILLING_ENABLED === "true"` plus a **non-empty**
tester UID allowlist must exist **before** requesting activation.

---

## REAL-CHARGE RISK tests (named — do not run)

These LIVE_STORE cases can take **real money** if executed with a Google
account that is **not** a Play license tester, or with a real instrument
outside license testing. **Do not run them in this continue.**

| ID | Test | Why it can charge |
|---|---|---|
| **REAL-CHARGE-01** `LIVE_STORE.purchase_success_non_license_tester` | Complete an in-app subscription purchase while the Google account is **not** on Play Console License testing | Play bills the account’s real instrument for a priced SKU |
| **REAL-CHARGE-02** `LIVE_STORE.purchase_success_production_or_public_track` | Purchase from Production / public store listing (or any track without license-test coverage) | Same; Internal track does **not** by itself make purchases free |
| **REAL-CHARGE-03** `LIVE_STORE.renewal_after_license_tester_removed` | Leave a subscription on auto-renew after the account is removed from license testers | Subsequent renewals can become real charges |
| **REAL-CHARGE-04** `LIVE_STORE.base_plan_upgrade_non_license_tester` | Change base plan / resubscribe on a non-license-tester account | Play can charge the price difference / new period |
| **REAL-CHARGE-05** `LIVE_STORE.prepaid_or_real_instrument_outside_lab` | Use a real card / UPI / Play balance instead of license-test or Billing Lab | Direct real charge |

**Not** real-charge by themselves (still LIVE_STORE **NOT RUN** here):

- License-tester purchase under Play’s test facility (still requires Console
  setup; **not** proof until executed)
- Restore of an already-owned entitlement (`LIVE_STORE.restore`) — restore
  does not create a new Play order; **do not** use a real-charged purchase
  just to exercise restore
- Duplicate RTDN delivery of an already-processed token
- Account switch that only fails closed on uid mismatch

---

## Catalog / RTDN / permissions (this continue)

| Surface | Result |
|---|---|
| Play subscriptions / prices / base plans / license testers | **NOT RUN**. Exact blocker: no Play Console session; `gcloud` **absent**; Python `googleapiclient` **absent**. Firebase CLI can list the `vyaamikk-diary` project — **do not** use a Firebase access token as Android Publisher (prior Publisher call **403**). Do **not** claim the catalog is empty. |
| RTDN Pub/Sub topics | **NOT RUN** this continue (`gcloud` absent). Do not reuse an older “0 topics” count as a fresh inspect. |
| Cloud Functions billing handler env **values** | **NOT RUN** (values never dumped). Prior key-**presence** note: enablement keys were **absent** 2026-10-06 — **not re-dumped** this continue. |
| Play Console IAM / androidpublisher scope | **NOT RUN** |

---

## Disablement (later)

Unset `PLAY_BILLING_ENABLED`. Next billed binary keeps purchase-entry `"0"`
unless a **separate** billing-test profile is frozen. In-flight Play
purchases are not cancelled by a Functions gate.
