# Internal AAB packet — application `540e07a` (prepared; B1/B2 unexecuted)

**Not authorization.** Do not run `eas build`, `eas submit`, Play upload, OTA,
or prebuild from this file. Existing A–F backend approval does not grant B1/B2.

Updated **2026-10-06** after LIVE Functions v2 PATCH enable of the seven GRIN
callables (**gate=on**). Purchase-entry remains `"0"`. B1/B2 still unexecuted.

---

## Artifact identity (required)

| Item | Value |
|---|---|
| **B1 checkout / AAB SHA** | `540e07aa07f376716484adb879ce66cb9fb170ce` |
| CI-tested checkout | `7e0d629023198333ed384ae076285925e98047d6` (parent `d4c7ed4…`) |
| Canonical CI | GHA **`37445383607` SUCCESS**, verify job **`112208918347`** |
| `540e07a`..`7e0d629` on `DEPLOYMENT_PATHS` | **empty** (docs/QA only) |
| Do **not** rebuild alone | `520f9f9` / `56f2040` / `313025f` / `fcda7cd` / `60c4bc1` |
| Package | `com.specialsoftwares.vyaamikkdiary` |
| EAS profile | `internal-grin` → Android **AAB** (`app-bundle`) |
| Version name | `1.0.0` — re-read at `540e07a` immediately before B1 |
| versionCode | **23 UNRESERVED** — recheck Play App bundle explorer **immediately before B1** |
| Device path | OnePlus 12R, Android 16, upgrade over installed **vc22** (D1 after B2) |

## Current configuration (`internal-grin` at `540e07a`)

| Key | Required value |
|---|---|
| `EXPO_PUBLIC_APP_MODE` | `production` |
| `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` | `"0"` |
| `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` | `"0"` |
| `EXPO_PUBLIC_PLAY_BILLING` | unset / not `"1"` |
| `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED` | `"1"` |
| `EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT` | `"1"` |

Billing-off Internal GRIN AAB. Not a purchase-test build. P8
(`INCLUDE_GRIN_IN_ACCOUNT_PURGE`) remains **false** / FAIL operationally.

## Backend state relevant to phone (not a B1 grant)

| Item | State |
|---|---|
| Seven GRIN callables | **PRESENT gate=on** (Functions v2 PATCH; archives preserved) |
| Authenticated F | Client phone OTP on local sign-in surface (no IAM expansion) |
| Cross-owner LIVE | **NOT RUN** |

## Pre-B1 checklist (owner letter required; not done)

1. Fresh Play App bundle explorer: highest uploaded code; confirm **23** still free.
2. Clean git worktree at exactly `540e07a` (not Combined docs HEAD alone).
3. `eas.json` / `app.json` flags match the table above.
4. Then only: `eas build --profile internal-grin` of `540e07a`.

## B2 / D1 (separate letters; not granted)

- **B2:** upload that AAB to Play Internal Testing.
- **D1:** upgrade OnePlus 12R over vc22; capture device result template under
  `docs/release/proposals/team3/device/`.

## Related

- Phone handoff: `docs/release/proposals/team3/PHONE_HANDOFF.md`
- Execution report: `docs/release/packets/grin-ops/GRIN_PILOT_EXECUTION_REPORT.md`
- Older Approval B draft (stale SHA `520f9f9`): `docs/release/packets/APPROVAL_B_INTERNAL_BUILD.md` — **superseded for SHA by this packet / PHONE_HANDOFF**
