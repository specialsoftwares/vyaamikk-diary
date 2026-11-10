# Subscription lifetime VC36 — execution sheet

Status: **IN PROGRESS — contracts + shared writers landed; streams A–D implementing.** Public publication and integration→main remain HOLD.

## Baseline

| Item | Value |
| --- | --- |
| Isolated worktree | `/Users/shivamsaurav/vyaamikk-subscription-vc36` |
| Branch | `fix/subscription-lifetime-vc36` |
| Source baseline | `c29bcd172bceadb841d861ed296d4ebc32d4aae9` (VC36 consent/versionCode record) |
| Dirty Diary workspace | Do not edit |
| Draft PRs | Preserve #42 / #54 / #55 / #56 |
| Expo | SDK 54 |

## Amended contracts (lead-owned)

| Contract | Path |
| --- | --- |
| Entitlement vs purchase progress | `src/subscription/entitlementView.ts` (`e8d01bf`) |
| Lifetime admission (all families incl. GRIN) | `src/billing/optionC/lifetimeAdmission.ts` (`e8d01bf`) |
| Shared meter presentation | `src/subscription/lifetimeQuotaMeterPresentation.ts` + `LifetimeQuotaMeterBanner` |
| Shared translations | `billing.entitlement.*` in `en.ts` / `hi.ts` |
| Selected rules artifact | `docs/release/rules-compat/proposed-billing-reads/` sha256 `64a57dbd…` |

Rules in force:

1. Confirmed free / confirmed paid / unknown are distinct. Paid period-change keeps access (`period_change_pending`). Unreadable plan → Checking your plan / retry; preserve draft. Authoritative paid activation hides the free meter immediately on dashboard and every open creation screen (same publish; no navigate/refresh).
2. One trusted lifetime admission across diary/composer, PO, Dukaan credit, professional pack, GRIN first issuance. Atomic commit of record + quota + serial. Owner- and family-scoped operation ID. `freeMembershipIds` bounded to 15; durable receipts for retries. Retry after deletion cannot recreate or consume another slot. At 14/15 two devices → one accept + one recoverable draft. Older client writers covered explicitly on the trusted path.
3. Forward-only accounting is a **migration proposal only**. Dry-run counts (provable / ambiguous / paid-active / empty) required before any live enablement.
4. Catalog: Monthly ₹136 / Yearly ₹1,832; one Play product `vyd_unlimited` with base plans `monthly` / `yearly`. Preserve legacy benefits including Starter’s existing cap. Trace two VC36 test purchases through verification → entitlement write → owner read. Verify new checkout + restore before retiring legacy sales.
5. Single writers: shared dashboard meter shell, translations, selected Firestore rules. Canonical CI on final versionCode commit; next unused code from Play+EAS; one `internal-grin` AAB from that SHA. Artifact + handset evidence recorded here. Public release and integration→main stay HOLD.

## Ownership

| Writer | Scope |
| --- | --- |
| A — Catalog / purchase | products, iapCatalog*, purchase processor, validate/activate, purchase progress, selling surfaces |
| B — Lifetime admission | atomicBillableCreate, usageTransition, lifetime wiring, G1 quota, migration dry-run, older writers |
| C — Insights / VyaaFlow | Insights first-15 membership filter, statutory calendar always on |
| D — Walkthrough | Phone/session/splash, cash paid & payment request, saved letter inset, records/deletion, dashboard refresh/search |
| Shared dashboard | You-tab + creation-screen meter mounts consuming `EntitlementView` only |
| Shared translations | en/hi billing + quota + walkthrough strings |
| Shared rules | Additive billingDetails / subscriptionBillingHistory (+ lifetime usage) artifact |
| Lead | Contracts, this sheet, Play owner actions, CI/build/device |

## Walkthrough defects (must remain in plan)

- Phone: `session_changed` must not surface as `session_expired` over a successful current session; splash no rewind; Back/Change number/wrong/expired/timeout preserved.
- Cash paid / Payment request: stable owner deps; bounded reads; form-shaped loading; no dashboard flash; save/reopen + quota on those routes.
- Saved letter: one scrollable reader + bottom inset; closing field reachable.
- Records/deletion: “All records” = all families; identify selection in destructive dialogs; “Draft deleted” vs cloud ack; banners clear of next header.
- Dashboard/search: kill 63px refresh jump / ~78px card flip; Continue distinct after consent; empty-library Create; no keyboard on empty search; no raw errors.

## Device tests (must remain)

Slots 0 / 14 / 15 / 16; two-device race at 14/15; lost response; offline draft; delete/recreate; upgrade/expiry meter removal without navigate; Insights membership; statutory empty/offline/fail; purchase verifying → paid meter hide; restore; VC36 test-purchase trace.

## Play Console owner action

| Action | Detail |
| --- | --- |
| Create product | `vyd_unlimited` (subscription) |
| Base plan monthly | `monthly`, P1M, India **₹136**, standard base offer only |
| Base plan yearly | `yearly`, P1Y, India **₹1,832**, standard base offer only |
| Legacy | Keep existing subscribers; stop offering starter/pro/business to new purchasers |
| Do not | Silently cancel, reprice, or invalidate active legacy subscriptions |

## Artifact / CI / handset (fill on ship)

| Field | Value |
| --- | --- |
| Final versionCode | _pending — re-read Play+EAS after combined CI (36 used)_ |
| Final commit SHA | _pending_ |
| Canonical CI run | _pending_ |
| `ci:verify PASS` timestamp | _pending_ |
| EAS build id | _pending_ |
| AAB SHA-256 | _pending_ |
| Package / cert | _pending_ |
| Firebase project | `vyaamikk-diary` |
| Handset | _pending attachment_ |
| Device acceptance | _pending_ |

## Forward-only dry-run (report before live)

| Class | Count |
| --- | --- |
| provable_history | _pending_ |
| ambiguous_history | _pending_ |
| paid_active | _pending_ |
| empty | _pending_ |

Live enablement: **HOLD** until owner approves these counts.
