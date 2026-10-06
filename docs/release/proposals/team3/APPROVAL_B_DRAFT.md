# Approval B freeze draft — Team 3

**Not authorization.** Build approval ≠ upload approval. Neither is granted
by this file. No EAS/native/prebuild/OTA. No Play upload. No `eas build`.
No `eas submit`. Combined `/Users/shivamsaurav/vyd-worktrees/grin-combined`
(`aea65c1`, docs-only) was **read-only**. Historical workspace was **read-only**.

Worktree: `/Users/shivamsaurav/vyd-worktrees/grin-t3-offline`  
Provenance branch: `team/grin-t3-freeze` (do not force-push `team/grin-t3-offline`).

---

## Freeze pin (copy this block)

```
Application SHA: 520f9f98bc952fd7f30a907da9e85774629a69c0
Canonical CI:    GitHub Actions run 37425360211
                 job 112143748428
                 head 0d7aa17a6efcf3ce6874269eb57afda0a2b45559
                 success (verify + canonical gate; skipped none observed)
Version name:    1.0.0
versionCode:     23 UNRESERVED — re-read Play explorer immediately before B1
EAS profile:     internal-grin
Package:         com.specialsoftwares.vyaamikkdiary
```

Do **not** cite GHA `37379529193` (`41b05a4`) or `37351685421` (`5d5df3d`)
for this freeze.

| Tree | SHA | What it is |
|---|---|---|
| **Application freeze** | `520f9f98bc952fd7f30a907da9e85774629a69c0` | S1/S2 application. Clean checkout for the AAB. |
| CI / helper-pin HEAD | `0d7aa17a6efcf3ce6874269eb57afda0a2b45559` | Canonical CI head. Adds Functions helper pin to `520f9f9` (plus intervening test-script/`package.json` wiring). `git diff --stat 520f9f9 0d7aa17 -- functions src eas.json app.json app firebase.json tools/goods-evidence-storage` **empty**. Use `0d7aa17` only if the owner insists the helper pin is in the freeze tree. Application blobs remain `520f9f9`. |
| Combined docs | `aea65c170adb25f09ca1045593f18847df2f3b30` | Docs-only after `0d7aa17`. **Not** an application SHA. Coordinator-owned. |

A later **material source change** (versionCode rewrite, purchase-entry/quota/GRIN
flag change, or any other application commit) requires a **new binary** and a
**new CI**. Do not rebuild from a dirty tree. Do not reuse historical AAB
`72cb7254-…` git `0da2f58`.

---

## Separate approvals (do not collapse)

| Gate | What it authorizes | This draft |
|---|---|---|
| **B1 — Build** | `eas build --profile internal-grin --platform android` from a **clean** checkout of **`520f9f9`** (or `0d7aa17` if helper pin must be in-tree), after Play inventory is **re-read** and `versionCode` is written/committed if it must change | **not granted** |
| **B2 — Upload** | Play Internal Testing track upload of the B1 AAB only, after B1 evidence (buildId, worker env, AAB sha256, bundletool dump) | **not granted**; requested only after B1 evidence |

B1 does not imply B2. B2 does not imply production promotion, store listing
Save, or OTA. Sideload APK (`preview` / `development*`) is a separate
`NATIVE_DEVICE` artifact — never the B2 upload.

---

## Package / version / profile / flags (from `eas.json` + `app.json` at `520f9f9`)

Verified by `git show 520f9f9:eas.json` and `git show 520f9f9:app.json`.
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
| `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED` | **`"1"`** | unset (not `"1"`) |
| `EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT` | **`"1"`** | unset (not `"1"`) |
| `autoIncrement` | `false` | `false` |
| `environment` | `production` | production / preview |
| Prior resolved `distribution` (`eas config` 2026-10-06, not re-run) | `store` | production `store`; preview `internal` |

Play Internal candidate is **only** `internal-grin` AAB. Ordinary `production`
is the wrong AAB (GRIN-off). Preview APK is sideload only.

Visibility is **not** backend admission (Approval A). Compile-time flags:
changing them later requires a new binary.

`src/goodsEvidence/isolation.contract.test.ts` at `520f9f9` asserts
`"versionCode": 23` and `internal-grin` GRIN `"1"`. If Play already has 23
at B1 time, **stop** — do not ship 24+ while that test still requires 23.

---

## Play inventory — **RE-READ immediately before B1**

Last complete unfiltered explorer: **2026-10-06T05:51Z–05:53Z**. That read
is **not** current at B1 time. Owner must re-open App bundle explorer
(unfiltered) immediately before choosing a code.

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
Publisher.

---

## Signing roles (no fingerprints in git)

| Role | Holder | This packet |
|---|---|---|
| Play App Signing key | Google Play | Do not export; do not commit fingerprints |
| Upload key | EAS Android credentials for `@vydspecial2026/vyaamikk-diary` | Do not print fingerprints into git |
| Mapping / ProGuard | private store after B1 | Not git |

---

## Backend prerequisite (useful GRIN device test)

Approval A live GRIN is **NOT present**. Coordinator inspect: GRIN seven
**ABSENT** (complete inventory). XR / original-read stay **N/A until backend**.
Until lifecycle is approved: **synthetic** GRIN only.

Without live callables + seeded admission, GRIN register rows are
`backend_absent` / `blocked_by_runtime` — not a product pass.

---

## B1 evidence to record (when owner authorizes later)

Prerequisites: clean checkout of `520f9f9` (or `0d7aa17`); Play inventory
**re-read**; versionCode written and committed if it must change.

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

Device form (blank): `docs/release/proposals/team3/OWNER_DEVICE_FORM.md`  
Sheet: `docs/release/packets/DEVICE_EXECUTION_SHEET.md` — all executable
rows **NOT RUN**. `adb` empty. Host SQLite / mounted inert React are not
physical-device evidence.
