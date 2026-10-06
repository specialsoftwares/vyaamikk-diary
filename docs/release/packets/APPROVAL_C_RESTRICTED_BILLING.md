# Approval C — Restricted billing acceptance

**Not authorization.** No product create, price change, `PLAY_BILLING_ENABLED`
flip, RTDN wiring change, or Play submission from this file. Client
purchase-entry stays `"0"` on production / preview / internal-grin until a
**new** binary is approved with flags frozen first.

Do not reuse stale “catalog empty” or “billing disabled” as current facts.

---

## Actual current state

### SOURCE (application `520f9f9`; this Team 4 tree documents that freeze — no AAB)

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
  release EAS profiles in `eas.json`. Coordinate with Team 3: freeze `"0"`
  for the ordinary Internal GRIN binary. A billing-test binary would be a
  **separate later profile/SHA**.
- Restricted testers: Internal-track membership and hiding the purchase
  button are **not** backend restrictions. This tree adds a fail-closed
  `PLAY_BILLING_TESTER_UIDS` UID allowlist **behind** `PLAY_BILLING_ENABLED`
  on prepare/validate only (`playConstants.ts`). Empty/absent list denies
  all callers. **Does not enable billing. Does not invent tester UIDs.**
  Proposal: `docs/release/proposals/team4/RESTRICTED_TESTER_ALLOWLIST.md`.

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

**NOT RUN** this Team 4 continue. Exact blocker: no Play Console session in
this worktree; `gcloud` not on PATH; Python `googleapiclient` not installed;
**Firebase access tokens must not be used as Play Android Publisher** (prior
Publisher `inappproducts` call was **403**). Catalog, prices, base plans, and
license-tester lists stay **unknown**. Combined HEAD `aea65c1`. Canonical CI
`37425360211` on `0d7aa17`. Application SHA `520f9f9`.

Do **not** reuse 2026-09-20 “catalog empty.” Last Internal track note
2026-10-01: vc22 Active — **STALE** vs a fresh Console read. Source catalog
is not proof the Console has those products. Internal track membership is
**not** a billing security boundary.

---

## Source trace

Confirmed files (client → Functions):

1. `src/billing/iap/purchaseEntryGate.ts` (`EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED === "1"`)
2. `src/billing/iap/iapSession.ts` (`prepareAndroidBillingAccount`)
3. `src/billing/iap/iapPurchaseProcessor.ts` (`validateAndActivateAndroid`)
4. `functions/src/billing/callables/validateAndActivateAndroid.ts` (enablement + tester allowlist, then handler)
5. `functions/src/billing/google/androidSubscriptionAdapter.ts` (`subscriptionsv2.get` + ack)
6. `functions/src/billing/deriveEntitlement.ts` → `users/{uid}/subscription/status` (Rules deny client writes)
7. `src/billing/optionC/atomicBillableCreate.ts` + Firestore Rules quota (`quotaEnforcementEnabled === true` only)
8. `functions/src/billing/google/rtdn.ts` + `functions/src/billing/callables/androidRtdn.ts`
   and `scheduledBillingReconciliation.ts` / `retryReconciliationWorkItem`

Backend prepare: `functions/src/billing/callables/prepareAndroidBillingAccount.ts`.
Client transport: `src/billing/iap/iapBackend.ts`.

RTDN OIDC requires `PLAY_RTDN_PUSH_AUDIENCE` +
`PLAY_RTDN_PUSH_SERVICE_ACCOUNT`; both absent live →
`rtdn_oidc_config_missing` if the HTTPS endpoint were hit while billing
were enabled. GST invoice path is separate and production-disabled.

EAS profile env still `"0"` for purchase-entry / quota-upsell. That does
**not** change the existing vc22 AAB. No AAB of `520f9f9` was built (prior `5d5df3d` pin is STALE).

---

## Acceptance matrix (do not execute purchases now)

All **LIVE_STORE** rows are **NOT RUN**. No catalog, no license tester
purchase, no RTDN delivery.

