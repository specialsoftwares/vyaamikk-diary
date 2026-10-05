# Approval B freeze draft — Team 3

**Not authorization.** Build approval ≠ upload approval. Neither is granted
by this file. No EAS/native/prebuild/OTA. No Play upload. No `eas build`.
No `eas submit`.

Worktree: `/Users/shivamsaurav/vyd-worktrees/grin-t3-offline`  
Branch: `team/grin-t3-offline` @ `aa5253e4e070195227055cde836d6b528d5e0070`  
Historical dirty workspace and `grin-combined` were not edited.

---

## Freeze pin (copy this block)

```
Application SHA: 5d5df3d54df08953bfb26db39a9b7f5e3d67ed47
Canonical CI:    37351685421
Version name:    1.0.0
versionCode:     23  — UNRESERVED (do not assume it remains available)
EAS profile:     internal-grin
Package:         com.specialsoftwares.vyaamikkdiary
```

This SHA **will change** if Team 2 source lands and the coordinator assigns a
new application SHA. Do not cite `5d5df3d` / CI `37351685421` for a later tree.

A later **material source change** (Team 2 merge, versionCode rewrite,
purchase-entry/quota/GRIN flag change, or any other application commit)
requires a **new binary**. Do not rebuild from a dirty tree. Do not reuse
historical AAB `72cb7254-…` git `0da2f58`.

---

## Separate approvals (do not collapse)

| Gate | What it authorizes | This draft |
|---|---|---|
| **B1 — Build** | `eas build --profile internal-grin --platform android` from a **clean** tree whose HEAD application SHA is the frozen pin (or a later coordinator SHA), after Play inventory is recorded and `versionCode` is written/committed if it must change | **not granted** |
| **B2 — Upload** | Play Internal Testing track upload of the B1 AAB only, after B1 evidence (buildId, worker env, AAB sha256, bundletool dump) | **not granted**; requested only after B1 evidence |

B1 does not imply B2. B2 does not imply production promotion, store listing
Save, or OTA.

---

## Frozen Internal-GRIN flags

Source: `eas.json` `build.internal-grin`. Resolved 2026-10-06 by
`npx eas-cli@16.28.0 config --platform android --profile internal-grin`
(configuration only; **no mutation**; `git status` unchanged). Profile env
wins on overlap with EAS remote `production` env (`EXPO_PUBLIC_APP_MODE`).

| Key | Value |
|---|---|
| `EXPO_PUBLIC_APP_MODE` | `production` |
| `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` | `"0"` |
| `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` | `"0"` |
| `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED` | `"1"` |
| `EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT` | `"1"` |
| Android `buildType` | `app-bundle` |
| Resolved `distribution` | `store` |
| `autoIncrement` | `false` |
| `environment` | `production` |

GRIN flags are exact `"1"` **only** on `internal-grin`. Ordinary
`production` / `preview` leave GRIN unset (not `"1"`) and keep purchase-entry
and quota-upsell `"0"`. Preview is APK / `distribution: internal` — sideload
only, not a Play Internal AAB.

Visibility is **not** backend admission (Approval A). Compile-time flags:
changing them later requires a new binary.

`app.json` currently has `"versionCode": 23` and `"version": "1.0.0"`. That
does **not** reserve 23 on Play. `src/goodsEvidence/isolation.contract.test.ts`
asserts `"versionCode": 23`. If Play already has 23, **stop** — do not ship
24+ while that test still requires 23; cut a new SHA with both changes.

---

## Inventory that must be true before B1

### Play uploaded-version inventory — **NOT RUN** this session (2026-10-06)

Do **not** reuse the 2026-10-01 Console read (Internal vc22 Active; 21/18/23
absent; Production Inactive) as current fact. Do **not** reuse “catalog empty.”
Do **not** invent versionCodes.

Exact blockers:

1. Play Console (browser, `support.vyd@specialsoftwares.com`): navigation to
   App bundle explorer redirected to
   `https://play.google.com/console/u/0/accept-terms` (“Review Terms of
   Service”). Terms were **not** accepted.
2. Switch to `aeadmin@specialsoftwares.com`: Google password challenge at
   `accounts.google.com/v3/signin/challenge/pwd` with heading
   **“Too many failed attempts.”** Password was not entered.
3. Android Publisher API: **not invoked**. Firebase / `support.vyd` ADC was
   **not** used as Android Publisher. `gcloud` absent; Python
   `googleapiclient` absent. `eas submit:list` is not a command in
   `eas-cli@16.28.0` (`Error: command submit:list not found`).

Owner must re-open App bundle explorer (unfiltered) immediately before
choosing a code. Choose an unused integer **strictly greater** than the
highest **uploaded** Play versionCode. If 23 is still unused it **may** be
used; it is **not reserved**.

### EAS Android — RUN 2026-10-06 (not Play tracks)

`npx eas-cli@16.28.0 build:list --platform android --limit 50 --non-interactive --json`  
Account `vydspecial2026` / project `@vydspecial2026/vyaamikk-diary`
(`00bb47ff-b22f-4a64-ace8-a0e7275fd2a1`). 28 Android builds. No mutation.

| Finding | Value |
|---|---|
| `internal-grin` builds | **none** |
| Builds of SHA `5d5df3d…` | **none** |
| Highest EAS `appBuildVersion` | **22** |
| versionCode **23** on EAS | **absent** |
| Latest store AAB on EAS | vc**22**, profile `production`, id `72cb7254-0be9-4f92-a514-dbfab2b1150d`, git `0da2f58970f23c7ce6cbefae6efffd49c731f44b` (2026-09-23). **Do not reuse** as Internal-GRIN. **Not this SHA.** |
| EAS vc21 | `5e1e124b-…`, profile `production`, same git `0da2f58…`. Finished on EAS ≠ uploaded to Play |
| Sideload vs Play | `preview` / `development*` are APK/`INTERNAL`. Play Internal candidate is **only** `internal-grin` AAB |

---

## B1 evidence to record (when owner authorizes later)

- EAS `buildId`
- `gitCommitHash` matching the tagged freeze SHA
- resolved public env from the **build worker** (not only `eas config`)
- AAB sha256
- `bundletool dump manifest` package / versionCode / versionName
- upload-cert role vs Play App Signing (do not commit fingerprints)
- mapping/ProGuard stored **privately** (not git)

## B2 (later, separate)

Internal Testing track only. Console artifact identity must match B1. No
production track. No store listing submission.

Device sheet: `docs/release/packets/DEVICE_EXECUTION_SHEET.md` — all
executable rows **NOT RUN** (expiry-read **N/A until backend**).
