# Paid-launch scope (REL-12) — VYD-38 / VYD-39

Status: assessment only. VYD-38 and VYD-39 remain Jira **Backlog**. This document does not authorize implementation, Jira activation, backend billing enablement, or store release.

Audited source: `origin/main` `79d405d0b626d5067a33541887ac3c70689b8724` with IAP/host stacking on PR #22 `8adcd7b604257d00b43635e70d90e4e97e5bcd57`.

Jira: [VYD-38](https://specialsoftwaresindia.atlassian.net/browse/VYD-38), [VYD-39](https://specialsoftwaresindia.atlassian.net/browse/VYD-39). Ticket text mentioning renewal/revocation is not evidence those paths are complete in production.

Keep **source defaults** separate from **verified deployed state**.

## Three gates

| Gate | Billing / quota | Store | Missing VYD-38/39 items |
| --- | --- | --- | --- |
| Billing-off internal core-flow testing | Flags stay off; live billing functions are not deployed | No purchase | Manage/cancel and reporting screens are **not** prerequisites for this gate |
| Specifically authorized internal store testing | Only after explicit approval of flags, track, and testers | License-tester purchase/restore | Store policy still applies to that test binary |
| Paid public launch | Deployed billing handlers + fail-closed flags turned on under separate approval | Public/paid track | Manage/cancel access, reconciliation consumer, and charging correctness stay required |

Missing public-launch features must remain visible here without being silently converted into prerequisites for every billing-off internal test. Store requirements are not waived by owner preference.

## Product contracts that stay closed

- Letterhead remains free for every account/pack for 12 UTC months from trusted `users/{uid}.createdAt`, then included until an approved successor (`src/services/letterhead/letterheadAccessPolicy.ts`). Parent + genuine mirrors consume zero ordinary quota. No automatic anniversary charge.
- Client must not write entitlements. `src/subscription/*` is read-only (`parseSubscriptionStatus`, `SubscriptionProvider`). Static contract: `src/subscription/subscriptionPlan.static.test.ts` forbids subscription-domain IAP, paywall, and Firestore writes.
- IAP uses the existing session/controller (`src/billing/iap/iapSession.ts`, `src/billing/quotaUpsell/quotaUpsellController.ts`). No second purchase controller. Production upsell stays off unless `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED === "1"` (`src/billing/quotaUpsell/quotaUpsellGate.ts` on #22; not set in `eas.json` profiles).
- Backend billing **source** stays fail-closed: `PLAY_BILLING_ENABLED === "true"` / `APPSTORE_BILLING_ENABLED === "true"` (`functions/src/billing/google/playConstants.ts`, `functions/src/billing/apple/appleConstants.ts`).
- **Live (REL-10):** those billing/GST functions are exported in `functions/src/index.ts` and are **not** in `firebase functions:list`. Identity/email/deletion/security **are** deployed. Live Play/App Store billing flags cannot be observed on a deployed billing handler. Deployed identity environment variables do not include `PLAY_BILLING_*` / `APPSTORE_BILLING_*`. Do not treat source fail-closed comments as proof of a live env var value.

Quota matrix (intended behaviour, not permission to change flags): see `INTERNAL_CANDIDATE_RUNBOOK.md`. Live Firestore Rules do not include `quotaEnforcementOn`. Continuation 3 emulator against the exported live ruleset shows ordinary CREATE is still **denied**: the `#22` client `tx.get`s `users/{uid}/subscription/status`, a path with no live match (missing and seeded enforcement-false are both unreadable). That is not a monthly-quota rejection. Letterhead parent/mirror CREATE is compatible. Per-user `quotaEnforcementEnabled` documents were not read.

## Requirement map

### 1. User-visible manage / cancel access — **paid-launch critical for a paid public binary; not an internal billing-off prerequisite**

[Google Play subscription management and cancellation](https://support.google.com/googleplay/android-developer/answer/9900533?hl=en) requires that subscribers can manage or cancel from inside the app (or an equivalent in-app path to Play’s management surface).

| Need | Current code | Gap |
| --- | --- | --- |
| Dedicated subscription management / reporting screen | No `SubscriptionManagementScreen`. The name is only a **forbidden** regex in `subscriptionPlan.static.test.ts`. `docs/BILLING_VYD38_BILLING_DETAILS_UX.md` defers Billing Details UX to that screen. | Reporting/GSTR screens are **not** required to satisfy Play’s cancellation-access rule. |
| Store manage/cancel deep link | No `play.google.com/store/account/subscriptions` or App Store subscriptions URL in source. `EXPO_PUBLIC_PLAY_STORE_URL` / `EXPO_PUBLIC_APP_STORE_URL` default empty (`src/config/env.ts`). | A Settings (or equivalent) link to Play’s subscription management URL **can** meet the cancellation-access requirement without every planned reporting screen. That link is still missing. |
| Restore purchases | `UpgradeSheet` restore CTA → `useIap().restorePurchases` → `iapSession.restorePurchases`. | Useful recovery; **not** a substitute for manage/cancel. Only reachable if quota upsell is enabled and the sheet is shown. |
| Settings billing | `app/(app)/(tabs)/settings.tsx` exposes a **dev-only** billing UX preview gated by `isBillingUxPreviewEnabled`. Production binaries redirect away. | No production Settings subscription row or store manage link. |

Do not defer manage/cancel by labelling all of VYD-38 optional. Owner must accept any delay past first **paid public** release. Internal billing-off candidate can ship without it because users cannot purchase.

### 2. Authoritative active / expired presentation — **partial (code exists, live status unread)**

| Piece | Where | Evidence class |
| --- | --- | --- |
| Server document | `users/{uid}/subscription/status` | Code. Live user documents not read (REL-10). Live Rules lack `match /subscription/status`; Continuation 3 emulator: owner `getDoc` / listener are `permission-denied`. |
| Client parse | `parseSubscriptionStatus` fail-closed to free / non-entitled | Unit tests. |
| Session + cache | `subscriptionSession.ts`, `subscriptionCache.ts`, `subscriptionFirestore.ts` (`onSnapshot`, `getDocFromServer`) | Unit tests. Not device. |
| UX gating | `subscriptionFeatures.ts` — **not security**. Rules / quota architecture remain authority. `onHold` / `expired` → free even if a malformed doc sets `entitlementActive`. | Unit tests. |
| Upgrade sheet labels | `mapUpgradeSheetModel.ts` current plan + entitlement copy | Injected IAP tests on #22. Production sheet only if upsell flag is on. |
| Settings / account summary of plan | Missing outside UpgradeSheet | Paid-launch gap (same as VYD-38 screen). |

Accurate presentation for paying users requires: deployed status writer, client listener on a signed-in device, and a durable UI that is not only the quota-exhausted sheet.

### 3. Purchase / restore / pending — **client machinery present; store acceptance not run**

- Client: `iapSession.ts`, `iapPurchaseProcessor.ts` (store event ≠ entitlement), `IapProvider.tsx`.
- Host: `QuotaUpsellHost` / `quotaUpsellController.ts` (async failure ownership, shared purchase/restore lock, no client entitlement write).
- Backend validation: `validateAndActivateAndroid` / `validateAndActivateIOS` fail-closed in **source** while billing flags are off, and those handlers are **not deployed**.
- Evidence: unit + injected IAP/host tests. **Not** Play Billing Library / StoreKit device proof. REL-01/02 remain native/store pending.

### 4. Renewal — **backend sketched; not production-complete**

- Android: Play RTDN is a **signal**. Live state is `purchases.subscriptionsv2.get` (`functions/src/billing/google/rtdn.ts`, `androidSubscriptionAdapter.ts`). `notificationType` must not mutate entitlement by itself.
- iOS: App Store Server Notifications V2 (`appStoreServerNotificationsV2.ts`) after `SignedDataVerifier.verifyAndDecodeNotification`.
- Transition engine records `eventType: "renewal"` (`functions/src/billing/transition.ts`, unit tests).
- Production HTTP handlers stay fail-closed in source; **`androidRtdn` / `appStoreServerNotificationsV2` are not deployed**. Pub/Sub / ASSN endpoints, IAM, and live enablement are unread in Play/App Store consoles. Ticket mention ≠ deployed renewal.

### 5. Refund / revocation — **backend partial; queue consumer missing; UI missing**

- Android voided purchases: `processAndroidVoidedPurchase` from RTDN (`rtdn.ts`).
- Transition: `kind: "refund"` with explicit `accessRevoked`. Comment in `transition.ts`: a Google refund is **not** automatically a revocation; live subscription state decides. Do not treat refund-without-revoke as revoke.
- Durable queue: `functions/src/billing/reconciliationQueue.ts` — written when a financial event is recorded but live entitlement cannot be reconciled. **“A later phase may consume the queue. No worker is deployed in VYD-32.”**
- Operational recovery therefore **stops at an unread work item** unless a later authorized worker exists. That **reconciliation consumer** is a paid-launch **engineering** gate for incorrect charging/access, not polish and not replaced by a Settings manage/cancel link.
- Client: no refund/revocation messaging surface.

### 6. Retry / reconciliation / operational recovery — **partial**

| Capability | Code | Launch class |
| --- | --- | --- |
| Client IAP retry after recoverable failure | Quota upsell controller explicit retry; no auto-purchase | Needed when upsell is on |
| Server purchase validation rate limit | `consumeBillingRateLimit` | Needed when billing is on |
| Unqueryable token → reconciliation queue | `ensureReconciliationWorkItem` | Critical **if** paid; incomplete without consumer |
| GST / invoice retry queues | `functions/src/billing/tax/retryQueue.ts` | Tax ops; not a substitute for subscription access repair |
| Operator dashboard / revenue reporting | Tax working papers / GSTR-1 generators exist as **backend tax foundation** (VYD-40), not an in-app revenue dashboard | **Optional polish** relative to charging correctness |

### 7. Billing details (GST invoice fields) — **server exists, client UI missing; server not deployed**

`docs/BILLING_VYD38_BILLING_DETAILS_UX.md`: `updateBillingDetails` callable is server-side; in-app Billing Details belong on `SubscriptionManagementScreen`. GST tax documents cannot be collected from customers in-app without that UI. `updateBillingDetails` is **not** in the live function list. Classify as **paid-launch critical for GST invoices**, separable from first internal **billing-off** candidate.

## Optional polish (not a reason to skip critical items)

- Usage-bar / “records this month” chrome beyond UpgradeSheet entitlement labels (`billing.upgrade.entitlementLimit` copy only).
- In-app revenue dashboards / GSTR-1 operator UI.
- Billing UX preview lab (`BillingUxPreviewLab`) — fixtures; production redirects away.
- Professional-pack / insights feature flags already exist as UX gating (`subscriptionFeatures.ts`); expanding them is product polish, not subscription-access correctness.

Do not relabel manage/cancel access, authoritative status display, refund/revocation reconciliation **consumer**, or fail-closed store validation as optional. Do not relabel every reporting screen as a Play cancellation-access blocker.

## Evidence classes (do not collapse)

| Class | What exists | What does not |
| --- | --- | --- |
| Code | Client IAP + subscription reader; backend adapters, RTDN/ASSN handlers, transition + queue writers | Management screen, store manage URLs, queue worker |
| Backend deployment | Identity/email/recovery/deletion/security callables deployed; App Check registered and unenforced; live Rules ≠ repo (no live quota Rules gate) | Billing/GST/RTDN functions, live billing env flags, Pub/Sub, Play tracks |
| Device / store | None in this queue | Real purchase, restore, cancel, renewal, refund, delayed events |

## Later implementation tasks (for separate approval)

1. Production Settings (or equivalent) **store manage/cancel links**. A dedicated `SubscriptionManagementScreen` can still host plan status and billing-details fields per VYD-38 UX doc (callable-only writes); it is not the only way to meet Play cancellation-access.
2. Reconciliation **consumer** for `billingReconciliationQueue` with operator alerting (paid-launch engineering gate).
3. Device/store matrix for purchase, pending, restore, cancel, renewal, refund, revocation, account binding — after REL-09/11 and billing-flag approval.
4. Confirm Play product IDs / App Store products match `iapCatalog` (unread in Console).
5. Reviewed deploy of billing functions and/or quota Rules only under a later explicit authorization — not this document.

No VYD-38/39 implementation is started here.
