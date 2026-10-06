# Internal AAB packet — B1 READY FOR OWNER DECISION

**Not authorization.** Do not run `eas build`, `eas submit`, Play upload, OTA,
or prebuild until the owner grants **B1**. Existing A–F backend approval does
**not** grant B1/B2. Authenticated F pending does **not** block preparing an
Internal test build; that limitation must stay explicit on the build.

Updated **2026-10-07**. Tooling-only Auth harness published separately
(`20df6b9`); **application pin unchanged**.

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
| Version name | `1.0.0` at `540e07a` — re-read immediately before B1 |
| versionCode | **23 in source — UNRESERVED until Play recheck** (do not assume reserved) |
| Signing | Play App Signing at Google; upload key on EAS `@vydspecial2026/vyaamikk-diary` (no fingerprints in git) |
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

## Pre-B1 checklist (owner letter required)

1. **Play App bundle explorer (unfiltered) immediately before build** — highest uploaded code; confirm **23** still free. Unused ≠ reserved.
2. Clean git worktree at exactly `540e07a` (not Combined docs HEAD alone).
3. Re-read `eas.json` / `app.json` flags match the table above.
4. Only then: `eas build --profile internal-grin --platform android` of `540e07a`.

## B1 request (decision only)

**Request:** Owner approval to run **B1** = EAS Internal AAB build of application
`540e07aa07f376716484adb879ce66cb9fb170ce` with profile `internal-grin`, after
fresh Play inventory confirms versionCode **23** (or a newly committed free
code if 23 is taken).

**Not requested here:** B2 upload, D1 device, billing activation, purge
activation, main merge, public release.

## B2 / D1 (separate letters; not granted)

- **B2:** upload that AAB to Play Internal Testing.
- **D1:** upgrade OnePlus 12R over vc22; capture device result under
  `docs/release/proposals/team3/device/`.

## Related

- Auth diagnosis: `docs/release/packets/grin-ops/AUTH_SMS_DIAGNOSIS.md`
- Next OTP attempt: `docs/release/packets/grin-ops/AUTH_NEXT_ATTEMPT.md`
- Phone handoff: `docs/release/proposals/team3/PHONE_HANDOFF.md`
- Execution report: `docs/release/packets/grin-ops/GRIN_PILOT_EXECUTION_REPORT.md`
