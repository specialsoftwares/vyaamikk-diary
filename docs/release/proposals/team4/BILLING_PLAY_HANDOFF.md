# Team 4 billing / Play handoff

Worktree: `/Users/shivamsaurav/vyd-worktrees/grin-t4-product`  
Branch: `team/grin-t4-product` (do **not** force-push; already ahead of origin).  
Combined READ-ONLY HEAD: `aea65c170adb25f09ca1045593f18847df2f3b30`  
Application SHA to describe: `520f9f98bc952fd7f30a907da9e85774629a69c0`
(**no AAB of this SHA**).  
Canonical CI: GitHub Actions run **`37425360211`** on `0d7aa17`.  
Client purchase-entry: **`"0"`** on production / preview / `internal-grin`.

HOLD: Play Save, catalog mutation, seeding, purchases, billing activation,
website publish, submission.

**Do not reopen** GRIN-in-existing-plans.

---

## Two owner decisions (blank until the owner writes)

Index: `TWO_OWNER_DECISIONS.md`.

1. **Deletion public window** — `DELETION_15_VS_180_OWNER_SHEET.md`  
   Three facts, do not collapse: **Implemented = 15 days**; **Owner
   requested = 180 days**; **Final public policy = UNRESOLVED**. Choices
   A/B/C/D **blank**. **P8 open**. Do not record 15 as the owner’s choice.
   Do not promise that changing `DELETION_GRACE_MS` is a safe 180-day
   policy. Play User Data (2026-10-06): freeze / disable ≠ delete.

2. **Storage GiB table** — `STORAGE_OWNER_CHOICE.md`  
   Present **both** original **1 / 5 / 20 GiB** (wired, not advertised)
   **and** alternative **256 MiB / 1 GiB / 5 GiB** (not wired, not
   guaranteed profitable). Request **one** final choice. GCS location
   **UNKNOWN**. Team 2 economics on combined:
   `docs/release/proposals/team2/STORAGE_ECONOMICS.md`.

---

## Billing (live vs source)

- Live asia-south1 billing handlers **ACTIVE** (2026-10-06). `PLAY_BILLING_ENABLED` **key absent** → source fail-closed (`=== "true"`). Client purchase-entry **`"0"`**. Pub/Sub topics **0**. KMS unused. Do **not** reuse 2026-09-20 “catalog empty” / “billing disabled.”
- Play catalog / prices / license testers: **NOT RUN**. This continue: no Play Console session; `gcloud` **absent**; Python `googleapiclient` **absent**; **do not use Firebase token as Play Android Publisher** (prior Publisher call **403**). Catalog stays **unknown**, not “empty.”
- Trace confirmed: `purchaseEntryGate` → `iapSession` → `iapPurchaseProcessor` → `validateAndActivateAndroid` → `androidSubscriptionAdapter` → `deriveEntitlement` → `atomicBillableCreate` → `rtdn`.
- `PLAY_BILLING_ENABLED=true` would expose **all** authenticated callers. Internal track / hidden button are not backend controls.
- **Implemented (fail-closed, not enabled):** `PLAY_BILLING_TESTER_UIDS` UID allowlist **after** the enablement check on prepare/validate. Empty list denies everyone. Tests: `npm run test:billing-play-constants`. **No tester emails/UIDs invented. Billing not flipped. Not deployed.** Residual: RTDN/reconciliation still UID-ungated (Pub/Sub 0). See `RESTRICTED_TESTER_ALLOWLIST.md`.
- Team 3: freeze purchase-entry `"0"` on ordinary Internal GRIN. Billing-test binary = **separate later profile/SHA**.
- Acceptance matrix (purchase, restore, pending, cancel, renewal, refund/revocation, duplicate RTDN, account switch, expiry, reconciliation): **SOURCE** where tests exist; all **LIVE_STORE NOT RUN**. `APPROVAL_C_RESTRICTED_BILLING.md`.

### RTDN + entitlement reconciliation (readiness, not activation)

| Piece | SOURCE | LIVE |
|---|---|---|
| `androidRtdn` HTTP | Exported asia-south1; `PLAY_BILLING_ENABLED` then OIDC (`PLAY_RTDN_PUSH_AUDIENCE` + `PLAY_RTDN_PUSH_SERVICE_ACCOUNT`) | Handler **ACTIVE**; enablement key **absent**; Pub/Sub topics **0**. If the HTTPS endpoint were hit while billing were enabled and OIDC env absent → `rtdn_oidc_config_missing` |
| `PLAY_BILLING_TESTER_UIDS` on RTDN | **Not applied** (residual) | N/A while Pub/Sub 0 |
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
- Explicit account deletion — **three facts, do not collapse:** (1) **Implemented = 15 days**; (2) **Owner requested = 180 days**; (3) **Public-approved policy = UNRESOLVED**. See `DELETION_15_VS_180_OWNER_SHEET.md`.

---

## Not done (HOLD)

No Play Save, catalog write, account seed, purchase, `PLAY_BILLING_ENABLED`
set, `PLAY_BILLING_TESTER_UIDS` seed, website publish, or submission.