| Case | SOURCE | LIVE_STORE |
|---|---|---|
| Purchase success | unit/emulator in `functions/src/billing/**`; client IAP session/processor tests | NOT RUN |
| User cancellation | SOURCE tests in billing suite | NOT RUN |
| Pending payment | SOURCE | NOT RUN |
| Duplicate callback / RTDN | SOURCE (`rtdn.ts`, google Play unit/emulator) | NOT RUN (0 Pub/Sub topics) |
| Lost response | SOURCE (pending purchase + processor recovery) | NOT RUN |
| Restore / reinstall | SOURCE (processor `restore` path; server validate) | NOT RUN |
| Account switch | SOURCE (session generation + uid fence) | NOT RUN |
| Renewal / expiry | SOURCE (`deriveEntitlement`, adapter lifecycle) | NOT RUN |
| Refund / revocation | SOURCE (voided purchase / refund adapter tests) | NOT RUN |
| Reconciliation | SOURCE (`retryReconciliationWorkItem`, scheduler) | NOT RUN (reconciliation env key absent) |
| Quota / entitlement | SOURCE (`deriveEntitlement`, `atomicBillableCreate`, Rules `quotaEnforcementEnabled`) | NOT RUN |

A completed purchase callback is **not** complete billing acceptance.

---

## Restricted test plan (later activation)

1. Freeze binary flags **before** requesting a build (Approval B). Ordinary
   Internal-GRIN AAB keeps purchase-entry **`"0"`** (Team 3). A billing-test
   AAB is a **different** profile/SHA. Do not claim an existing AAB changed
   because source flags changed. No `520f9f9` binary exists.
2. Owner-named Google accounts **and** matching Firebase Auth UIDs. Verify
   **license-test** status in Play Console before invoking purchases. Do not
   invent emails/UIDs here.
3. Global `PLAY_BILLING_ENABLED=true` would otherwise expose **every** caller.
   This tree’s `PLAY_BILLING_TESTER_UIDS` gate is fail-closed (empty = deny
   all) on prepare/validate only. It is **not** enablement and is **not**
   deployed. RTDN/reconciliation remain ungated by UID (residual; Pub/Sub 0).
4. Residual: Editor runtime SA; **0 Pub/Sub topics**; KMS unused; RTDN OIDC
   keys absent. Hiding a button is not a control.
5. Disablement: set `PLAY_BILLING_ENABLED` back off; client flags `"0"` on the
   next binary. In-flight Play purchases are not cancelled by a Functions gate.

---

## Play listing (not submitted)

Worksheet: `PLAY_LISTING_DATA_SAFETY_REVIEWER.md` and
`PLAY_SUBMISSION_READINESS.md` (Team 4, this session).

- Reviewer: `+91 9000000000` / OTP `654321` only if live test-phone fixture
  verified. Owner pre-completes **email + profile**. **No founder email
  OTP/password** in Play instructions. Full-access checkbox follows **actual
  reachable functionality**, not purchase-entry flags alone — **do not check**
  on the intended Internal binary.
- Live `/privacy` and `/delete-account` HTTP **200**. Privacy **effective
  15 Jul 2026** vs in-app **27 Jul 2026** — do not backdate `legal.ts`.
- Delete page is **mailto** (Play-allowed). Do not invent a form. GRIN Storage
  is not in the deletion job.
- `/~flock.js` is a Tinybird library on first-party origin;
  `data-proxy-url="/~api/analytics"`; POST `/~api/analytics` **202**. App does
  not load flock.js. Server-side Tinybird forward **UNKNOWN**.
- Do not claim live GST/2B/EWB, live 14-day trial, ITC, bundled originals,
  encrypted backup, or unbounded GRIN storage.
- Play 512 icon / feature graphic **are git-tracked** in this candidate
  (hashes in `PLAY_SUBMISSION_READINESS.md`). Dashboard screenshots
  `safeForPublic: false` (demo names).

---

**Owner approval requested later:** exact activation/configuration (env keys,
allow-list, named testers, whether a new AAB is required). Not now.
