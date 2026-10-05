# Team 4 billing / Play handoff

Worktree: `/Users/shivamsaurav/vyd-worktrees/grin-t4-product`  
Branch: `team/grin-t4-product`  
Application SHA: `5d5df3d54df08953bfb26db39a9b7f5e3d67ed47` (no AAB of this SHA).  
HOLD: Play Save, catalog mutation, seeding, purchases, billing activation, website publish, submission.

## Billing (live vs source)

- Live asia-south1 billing handlers **ACTIVE** (2026-10-06). `PLAY_BILLING_ENABLED` **key absent** → source fail-closed (`=== "true"`). Client purchase-entry **`"0"`**. Pub/Sub topics **0**. KMS unused. Do **not** reuse 2026-09-20 “catalog empty” / “billing disabled.”
- Play catalog / prices / license testers: **NOT RUN**. Exact blocker: no Play Console session; `gcloud` absent; no Android Publisher client; **do not use Firebase token as Play Android Publisher** (prior Publisher call **403**).
- Trace confirmed: `purchaseEntryGate` → `iapSession` → `iapPurchaseProcessor` → `validateAndActivateAndroid` → `androidSubscriptionAdapter` → `deriveEntitlement` → `atomicBillableCreate` → `rtdn`.
- `PLAY_BILLING_ENABLED=true` would expose **all** authenticated callers. Internal track / hidden button are not backend controls.
- **Implemented (fail-closed, not enabled):** `PLAY_BILLING_TESTER_UIDS` UID allowlist **after** the enablement check on prepare/validate. Empty list denies everyone. Tests: `npm run test:billing-play-constants`. **No tester emails/UIDs invented. Billing not flipped. Not deployed.** Residual: RTDN/reconciliation still UID-ungated (Pub/Sub 0). See `RESTRICTED_TESTER_ALLOWLIST.md`.
- Team 3: freeze purchase-entry `"0"` on ordinary Internal GRIN. Billing-test binary = **separate later profile/SHA**.
- Acceptance matrix (purchase, cancel, pending, duplicate callback, lost response, restore, reinstall, account switch, renewal, expiry, refund/revocation, reconciliation, quota/entitlement): all **LIVE_STORE NOT RUN**. `APPROVAL_C_RESTRICTED_BILLING.md`.

## Play listing

- `PLAY_SUBMISSION_READINESS.md` corrected. Owner/tester finishes **email + profile before review**; reviewer must not use a founder inbox. Do not advertise GRIN on an AAB where GRIN is unreachable. Full-access checkbox = **actual reachable function**, not flags. **No 5d5df3d installed binary to verify.**
- Artwork **is git-tracked** (also at `5d5df3d`): icon `cc550cb8450c62d5b991da56d0e5989db9ee14fb7d971b679848728caf401f5a`, feature `b17f8082b5b7f025ce0ecfc23d0dd096c8997a945f5960198e135b27d10dddd1`, preview `a0c18f35fde4a2585fb0a6d6131441552c7a784992bebee7ae248b081fd51a30`.
- Dashboard screenshots `safeForPublic: false` (demo names). Do not claim live 14-day trial (source-only; no client grant). Do not claim live GST/2B/EWB.

## Data safety / privacy / deletion

- Rebuild: `DATA_SAFETY_REBUILD.md`. Firebase treated as **processor**, not automatic Play “sharing.” Diary **does** collect financial fields (amounts, credit, payment, bank/IFSC/UPI, GSTIN, evidence) despite IAP off. Email is **required** for onboarding (in-app privacy still says optional). Crashlytics: `auto_collection false` + consent. No encryption-backup / audit claims.
- In-app legal baseline **2026-07-27** preserved. Live `/privacy` effective **15 July 2026**. Do not backdate.
- Website (2026-10-05T21:18Z): `/privacy` 200; `/delete-account` 200 mailto `support.vyd@specialsoftwares.com` (Play-allowed; identifies app + Ananya LLP). **Do not invent a form.** Inbox monitoring **NOT RUN**.
- `/~flock.js` 200 (~21KB, Tinybird). `data-proxy-url="/~api/analytics"` → browser POST first-party; POST **202**, GET **404**. App does **not** load flock.js. Upstream Tinybird forward **UNKNOWN**. Cloudflare `__cf_bm` is hosting, not an app SDK.
- 180-day hold: **not** Play/legal approved. Recommend **keep 15-day grace**; do not ship 180-day pending as “deletion” (Play: freeze ≠ delete). Optional archive would be a **separate product**. GRIN `grinEvidence` (and GRIN/billing Firestore collections) **not** in purge lists. `DELETION_WINDOW_180_PLAY.md`.

## Not done (HOLD)

No Play Save, catalog write, account seed, purchase, `PLAY_BILLING_ENABLED` set, website publish, or submission.
