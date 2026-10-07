# Approval B — Internal Testing Android build / upload

**Freeze assigned. B1 and B2 not granted.** Do **not** build from historical
pin `5d5df3d` / CI `37351685421` or from pre-S1/S2 `b845e8a`.

Freeze draft: `docs/release/proposals/team3/APPROVAL_B_DRAFT.md`  
Owner device form (blank): `docs/release/proposals/team3/OWNER_DEVICE_FORM.md`

```
Application SHA: 520f9f98bc952fd7f30a907da9e85774629a69c0
Canonical CI:    GHA 37425360211 / job 112143748428 / head 0d7aa17 success
Version name:    1.0.0
versionCode:     23 UNRESERVED
EAS profile:     internal-grin (AAB)
Package:         com.specialsoftwares.vyaamikkdiary
```

**Build approval ≠ upload approval.** Neither is granted by this file.
No EAS/native/prebuild/OTA from this packet. No production promotion.
Re-read Play App bundle explorer immediately before B1. Do not cite
`37379529193` or `37351685421` for this freeze. Do not env-override
`PINNED_APP_SHA` in live mode.

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

`eas config --platform android --profile internal-grin` (Team 3, 2026-10-06,
`npx eas-cli@16.28.0`, no mutation): profile env as above; resolved
`distribution=store`; overlap warning remote production `EXPO_PUBLIC_APP_MODE`
vs profile — **profile wins**. `git status` unchanged.

---

## Play version inventory

### Play Console — NOT RUN 2026-10-06 (2026-10-01 read is STALE)

Do **not** reuse Internal vc22 Active / 23 absent as current fact. Do **not**
reuse “catalog empty.” Do **not** invent versionCodes. Firebase ADC was **not**
used as Android Publisher.

Exact blockers this session (Team 3):

1. `support.vyd@specialsoftwares.com` redirected to
   `https://play.google.com/console/u/0/accept-terms`. Terms **not** accepted.
2. `aeadmin@specialsoftwares.com` password challenge: **“Too many failed
   attempts.”** Password not entered.
3. `gcloud` / `googleapiclient` absent. `eas submit:list` is **not** a command
   in `eas-cli@16.28.0` (`command submit:list not found`) — not a Play-track
   read.

Owner must re-open App bundle explorer (unfiltered) immediately before
choosing a code.

### EAS Android — RUN 2026-10-06 (not Play tracks)

Account `vydspecial2026` / project `@vydspecial2026/vyaamikk-diary`.
`npx eas-cli@16.28.0 build:list --platform android --limit 50 --non-interactive --json`
(28 Android builds):

| Finding | Value |
|---|---|
| `internal-grin` builds | **none** |
| Builds of SHA `5d5df3d…` | **none** |
| Highest EAS `appBuildVersion` | **22** |
| versionCode **23** on EAS | **absent** |
| Latest store AAB on EAS | vc**22**, profile `production`, id `72cb7254-0be9-4f92-a514-dbfab2b1150d`, git `0da2f58…` (2026-09-23). **Do not reuse** as Internal-GRIN. **Not this SHA.** |
| EAS vc21 | `5e1e124b-…`, same git `0da2f58…`. Finished on EAS ≠ uploaded to Play |

`adb devices -l`: empty this session.

**Before selecting versionCode:** owner records every Play versionCode + track
+ status. Choose unused integer **strictly greater** than the highest
**uploaded** code. If 23 is still unused it **may** be used; `app.json` does
**not** reserve it. Do not re-upload 22.

Write the chosen code into `app.json` immediately before the approved
build, on a clean committed tree. Changing versionCode is an application
commit → new SHA → new CI (do not cite `37351685421` for that tree).
`src/goodsEvidence/isolation.contract.test.ts` currently asserts
`"versionCode": 23`. If Play already has 23, **stop** and cut that new SHA
together with the isolation assertion — do not ship 24+ while the test
still requires 23.

---

## B1 — Build approval (requested separately)

Prerequisites: clean `git status` on deployment paths; HEAD is the
**coordinator freeze SHA** (no longer `5d5df3d` after the tester-allowlist
integration; Team 2 may move it again); inventory recorded; versionCode
written and committed. Do not cite CI `37351685421` for a later tree.

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
All executable rows **NOT RUN** until hardware. XR is **N/A until backend**.
Host/emulator is not a device pass. Freeze draft:
`docs/release/proposals/team3/APPROVAL_B_DRAFT.md`. Handoff:
`docs/release/proposals/team3/DEVICE_HANDOFF.md`.

GRIN end-to-end on device needs Approval A live backend + admission.
Without that, GRIN register rows are `backend_absent`, not a product pass.
While Packet D retention is unset: **synthetic** evidence only.
