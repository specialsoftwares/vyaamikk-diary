# Subscription lifetime VC36 — execution sheet

Status: **IN PROGRESS — combined-head CI proven; versionCode 37 build commit + CI + internal-grin AAB in flight.** Public publication and integration→main remain HOLD. Forward-only live cutover remains HOLD pending owner decision on dry-run counts below. Device acceptance recorded separately.

Branch: `fix/subscription-lifetime-vc36` (worktree `/Users/shivamsaurav/vyaamikk-subscription-vc36`). Source baseline `c29bcd1`.

## Baseline

| Item | Value |
| --- | --- |
| Isolated worktree | `/Users/shivamsaurav/vyaamikk-subscription-vc36` |
| Branch | `fix/subscription-lifetime-vc36` |
| Source baseline | `c29bcd172bceadb841d861ed296d4ebc32d4aae9` (VC36 consent/versionCode record) |
| Dirty Diary workspace | Do not edit |
| Draft PRs | Preserve #42 / #54 / #55 / #56 |
| Expo | SDK 54 |

## Amended contracts (landed)

| Contract | Path |
| --- | --- |
| Entitlement vs purchase progress | `src/subscription/entitlementView.ts` |
| Lifetime admission (all families incl. GRIN) | `src/billing/optionC/lifetimeAdmission.ts` + GRIN `tools/goods-evidence-emulator/quota.ts` |
| Shared meter | `LifetimeQuotaMeterBanner` + `CreationScreenQuotaMeter` + `useLifetimeQuotaMeter` |
| Shared translations | `billing.entitlement.*` / swipeDelete named confirms in `en`/`hi` |
| Selected rules artifact | `docs/release/rules-compat/proposed-billing-reads/` |

## Acknowledged meaning (verified)

Processor proofs in `src/billing/iap/iapAcknowledgedEntitlement.test.ts`:

| Case | Result |
| --- | --- |
| New purchase (`acknowledged` + `entitlementActive`) | `verified` |
| Already-acknowledged restore (`alreadyProcessed` + `entitlementActive`) | `verified` |
| Same-token renewal (second validate `alreadyProcessed`) | `verified` |
| Retry after lost response (`awaiting_recovery` → success) | `verified` |
| Inactive / unacknowledged | not `verified` |
| `purchaseState: pending` | never validates |

## VC36 test-purchase trace (before further diagnostics)

Owner `kIJYjcK5Q4eryqdr13lX09K5coy1` (Android Play test account):

| Step | Evidence |
| --- | --- |
| Purchase 1 activated | `h_android:purchase:GPA.3353-5451-0354-77837` · `vyd_starter_monthly` · 2026-11-10T21:08:30Z |
| Purchase 2 activated | `h_android:purchase:GPA.3337-0290-9674-00705` · `vyd_business_yearly` · 2026-11-10T21:08:56Z |
| Renewals preserved | `GPA.3337-…00705..0` and `..1` renewed events |
| Entitlement write / owner read | `users/…/subscription/status` → `entitlementActive: true`, `plan: business`, `productId: vyd_business`, `basePlanId: yearly`, `currentPeriodEnd` 2026-11-10T22:38:56Z |

Legacy Starter activation and Business yearly renewals remain on this owner; no further diagnostic purchase initiated in this pass.

## Lifetime + GRIN proofs

| Proof | Result |
| --- | --- |
| Ordinary + GRIN share one 15-slot counter | `lifetimeCrossFeature.emulator.test.ts` |
| Cross-feature race at 14/15 | one `accept_free` + one `reject_exhausted` (draft) |
| GRIN server path at 15 | `decideGrinIssuanceQuota` → `lifetime_exhausted` |
| Older writer cannot skip | exhausted policy rejects; rules still require `usageConsumedForRecord` when enforcement on |
| Retry after deletion | receipt replay → no recreate / no second slot (`lifetime_receipt_replay`) |
| Injected GRIN register | `quota.injected.unit.test.ts` ok |

## Meter

Mounted on You dashboard and creation screens: composer (incl. Cash paid / Payment request), purchase-order form, customer-credit form, professional-pack form, GRIN create. Hide-on-paid + never Free/0/15 unknown covered by `lifetimeQuotaMeterHideOnPaid.test.ts`.

## Walkthrough fixes in this head

- Auth: `session_changed` uses AppError code `session_changed` (not `session_expired`)
- Splash: mid-boot owner/generation bumps no longer rewind the boot gate after splash release
- Cash paid / Payment request: stable `useRequestOwner`; new opens skip hydration flash; edit/draft reopen stays bounded
- Saved letter: scrollable reader + bottom inset so closing field is reachable
- Search: no autofocus keyboard on empty library
- Delete: destructive dialogs name the selection; drafts ack as “Draft deleted”
- Dashboard pull: Android `progressViewOffset` to stop ~63px refresh jump
- All records total counts every saved family
- Composer loading stays form-shaped with meter (no dashboard list flash)
- Rules: `usageCurrent` shape accepts lifetime fields required by atomic admission

## Forward-only dry-run (HOLD live)

Tool: `npx --yes tsx scripts/lifetime-cutover-dry-run.ts docs/release/subscription-lifetime-vc36/dry-run-accounts.json`  
Inventory: all 8 Auth/Firestore user docs in `vyaamikk-diary` (2026-11-11). Live enablement: **HOLD**.

| Class | Count |
| --- | --- |
| provable_history | **0** |
| ambiguous_history | **0** |
| paid_active | **1** |
| empty | **7** |
| sampleSize | 8 |
| enabledLive | false |

## Artifact / CI / handset

| Field | Value |
| --- | --- |
| Final versionCode | **37** (EAS list: 36 used by `8d95bd27…`; next unused) |
| Final commit SHA | _pending version-only commit_ |
| Canonical CI run (combined) | **PASS** on `7230ba6` (activated rules + lifetime shape; google-services present; email-challenge flake retried clean; remainder through invoice-renderer PASS) |
| Canonical CI run (version-only) | _pending_ |
| EAS build id | _pending_ |
| AAB SHA-256 | _pending_ |
| Device acceptance | _pending — record separately; public HOLD_ |

## Play Console owner action

| Action | Detail |
| --- | --- |
| Create product | `vyd_unlimited` (subscription) |
| Base plan monthly | `monthly`, P1M, India **₹136** |
| Base plan yearly | `yearly`, P1Y, India **₹1,832** |
| Legacy | Keep existing subscribers; stop offering starter/pro/business to new purchasers |
