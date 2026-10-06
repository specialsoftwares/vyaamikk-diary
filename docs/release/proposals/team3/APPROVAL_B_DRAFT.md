# Approval B freeze-prepare — Team 3 (`candidate-1310`)

**Not authorization.** Build approval ≠ upload approval. Neither is granted
by this file. No EAS/native/prebuild/OTA. No Play upload. No `eas build`.
No `eas submit`. Combined `/Users/shivamsaurav/vyd-worktrees/grin-combined`
was **read-only**. Historical workspace was **read-only**. `gh` unauthenticated
this session — CI claims below are from the already-recorded freeze packet,
not a fresh GitHub API read.

Worktree: `/Users/shivamsaurav/vyd-worktrees/grin-t3-offline`  
Provenance branch: `team/grin-t3-candidate-1310` (from `team/grin-t3-freeze`
`d4a8197`). Do **not** force-push `origin/team/grin-t3-offline`.

**This branch is docs provenance.** It is **not** a B1 checkout. Application
blobs on this branch are **not** `56f2040`. B1, if later authorized, must use
a **clean** checkout of the named freeze-prepare SHA (or its retarget).

---

## 520f9f9 freeze — RETIRED for new builds

Do **not** build `520f9f98bc952fd7f30a907da9e85774629a69c0` merely because an
older `APPROVAL_B_DRAFT` freeze packet exists. That pin is **retired** for
new Internal AAB builds.

Canonical GHA **`37425360211`** / job **`112143748428`** / head **`0d7aa17`**
covers **`520f9f9` only**. Do not cite it as CI for `56f2040`. Helper-pin
tree `0d7aa17` is **520f9f9-era** — not a B1 checkout for this packet.

Historical `docs/release/packets/APPROVAL_B_INTERNAL_BUILD.md` (`5d5df3d`)
is older still and is **not** this candidate.

---

## Freeze-prepare pin (copy this block)

```
Application SHA (named, will retarget):
                 56f2040e30159579edc0cbfbc88e2ba706a6abd2
Canonical CI:    NOT RUN on 56f2040
                 GHA 37425360211 covers 520f9f9 only — do not reuse
Version name:    1.0.0
versionCode:     23 UNRESERVED — re-read Play explorer immediately before B1
EAS profile:     internal-grin
Android type:    AAB (app-bundle)
Package:         com.specialsoftwares.vyaamikkdiary
B1 / B2:         neither granted (B1 ≠ B2)
```

| Tree | SHA | What it is |
|---|---|---|
| **Named freeze-prepare** | `56f2040e30159579edc0cbfbc88e2ba706a6abd2` | Combined **application** (verified). T2 capacity/cleanup fold. **Will retarget** when T2 commits owner-choice (Starter **1 GiB** / Professional **3 GiB** / Business **10 GiB** + **45-day** deletion) after `2cebe32`. |
| T2 worktree HEAD (2026-10-06 this session) | `2cebe32a8a78dc1928c5abc984a29887ccf7a954` | **No** commit after `2cebe32` on `/Users/shivamsaurav/vyd-worktrees/grin-t2-evidence`. Owner-choice **not** yet an application SHA. |
| Combined docs (observed, read-only) | `c45518a89a22ac3134e1b9e56f2c9ee97142ac1f` | Coordinator note: owner 1/3/10 GiB + 45-day; retire 520f9f9 as build target. `git diff --stat 56f2040 c45518a -- functions src eas.json app.json` **empty**. **Not** an application SHA. Coordinator-owned. |
| Retired freeze | `520f9f98bc952fd7f30a907da9e85774629a69c0` | S1/S2 application. **Do not build.** |
| Retired matching CI | GHA `37425360211` | Covers `520f9f9` only. |

`56f2040` is a descendant of `520f9f9`. `git diff --stat 520f9f9 56f2040 -- functions src tools/goods-evidence-storage` is **non-empty** (quota/cleanup). That is a **new application**, not a docs-only advance.

**B1 must not build `520f9f9`.** Do not silently retarget to Combined docs HEAD.
Do not start `eas build` from this provenance branch. A later **retarget**
needs the T2 owner-choice SHA **and** matching canonical CI.

A later **material source change** (T2 1/3/10+45-day, versionCode rewrite,
purchase-entry/quota/GRIN flag change, or any other application commit)
requires a **new binary** and a **new CI**. Do not rebuild from a dirty tree.
Do not reuse historical AAB `72cb7254-…` git `0da2f58`.

---

## Separate approvals (do not collapse)

| Gate | What it authorizes | This draft |
|---|---|---|
| **B1 — Build** | `eas build --profile internal-grin --platform android` from a **clean** checkout of the **then-current freeze SHA** (named `56f2040` until retarget), after Play inventory is **re-read** and `versionCode` is written/committed if it must change | **not granted** |
| **B2 — Upload** | Play Internal Testing track upload of the B1 AAB only, after B1 evidence (buildId, worker env, AAB sha256, bundletool dump) | **not granted**; requested only after B1 evidence |

B1 does not imply B2. B2 does not imply production promotion, store listing
Save, or OTA. Sideload APK (`preview` / `development*`) is a separate
`NATIVE_DEVICE` artifact — never the B2 upload.

---

## Package / version / profile / flags (from `eas.json` + `app.json` at `56f2040`)

