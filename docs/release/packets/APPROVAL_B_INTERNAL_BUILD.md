# Approval B — Internal Testing Android build / upload

**Build approval ≠ upload approval.** Neither is granted by this file.
No EAS/native/prebuild/OTA from this packet. No production promotion.

Application SHA to freeze **before** the build request:
`5d5df3d54df08953bfb26db39a9b7f5e3d67ed47`
Canonical CI: `37351685421` / `111903806888`. If application source changes
later, this packet is invalid; assign a new SHA and new CI. Do not cite
`5d5df3d` CI for a later tree. Do not override the ops-tool pin with
`GRIN_OPS_PINNED_SHA` in live mode.

---

## Artifact classes (do not mix)

| Artifact | EAS profile | Type | Use |
|---|---|---|---|
| Play Internal Testing | `internal-grin` | AAB (`app-bundle`) | Only this is the Internal candidate |
| USB / sideload | `preview` or `development` | APK | Separate **NATIVE_DEVICE** artifact. Not a Play upload |

Ordinary `production` / `preview` stay GRIN-off (purchase-entry `"0"`).
A commit label does **not** reconstruct installed vc22.

---

## Frozen Internal-GRIN flags (`eas.json` `build.internal-grin`)

| Key | Value |
|---|---|
| `EXPO_PUBLIC_APP_MODE` | `production` |
| `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` | `"0"` |
| `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` | `"0"` |
| `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED` | `"1"` |
| `EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT` | `"1"` |
| `expo.version` | `1.0.0` |
| package | `com.specialsoftwares.vyaamikkdiary` |

Visibility is **not** backend admission. Server admission is Approval A4.
If this AAB is promoted to production by mistake, GRIN **UI** could appear;
non-seeded uids still fail closed on callables/Rules.

Compile-time purchase flags: changing them later requires a **new** binary.

---

## Play version inventory

### Play Console — NOT RUN this session
No Play Developer API / gcloud here. Last complete Console read: **2026-10-01**
(Internal **vc22 Active**; 23 absent; production Inactive). Owner must re-open
App bundle explorer (unfiltered) immediately before choosing a code.

### EAS Android — RUN 2026-10-06 (not Play tracks)
Account `vydspecial2026` / project `@vydspecial2026/vyaamikk-diary`.
`eas build:list --platform android --limit 50`:

| Finding | Value |
|---|---|
| `internal-grin` builds | **none** |
| Builds of SHA `5d5df3d…` | **none** |
| Highest EAS `appBuildVersion` | **22** |
| versionCode **23** on EAS | **absent** |
| Latest store AAB on EAS | vc**22**, profile `production`, id `72cb7254-0be9-4f92-a514-dbfab2b1150d`, git `0da2f58…` (2026-09-23). **Do not reuse** as Internal-GRIN. |
| `eas submit:list` | `[]` — **not** a Play-track read |

`adb`: no devices this session.

**Before selecting versionCode:** owner records every Play versionCode + track
+ status. Choose unused integer **strictly greater** than the highest
**uploaded** code. If 23 is still unused it **may** be used; `app.json` does
**not** reserve it. Do not re-upload 22.

Write the chosen code into `app.json` immediately before the approved
build, on a clean committed tree. Changing versionCode is an application
commit → new SHA → new CI (do not cite `37351685421` for that tree).

---

## B1 — Build approval (requested separately)

Prerequisites: clean `git status` on deployment paths; HEAD application
tree = `5d5df3d` (or a later approved SHA); inventory recorded; versionCode
written and committed.

Record after EAS (when authorized):

- EAS `buildId`
- `gitCommitHash` matching the tagged commit
- resolved public env from the **build worker**
- AAB sha256
- `bundletool dump manifest` package / versionCode / versionName
- upload-cert role vs Play App Signing (do not commit fingerprints)
- mapping/ProGuard file stored **privately** (not git)

Historical vc22 EAS id `72cb7254-…` is a **different** SHA. Do not reuse.

Upgrade plan: Play-install over Internal vc22 (SQLite v10 additive GRIN
tables). Clean install is a separate device row.

## B2 — Upload approval (requested separately, after B1 evidence)

Internal Testing track only. Verify the Console artifact identity matches
B1. No production track. No store listing submission.

---

## Device execution

Owner/tester sheet: `docs/release/packets/DEVICE_EXECUTION_SHEET.md`.
All rows **NOT RUN** until hardware. Host/emulator is not a device pass.

GRIN end-to-end on device needs Approval A live backend + admission.
Without that, GRIN register rows are `backend_absent`, not a product pass.
While Packet D retention is unset: **synthetic** evidence only.
