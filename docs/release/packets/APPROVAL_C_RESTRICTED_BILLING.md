# Approval C — Restricted billing acceptance

**Not authorization.** No product create, price change, `PLAY_BILLING_ENABLED`
flip, RTDN wiring change, or Play submission from this file. Client
purchase-entry stays `"0"` on production / preview / internal-grin until a
**new** binary is approved with flags frozen first.

Do not reuse stale “catalog empty” or “billing disabled” as current facts.

---

## Actual current state

### SOURCE (`5d5df3d`)

- Gate: `PLAY_BILLING_ENABLED === "true"` (`functions/src/billing/google/playConstants.ts`).
  Default off. Callables throw `failed-precondition` when unset.
- Exported asia-south1: `prepareAndroidBillingAccount`,
  `validateAndActivateAndroid`, `androidRtdn`,
  `scheduledBillingReconciliation`, `retryReconciliationWorkItem`, plus GST
  callables (also fail-closed / production-disabled in comments).
- Catalog in source (`functions/src/billing/products.ts`): Play products
  `vyd_starter` / `vyd_professional` / `vyd_business` with base plans
  monthly / quarterly / yearly. Expected paise are **test/marketing config
  only**; UI must show store-localized prices. Creating store products is
  **not** done by this file.
- RTDN: `androidRtdn` HTTP function in source; production fail-closed on the
  same enablement gate.
- Client: `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` `"0"` on all
  release EAS profiles in `eas.json`.

### LIVE_BACKEND (read-only, 2026-10-06)

Billing **names are deployed** and **ACTIVE** among 39 asia-south1 functions
(`prepareAndroidBillingAccount`, `validateAndActivateAndroid`, `androidRtdn`,
`scheduledBillingReconciliation`, `retryReconciliationWorkItem`, plus GST
and iOS siblings). Runtime SA is the shared default compute Editor.

**Enablement keys** (presence only; values never dumped):
`PLAY_BILLING_ENABLED`, `APPSTORE_BILLING_ENABLED`,
`BILLING_RECONCILIATION_ENABLED`, `PLAY_PACKAGE_NAME`,
`PLAY_RTDN_PUSH_SERVICE_ACCOUNT`, `BILLING_KMS_KEY_NAME` are **absent**
(`present: false`) on those handlers. Source therefore fail-closes
(`=== "true"`). Secret binding count **0**. `firebase functions:config:get`
`{}` does **not** prove flags false.

Also this session (read-only; no env values):

| Surface | Result |
|---|---|
| Pub/Sub topics in `vyaamikk-diary` | HTTP 200, **0 topics** — RTDN push not wired |
| Cloud Scheduler | `scheduledBillingReconciliation` job **exists**; tick returns immediately unless `BILLING_RECONCILIATION_ENABLED === "true"` |
| Secret Manager listed names | email secrets only; **`BILLING_DIAG_UID_SECRET` not listed** |
| Cloud KMS API | **403** unused/disabled |
| Play Android Publisher (`inappproducts`) | **403** insufficient scopes (Firebase token has no `androidpublisher`) |

Do **not** reuse 2026-09-20 “catalog empty.” Catalog remains **NOT RUN**.
Internal track membership is **not** a billing security boundary.

### PLAY catalog / prices / license testers

**NOT RUN** this session (no Play Console / eas / gcloud). Last Internal
track note 2026-10-01: vc22 Active. Product existence in Console is
**unknown** until owner inventory. Source catalog is not proof the Console
has those products.

Internal track membership is **not** a billing security boundary.

---

## Source trace

`purchaseEntryGate.ts` (`=== "1"`) → `iapSession.ts`
(`prepareAndroidBillingAccount`) → Play sheet → `iapPurchaseProcessor.ts` →
`validateAndActivateAndroid.ts` (`subscriptionsv2.get`) → server ack in
`androidSubscriptionAdapter.ts` → `deriveEntitlement.ts` /
`subscription/status` (Rules deny client writes) → quota
`atomicBillableCreate.ts` + Firestore Rules → RTDN `rtdn.ts` +
`scheduledBillingReconciliation.ts` / `retryReconciliationWorkItem`.

RTDN OIDC requires `PLAY_RTDN_PUSH_AUDIENCE` +
`PLAY_RTDN_PUSH_SERVICE_ACCOUNT`; both absent live →
`rtdn_oidc_config_missing` if the HTTPS endpoint were hit while billing
were enabled. GST invoice path is separate and production-disabled.

EAS remote production/preview env **name lists** do not include
purchase-entry flags; `eas config` profile env still `"0"` (profile wins
for `EXPO_PUBLIC_APP_MODE`). That does **not** change the existing vc22 AAB.

---

## Acceptance matrix (do not execute purchases now)

| Case | SOURCE | LIVE_STORE |
|---|---|---|
| Purchase success | unit/emulator present in `functions/src/billing/**` | NOT RUN |
| User cancellation | SOURCE tests exist in billing suite (verify on apply) | NOT RUN |
| Pending payment | SOURCE | NOT RUN |
| Lost response | SOURCE | NOT RUN |
| Duplicate callback / RTDN | SOURCE | NOT RUN |
| Restore / reinstall | SOURCE | NOT RUN |
| Account switch | SOURCE | NOT RUN |
| Renewal / expiry | SOURCE | NOT RUN |
| Refund / revocation | SOURCE | NOT RUN |
| Reconciliation recovery | SOURCE (`retryReconciliationWorkItem`) | NOT RUN |

A completed purchase callback is **not** complete billing acceptance.

---

## Restricted test plan (later activation)

1. Freeze binary flags **before** requesting a build (Approval B). Internal-GRIN
   AAB currently has purchase-entry **off**. A billing-on AAB is a **different**
   profile/SHA and needs its own B1/B2. Do not claim an existing AAB changed
   because source flags changed.
2. Owner-named Google accounts. Verify **license-test** status in Play Console
   before invoking purchases.
3. Global `PLAY_BILLING_ENABLED=true` on deployed functions would expose
   **every** caller of those endpoints, not only Internal testers. Hiding a
   button is not a control. If activation is required, implement and review a
   **tester restriction** (allow-list on uid / license-test account) **before**
   requesting enablement.
4. Identify residual: Editor runtime SA; **0 Pub/Sub topics**; KMS unused;
   RTDN OIDC keys absent. Hiding a button is not a control.
5. Disablement: set `PLAY_BILLING_ENABLED` back off; client flags `"0"` on the
   next binary. In-flight Play purchases are not cancelled by a Functions gate.

---

## Play listing (not submitted)

Worksheet: `PLAY_LISTING_DATA_SAFETY_REVIEWER.md` and
`PLAY_SUBMISSION_READINESS.md` (Team 4, this session).

- Reviewer: `+91 9000000000` / OTP `654321` only if live test-phone fixture
  verified. **No founder email OTP/password** in Play instructions. Do not
  check “full access including premium” while purchase-entry is `"0"`.
- Live `/privacy` and `/delete-account` HTTP **200**. Privacy **effective
  15 Jul 2026** vs in-app **27 Jul 2026** — reconcile before submission.
- Delete page is **mailto**, not a ticket. GRIN Storage is not in the
  deletion job; do not claim those files vanish with the account.
- Live privacy HTML loads `/~flock.js` while copy says no third-party
  analytics — **contradictory** until owner/website audit.
- Do not claim live GST/2B/EWB, ITC eligibility, bundled originals, encrypted
  backup, or unbounded GRIN storage.

---

**Owner approval requested later:** exact activation/configuration (env keys,
allow-list, named testers, whether a new AAB is required). Not now.