Verified by `git show 56f2040:eas.json` and `git show 56f2040:app.json`.
**No** `eas build` / `eas submit` / `eas config` this session.

| Key | `internal-grin` | `production` / `preview` |
|---|---|---|
| package | `com.specialsoftwares.vyaamikkdiary` | same |
| `expo.version` | `1.0.0` | same |
| `android.versionCode` in `app.json` | 23 (**unreserved** on Play) | same |
| Android `buildType` | **`app-bundle`** | `app-bundle` / preview **`apk`** |
| `EXPO_PUBLIC_APP_MODE` | `production` | `production` |
| `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` | `"0"` | `"0"` |
| `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` | `"0"` | `"0"` |
| `EXPO_PUBLIC_PLAY_BILLING` | **unset** (not `"1"`) | unset |
| `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED` | **`"1"`** | unset (not `"1"`) |
| `EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT` | **`"1"`** | unset (not `"1"`) |
| `autoIncrement` | `false` | `false` |
| `environment` | `production` | production / preview |
| Prior resolved `distribution` (`eas config` 2026-10-06, not re-run) | `store` | production `store`; preview `internal` |

**PLAY_BILLING off** for Internal: purchase-entry `"0"`, quota-upsell `"0"`,
`EXPO_PUBLIC_PLAY_BILLING` unset. Isolation contract forbids `/PLAY_BILLING/`
inside `src/goodsEvidence/**` (not a live Play Billing on-switch).

**GRIN as designed for Internal:** only `internal-grin` bakes GRIN `"1"` +
store-runtime admit `"1"`. Ordinary `production` is GRIN-off. Preview APK is
sideload only.

Play Internal candidate is **only** `internal-grin` AAB.

Visibility is **not** backend admission (Approval A). Compile-time flags:
changing them later requires a new binary.

`src/goodsEvidence/isolation.contract.test.ts` at `56f2040` asserts
`"versionCode": 23` and `internal-grin` GRIN `"1"`. If Play already has 23
at B1 time, **stop** — do not ship 24+ while that test still requires 23.

---

## Play inventory — **RE-READ immediately before B1**

Last complete unfiltered explorer: **2026-10-06** (Team 3; highest uploaded
**vc22**). That read is **not** current at B1 time. Owner must re-open App
bundle explorer (unfiltered) **immediately before** choosing a code. Do not
treat this packet as a live inventory.

Reminder from that read (stale until re-read):

| Fact | 2026-10-06 |
|---|---|
| Highest **uploaded** | **vc22** Active (Internal Testing, 23 Sept 2026) |
| 23 / 21 / 18 | **absent** (search: No results) |
| Production / open / closed | Inactive |
| versionCode 23 | **UNRESERVED** — unused ≠ reserved |

Choose an unused integer **strictly greater** than the then-highest uploaded
Play versionCode. Do not re-upload 22.

Android Publisher API was not invoked. Do not use a Firebase token as
Publisher. No Play write this session.

---

## Signing roles (no fingerprints in git)

| Role | Holder | This packet |
|---|---|---|
| Play App Signing key | Google Play | Do not export; do not commit fingerprints |
| Upload key | EAS Android credentials for `@vydspecial2026/vyaamikk-diary` | Do not print fingerprints into git |
| Mapping / ProGuard | private store after B1 | Not git |

---

## Backend destination (useful GRIN device test)

Intended later destination (Approval A, **not** present now): Firebase /
GCP project `vyaamikk-diary` (`982505811909`), bucket
`vyaamikk-diary.firebasestorage.app`, Functions region `asia-south1`, seven
GRIN callables (`grinRegisterGoodsReceipt`, `grinReconcileCommand`,
`grinMutateGoodsReceipt`, `grinReadGoodsReceipt`, `grinReserveEvidence`,
`grinBeginEvidenceUpload`, `grinUploadEvidence`).

**Live GRIN seven: ABSENT** (complete inventory; last coordinator inspect).
XR / original-read stay **N/A until backend**. Until lifecycle is approved:
**synthetic** GRIN only.

Without live callables + seeded admission, GRIN register rows are
`backend_absent` / `blocked_by_runtime` — not a product pass. Useful GRIN
device tests need **later** backend.

---

## B1 evidence to record (when owner authorizes later)

Prerequisites: freeze SHA **retarget settled** (or owner explicitly accepts
`56f2040` knowing it will be superseded); **clean** checkout of that SHA;
Play inventory **re-read**; versionCode written and committed if it must
change.

- EAS `buildId`
- `gitCommitHash` matching the tagged freeze SHA
- resolved public env from the **build worker** (not only `eas.json`)
- AAB sha256
- `bundletool dump manifest` package / versionCode / versionName
- upload-cert role vs Play App Signing (do not commit fingerprints)
- mapping/ProGuard stored **privately** (not git)

## B2 (later, separate)

Internal Testing track only. Console artifact identity must match B1. No
production track. No store listing submission.

Owner form: `docs/release/proposals/team3/OWNER_DEVICE_FORM.md`  
Sheet: `docs/release/packets/DEVICE_EXECUTION_SHEET.md`  
Scripts (no AAB required to prepare; no phone = **NOT RUN**):
`docs/release/proposals/team3/device/`  
Host SQLite / mounted inert React are not physical-device evidence.
