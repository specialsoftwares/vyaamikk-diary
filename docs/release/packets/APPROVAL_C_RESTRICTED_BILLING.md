# Approval C — Restricted billing only

**Not authorization to activate.** This packet requests later owner approval
for **restricted tester billing configuration**, not public purchases, not
Play submission, not GRIN go-live.

Do **not**: create Play products, change prices, set
`PLAY_BILLING_ENABLED=true`, seed `PLAY_BILLING_TESTER_UIDS`, wire RTDN,
Save listing, publish website, or submit.

Client purchase-entry stays **`"0"`** on production / preview / `internal-grin`
until a **new** billing-test binary is approved with flags frozen first.

**GRIN readiness ≠ billing readiness.** Combined application `56f2040` (READ-ONLY
`c45518a`) does not make Play billing acceptable. An Internal GRIN AAB with
purchase-entry `"0"` is not a billing-test binary.

Executable plan:
`docs/release/packets/RESTRICTED_BILLING_ACCEPTANCE_PLAN.md`.
Allowlist format:
`docs/release/proposals/team4/RESTRICTED_TESTER_ALLOWLIST.md`.

---

## What this packet is

| In scope | Out of scope |
|---|---|
| SOURCE fail-closed Play billing + tester UID allowlist | Public / production purchases |
| SOURCE acceptance commands | Packet E real-store public acceptance |
| JSON/env format for owner-supplied UIDs (private) | Committing UIDs or emails |
| Naming LIVE_STORE tests and **REAL-CHARGE RISK** | Executing any LIVE_STORE purchase |
| Recording catalog/RTDN as **NOT RUN** when tools/scopes are missing | Claiming catalog empty |
| Ordinary Internal GRIN binary stays purchase-entry `"0"` | Treating GRIN UI / Functions as billing enablement |

**Owner approval requested later (not now):** set enablement + private
allowlist + license testers + whether a **separate** billing-test AAB is
required.

---

## SOURCE (this Team 4 tree)

Gate: `PLAY_BILLING_ENABLED === "true"`
(`functions/src/billing/google/playConstants.ts`). Default off. Callables
throw `failed-precondition` when unset.

After enablement, **`PLAY_BILLING_TESTER_UIDS` is mandatory and fail-closed**:

- Empty / absent → **deny all**
- CSV or JSON UID list (see allowlist doc)
- Emails rejected (`play_billing_tester_allowlist_email_not_uid`)
- Prepare + validate check `request.auth.uid` **after** enablement
- Production RTDN + Android reconciliation set `enforceRestrictedTesters: true`
  so a Pub/Sub delivery cannot grant a non-allowlisted UID
- Hidden purchase button / Internal track **are not this control**

Client: `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` `"0"` on all
release EAS profiles in `eas.json`. Quota upsell `"0"`. Coordinate with
Team 3: freeze `"0"` for the ordinary Internal GRIN binary. A billing-test
binary would be a **separate later profile/SHA**.

Catalog in source (`functions/src/billing/products.ts`): `vyd_starter` /
`vyd_professional` / `vyd_business` × monthly / quarterly / yearly.
Expected paise are **not** Play display authority. Creating store products
is **not** done by this file.

---

## LIVE_BACKEND / Play (this continue)

Firebase CLI can see project `vyaamikk-diary`. That is **not** Android
Publisher access.

| Surface | This continue |
|---|---|
| Play catalog / prices / base plans / license testers | **NOT RUN** — no Play Console session; `gcloud` absent; `googleapiclient` absent; do not use Firebase token as Publisher |
| RTDN Pub/Sub | **NOT RUN** (`gcloud` absent). Do not reuse a prior “0 topics” count as a fresh inspect |
| `PLAY_BILLING_ENABLED` / tester UID **values** | Never dumped. Do not seed |
| Client flags | `"0"` **SOURCE** |

Prior 2026-10-06 key-**presence** note (enablement keys absent on asia-south1
handlers) is **not re-verified** here. Do **not** reuse 2026-09-20 “catalog
empty.”

---

## Source trace

1. `src/billing/iap/purchaseEntryGate.ts` (`=== "1"`)
2. `src/billing/iap/iapSession.ts` (`prepareAndroidBillingAccount`)
3. `src/billing/iap/iapPurchaseProcessor.ts` (`validateAndActivateAndroid`)
4. `functions/src/billing/callables/validateAndActivateAndroid.ts`
   (enablement + tester allowlist, then handler; production deps
   `enforceRestrictedTesters`)
5. `functions/src/billing/google/androidSubscriptionAdapter.ts`
6. `functions/src/billing/google/rtdn.ts` + `androidRtdn.ts`
7. `scheduledBillingReconciliation.ts` (Android revalidator restricted)

---

## Acceptance (do not purchase now)

SOURCE: `bash tools/billing-acceptance/run-restricted-billing-source.sh`

LIVE_STORE: all **NOT RUN**. **REAL-CHARGE RISK** tests (do not run):

- **REAL-CHARGE-01** `LIVE_STORE.purchase_success_non_license_tester`
- **REAL-CHARGE-02** `LIVE_STORE.purchase_success_production_or_public_track`
- **REAL-CHARGE-03** `LIVE_STORE.renewal_after_license_tester_removed`
- **REAL-CHARGE-04** `LIVE_STORE.base_plan_upgrade_non_license_tester`
- **REAL-CHARGE-05** `LIVE_STORE.prepaid_or_real_instrument_outside_lab`

Official facilities for a later restricted run: Play license testing, Internal
testing track (distribution only), Play Billing Lab.

---

## Reviewer access (parallel, no submit)

Canonical: `docs/PLAY_REVIEW_SETUP.md`.

- Restricted: YES
- Phone `+91 9000000000` / OTP `654321` only if live test-phone fixture
  verified
- Owner pre-completes **email + profile**
- **No founder email OTP/password** in Play instructions
- Full-access checkbox = **reachable** function on the installed binary.
  Intended Internal GRIN binary: purchase-entry `"0"` → **do not check**
  paid/premium. GRIN checkbox only if GRIN is actually reachable.
- Public-safe screenshots only (`safeForPublic: true`). Do not upload
  dashboard assets with demo names.

---

## Deletion / Data safety (parallel, no Play Save)

Owner **2026-10-06**: **45-day** cancellation window after confirmed
account-deletion request. **Supersedes 180.** Implemented code is still
**15 days** until Team 2 wires `DELETION_GRACE_MS`. Play: freeze ≠ delete.
Changing the constant to 45 is the **pending clock**, not a recoverable
archive, not GRIN purge (`INCLUDE_GRIN_IN_ACCOUNT_PURGE` stays false).

Do **not** Save Play Data safety with 15-day copy after T2 lands. Do **not**
Save now. See
`docs/release/proposals/team4/DELETION_45_PLAY_DISCLOSURE.md`.

Storage: owner selected **1 / 3 / 10 GiB**. **Do not advertise.** Do not
reopen GRIN-in-existing-plans.

---

**This file does not approve public billing.**
