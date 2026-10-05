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
(`=== "true"`). Secret binding count **0**. This replaces the stale
“catalog empty / billing disabled” guess with **key-absence** on live
handlers. It is **not** Play Console catalog proof.

Play products/prices/license testers: **NOT RUN** (no Play Console).
Internal track membership is **not** a billing security boundary.

### PLAY catalog / prices / license testers

**NOT RUN** this session (no Play Console / eas / gcloud). Last Internal
track note 2026-10-01: vc22 Active. Product existence in Console is
**unknown** until owner inventory. Source catalog is not proof the Console
has those products.

Internal track membership is **not** a billing security boundary.

---

## Source trace

prepare (`prepareAndroidBillingAccount` → obfuscated Play account) →
store transaction (Play Billing Library / `expo-iap`, client flag off) →
server `validateAndActivateAndroid` → acknowledgement inside that path →
entitlement/quota (`deriveEntitlement`, Option C quota) →
RTDN `androidRtdn` + `scheduledBillingReconciliation` /
`retryReconciliationWorkItem`.

GST invoice path is separate (`getInvoiceDownloadUrl`, etc.) and
production-disabled.

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
4. Identify residual: Editor runtime SA; RTDN URL unauthenticated-by-default
   unless pubsub OIDC is verified live (**NOT RUN**).
5. Disablement: set `PLAY_BILLING_ENABLED` back off; client flags `"0"` on the
   next binary. In-flight Play purchases are not cancelled by a Functions gate.

---

## Play listing (not submitted)

Worksheet: `PLAY_LISTING_DATA_SAFETY_REVIEWER.md`.

- Reviewer: `+91 9000000000` / OTP `654321` only if live test-phone fixture
  verified. **No founder email OTP/password** in Play instructions.
- Do not claim live GST/2B/EWB, ITC eligibility, bundled originals, encrypted
  backup, or unbounded GRIN storage.
- Data safety: until retention is implemented, do **not** claim GRIN files
  delete with the account.
- Listing assets/screenshots/audience: **NOT RUN** vs live Console this
  session — treat `docs/release/play-listing/DRAFTS.md` as draft.

---

**Owner approval requested later:** exact activation/configuration (env keys,
allow-list, named testers, whether a new AAB is required). Not now.
