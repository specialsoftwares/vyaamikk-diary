# Internal AAB packet — B1 COMPLETE · B2 COMPLETE · D1 OWNER INSTALL

**Application pin unchanged.** Do not rebuild. Do not promote beyond Internal
Testing. Billing, purge, main merge, OTA, and public rollout remain unauthorized.

Updated **2026-10-07**. Tooling-only Auth harness published separately
(`20df6b9` / later docs); **AAB remains** `540e07a`.

Redacted evidence: `docs/release/packets/grin-ops/B1_B2_EVIDENCE_REDACTED.md`.

---

## Status

| Letter | State |
|---|---|
| **B1** EAS Internal AAB | **COMPLETE** — EAS `8c789fa9-705a-4a97-9d87-ba6d6dbd3b88` |
| **B2** Play Internal Testing upload | **COMPLETE** — release **23 (1.0.0)** on Internal testing; Released 7 Oct 10:45 |
| **D1** OnePlus 12R upgrade over vc22 | Authorized; **owner installs** via Play; no uninstall / clear data |

---

## Artifact identity (required)

| Item | Value |
|---|---|
| **B1 checkout / AAB SHA** | `540e07aa07f376716484adb879ce66cb9fb170ce` |
| CI-tested checkout | `7e0d629023198333ed384ae076285925e98047d6` (parent `d4c7ed4…`) |
| Canonical CI for application | GHA **`37445383607` SUCCESS**, verify job **`112208918347`** |
| `540e07a`..`7e0d629` on `DEPLOYMENT_PATHS` | **empty** (docs/QA only) |
| Published tooling (Auth harness) | `20df6b99384f366ceddf4aa7680b5060cd664970` — **not** part of the AAB |
| Do **not** rebuild alone | `520f9f9` / `56f2040` / `313025f` / `fcda7cd` / `60c4bc1` |
| Package | `com.specialsoftwares.vyaamikkdiary` |
| EAS profile | `internal-grin` → Android **AAB** (`app-bundle`), `environment: production`, `autoIncrement: false` |
| Version name | `1.0.0` |
| versionCode | **23** — Play inventory 2026-10-07: unused before B2 upload |
| AAB SHA-256 | `dc2dbf61d6fda549f77a4e16cbf093b0d3b61fa011a7902cfc6dd6925e3ae24c` |
| Signing | Upload-key SHA-256 matches Play UPLOAD cert; APP-SIGNING cert distinct (see redacted evidence) |
| Backend destination | production `vyaamikk-diary` / `982505811909`, Functions `asia-south1`, bucket `vyaamikk-diary.firebasestorage.app` |
| Device path | OnePlus 12R, Android 16, **upgrade over installed vc22** (D1 after B2). Do not uninstall vc22 or clear app data. |

## Configuration (`internal-grin` at `540e07a`) — re-verified 2026-10-07

| Key | Required | At `540e07a` |
|---|---|---|
| `EXPO_PUBLIC_APP_MODE` | `production` | `production` |
| `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` | `"0"` | `"0"` |
| `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` | `"0"` | `"0"` |
| `EXPO_PUBLIC_PLAY_BILLING` | unset / not `"1"` | unset in profile |
| `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED` | `"1"` | `"1"` |
| `EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT` | `"1"` | `"1"` |
| version / versionCode | `1.0.0` / **23** | confirmed via `git show 540e07a:app.json` |

Billing-off Internal GRIN AAB. Not a purchase-test build.

## Backend / Auth (honest; not a B1 grant)

| Item | State |
|---|---|
| Seven GRIN callables | **PRESENT gate=on** (prior Functions v2 PATCH; archives preserved) |
| Authenticated F | **WAITING** — see `AUTH_SMS_DIAGNOSIS.md`. Limit **UNKNOWN**. No invented cooldown. |
| Unauthenticated F denial | **PASS** (prior LIVE run) |
| Non-admitted / cross-owner LIVE | **NOT RUN** |
| P8 (`INCLUDE_GRIN_IN_ACCOUNT_PURGE`) | **false** / FAIL operationally — see `P8_REMAINING_GAP.md` |

**Explicit limitation if B1 proceeds while F waits:** Internal AAB can be
built for install/upgrade pathing; it does **not** prove authenticated LIVE F
or device GRIN end-to-end against a verified owner OTP session.

## B1 result (complete — do not rebuild)

EAS `8c789fa9-705a-4a97-9d87-ba6d6dbd3b88` FINISHED; AAB + mapping archived
outside the repository (access-controlled private storage). Auto-submit was off.

## B2 / D1 (owner authorized 2026-10-07)

- **B2:** upload **this exact** AAB to existing Internal Testing track / existing
  tester audience only. Do not expand testers; do not touch production/open/closed.
- **D1:** owner in-place Play update over vc22 on OnePlus 12R; agent verifies
  package/version after install and guides synthetic GRIN checks. No uninstall,
  clear data, billing, or purge.

## Related

- Auth diagnosis: `docs/release/packets/grin-ops/AUTH_SMS_DIAGNOSIS.md`
- Next OTP attempt: `docs/release/packets/grin-ops/AUTH_NEXT_ATTEMPT.md`
- Phone handoff: `docs/release/proposals/team3/PHONE_HANDOFF.md`
- Execution report: `docs/release/packets/grin-ops/GRIN_PILOT_EXECUTION_REPORT.md`
