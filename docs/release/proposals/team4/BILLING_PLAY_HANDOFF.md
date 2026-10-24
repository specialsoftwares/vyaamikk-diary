# Team 4 billing / Play handoff

Worktree: `/Users/shivamsaurav/vyd-worktrees/grin-t4-product`  
Branch: `team/grin-t4-product` (do **not** force-push).  
Combined READ-ONLY HEAD: `c45518a` (application `56f2040`; do not build `520f9f9`).  
Client purchase-entry: **`"0"`** on production / preview / `internal-grin`.
**GRIN readiness ≠ billing readiness.**

HOLD: Play Save, catalog mutation, seeding, purchases, billing activation,
website publish, submission.

**Do not reopen** GRIN-in-existing-plans.

---

## Two owner decisions (recorded 2026-10-06)

Index: `TWO_OWNER_DECISIONS.md`.

1. **Deletion** — **45-day** cancellation window after confirmed request.
   Supersedes 180. Implemented 15 until T2. Freeze ≠ delete. Constant change
   is pending clock, not archive, not GRIN purge.
   `DELETION_45_PLAY_DISCLOSURE.md`.

2. **Storage** — **1 / 3 / 10 GiB**. **Do not advertise.**
   `STORAGE_OWNER_CHOICE.md`.

---

## Billing (live vs source)

- Live asia-south1 billing handlers **ACTIVE** (2026-10-06). `PLAY_BILLING_ENABLED` **key absent** → source fail-closed (`=== "true"`). Client purchase-entry **`"0"`**. Pub/Sub topics **0**. KMS unused. Do **not** reuse 2026-09-20 “catalog empty” / “billing disabled.”
- Play catalog / prices / license testers: **NOT RUN**. This continue: no Play Console session; `gcloud` **absent**; Python `googleapiclient` **absent**; **do not use Firebase token as Play Android Publisher** (prior Publisher call **403**). Catalog stays **unknown**, not “empty.” Pub/Sub inspect **NOT RUN** (`gcloud` absent) — do not reuse a prior “0 topics” count as a fresh inspect.
- Trace confirmed: `purchaseEntryGate` → `iapSession` → `iapPurchaseProcessor` → `validateAndActivateAndroid` → `androidSubscriptionAdapter` → `deriveEntitlement` → `atomicBillableCreate` → `rtdn`.
- `PLAY_BILLING_ENABLED=true` would expose **all** authenticated callers unless the UID allowlist also passes. Internal track / hidden button are not backend controls.
- **Implemented (fail-closed, not enabled):** `PLAY_BILLING_TESTER_UIDS` (CSV or JSON) **after** enablement on prepare/validate **and** `enforceRestrictedTesters` on production RTDN + Android reconciliation. Empty list denies everyone. Tests: `npm run test:billing-play-constants`. **No tester emails/UIDs invented. Billing not flipped. Not deployed.** See `RESTRICTED_TESTER_ALLOWLIST.md`.
- Team 3: freeze purchase-entry `"0"` on ordinary Internal GRIN. Billing-test binary = **separate later profile/SHA**.
- Executable SOURCE plan: `docs/release/packets/RESTRICTED_BILLING_ACCEPTANCE_PLAN.md`. LIVE_STORE **NOT RUN**. **REAL-CHARGE RISK** tests named there (do not execute). Packet: `APPROVAL_C_RESTRICTED_BILLING.md`.

### RTDN + entitlement reconciliation (readiness, not activation)

| Piece | SOURCE | LIVE |
|---|---|---|
| `androidRtdn` HTTP | Exported asia-south1; `PLAY_BILLING_ENABLED` then OIDC (`PLAY_RTDN_PUSH_AUDIENCE` + `PLAY_RTDN_PUSH_SERVICE_ACCOUNT`) | Handler **ACTIVE**; enablement key **absent**; Pub/Sub topics **0**. If the HTTPS endpoint were hit while billing were enabled and OIDC env absent → `rtdn_oidc_config_missing` |
| `PLAY_BILLING_TESTER_UIDS` on RTDN | Production deps `enforceRestrictedTesters: true` (SOURCE). Empty list denies grant. | Inspect **NOT RUN** this continue |
| `scheduledBillingReconciliation` | Tick no-ops unless `BILLING_RECONCILIATION_ENABLED === "true"` | Job **exists**; reconciliation env key **absent** |
| Entitlement write | `deriveEntitlement` → `users/{uid}/subscription/status`; Rules deny client writes | Fail-closed with billing off |
| Duplicate RTDN / refund / revoke | Unit/emulator in `functions/src/billing/**` | **LIVE_STORE NOT RUN** |

Do **not** wire Pub/Sub, set OIDC, or enable reconciliation from this file.

---

## Play listing

- `PLAY_SUBMISSION_READINESS.md` (this continue): intended binary is
  application **`520f9f9`**. **No `520f9f9` AAB.** Do not describe a
  `5d5df3d` installed binary as current.
- Owner/tester finishes **email + profile before review**; reviewer must
  not use a founder inbox. Do not advertise GRIN on an AAB where GRIN is
  unreachable. Full-access checkbox = **actual reachable function**, not
  flags.
- Artwork **is git-tracked**: icon `cc550cb8450c62d5b991da56d0e5989db9ee14fb7d971b679848728caf401f5a`, feature `b17f8082b5b7f025ce0ecfc23d0dd096c8997a945f5960198e135b27d10dddd1`, preview `a0c18f35fde4a2585fb0a6d6131441552c7a784992bebee7ae248b081fd51a30`. Play upload **NOT RUN**.
- **Public-safe screenshots** (`safeForPublic: true`): `location-access-en`, `new-record-en`, `new-record-hi`, `new-record-te`, `new-record-gu`, `statutory-info-en`. **Do not upload** `dashboard-en/hi/ta/te/gu` (`safeForPublic: false` — demo names). Console presence of any screenshot: **NOT RUN**.
- Do not claim live 14-day trial (source-only; no client grant). Do not claim live GST/2B/EWB.

---

## Data safety / privacy / deletion

- Rebuild: `DATA_SAFETY_REBUILD.md`. Firebase treated as **processor**, not automatic Play “sharing.” Diary **does** collect financial fields (amounts, credit, payment, bank/IFSC/UPI, GSTIN, evidence) despite IAP off. Email is **required** for onboarding (in-app privacy still says optional). Crashlytics: `auto_collection false` + consent. No encryption-backup / audit claims.
- In-app legal baseline **2026-07-27** preserved. Live `/privacy` effective **15 July 2026**. Do not backdate.
- Website (re-read delete-account 2026-10-06): `/privacy` 200 (prior); `/delete-account` 200 email `support.vyd@specialsoftwares.com` (Play-allowed; identifies app + Ananya LLP). **Do not invent a form. Do not call mailto inherently defective.** Inbox monitoring **NOT RUN**.
- `/~flock.js` 200 (~21KB, Tinybird). `data-proxy-url="/~api/analytics"` → browser POST first-party; POST **202**, GET **404**. App does **not** load flock.js. Upstream Tinybird forward **UNKNOWN** — **do not claim flock.js forwards solely from 202**. Cloudflare `__cf_bm` is hosting, not an app SDK.
- Explicit account deletion — owner **45-day** policy; implemented **15** until T2; 180 superseded. See `DELETION_45_PLAY_DISCLOSURE.md`. **Do not Save Play. Do not publish website.**

---

## Not done (HOLD)

No Play Save, catalog write, account seed, purchase, `PLAY_BILLING_ENABLED`
set, `PLAY_BILLING_TESTER_UIDS` seed, website publish, or submission.
