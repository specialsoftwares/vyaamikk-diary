# Approval B freeze-prepare — Team 3 (`team/grin-t3-aab-540e07a`)

**Not authorization.** This packet prepares Internal AAB + OnePlus 12R
upgrade handoff. **B1 ≠ B2. Neither granted.** This instruction does
**not** authorize B1 or B2. Named Internal AAB is application `540e07a`.
Recheck Play immediately before B1 remains **required**. Restricted
billing is **not** a prerequisite for this billing-off GRIN Internal AAB.

No EAS/native/prebuild/OTA. No Play upload. No `eas build`. No
`eas submit`. Combined `/Users/shivamsaurav/vyd-worktrees/grin-combined`
was **read-only**. Historical workspace was **read-only**. Do **not**
force-push `origin/team/grin-t3-offline` or
`origin/team/grin-t3-phone-handoff`.

Worktree: `/Users/shivamsaurav/vyd-worktrees/grin-t3-offline`  
Provenance branch: `team/grin-t3-aab-540e07a` (from
`team/grin-t3-phone-handoff` `5692e25`). This branch is **docs
provenance**. It is **not** a B1 checkout. Application blobs on this
branch are **not** the Internal AAB source.

Phone handoff: `docs/release/proposals/team3/PHONE_HANDOFF.md`.

---

## Internal AAB pin (copy this block)

```
Internal AAB SHA:  540e07aa07f376716484adb879ce66cb9fb170ce
B1 checkout:       540e07aa07f376716484adb879ce66cb9fb170ce
                   (not 7e0d629 — that checkout is docs/QA only)
CI-tested checkout: 7e0d629023198333ed384ae076285925e98047d6
                   parent d4c7ed4cb49d1bb5547fe3738702016bd1bcc36f
Canonical CI:      GHA 37445383607 SUCCESS
                   verify job 112208918347 on 7e0d629
                   540e07a..7e0d629 DEPLOYMENT_PATHS empty (docs/QA only)
Do not rebuild alone: 520f9f9 / 56f2040 / 313025f / fcda7cd / 60c4bc1
                   (older packets exist)
Do not cite as this candidate's CI:
                   GHA 37425360211 (520f9f9) or 37440328976 (fcda7cd/70bdfe4)
Version name:      1.0.0 (re-read at 540e07a immediately before B1)
versionCode:       23 UNRESERVED — re-read Play explorer immediately before B1
EAS profile:       internal-grin
Android type:      AAB (app-bundle)
Package:           com.specialsoftwares.vyaamikkdiary
B1 / B2:           neither granted (B1 ≠ B2). Recheck-Play-before-B1 required.
Purchase-entry:    OFF — this is not an interactive purchase-test build
Restricted billing is NOT a prerequisite for this billing-off GRIN Internal AAB.
P8:                FAIL operationally. GRIN synthetic-only until later backend.
```

| Tree | SHA | What it is |
|---|---|---|
| **B1 checkout** | `540e07aa07f376716484adb879ce66cb9fb170ce` | **Only** this |
| CI-tested checkout | `7e0d629023198333ed384ae076285925e98047d6` | Canonical CI SUCCESS; docs/QA after `540e07a`. **Not** a B1 checkout |
| Checkout parent | `d4c7ed4cb49d1bb5547fe3738702016bd1bcc36f` | Parent of `7e0d629` |
| Canonical CI | GHA `37445383607` **SUCCESS**, job `112208918347` | Covers `540e07a` because DEPLOYMENT_PATHS empty. Not a letter. |
| Retired / superseded (do **not** rebuild alone) | `520f9f9` / `56f2040` / `313025f` / `fcda7cd` / `60c4bc1` | Older packets exist |
| Retired matching CI | GHA `37425360211` (`520f9f9`) / GHA `37440328976` (`fcda7cd`/`70bdfe4`) | Not this candidate |

Do not silently retarget to Combined docs HEAD `7e0d629`. Do not start
`eas build` from this provenance branch. A later **material source
change** (versionCode rewrite, purchase-entry / quota / GRIN flag
change) requires a **new binary** and a **new CI**. Do not rebuild from a
dirty tree. Do not reuse historical AAB `72cb7254-…` git `0da2f58`.

See `CURRENT_HEAD_VS_FREEZE.md`.

---

## This GRIN AAB is not a purchase-test build

`internal-grin` at `540e07a`: purchase-entry `"0"`, quota-upsell `"0"`,
`EXPO_PUBLIC_PLAY_BILLING` **unset**. Billing activation is **off**.
Restricted billing is **not** a prerequisite for this billing-off GRIN
Internal AAB. This Internal GRIN build is **not** an interactive
purchase-test build unless a later reviewed configuration enables the
restricted purchase interface **with server-side tester authorization
intact**.

---

## Separate approvals (do not collapse)

| Gate | What it authorizes | This draft |
|---|---|---|
| **B1 — Build** | `eas build --profile internal-grin --platform android` from a **clean** checkout of `540e07a`, after Play inventory is **re-read** and `versionCode` is written/committed if it must change | **not granted** |
| **B2 — Upload** | Play Internal Testing track upload of the B1 AAB only, after B1 evidence (buildId, worker env, AAB sha256, bundletool dump) | **not granted**; requested only after B1 evidence, as a **separate later letter** |

B1 does not imply B2. B2 does not imply production promotion, store
listing Save, or OTA. Sideload APK (`preview` / `development*`) is a
separate `NATIVE_DEVICE` artifact — never the B2 upload.

---

## Package / version / profile / flags (from `eas.json` + `app.json` at `540e07a`)

Verified by `git show 540e07aa07f376716484adb879ce66cb9fb170ce:eas.json`
and `git show 540e07aa07f376716484adb879ce66cb9fb170ce:app.json`.
**Re-read at `540e07a` immediately before B1.** **No** `eas build` /
`eas submit` / `eas config` this session.

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

**GRIN as designed for Internal:** only `internal-grin` bakes GRIN `"1"`
+ store-runtime admit `"1"`. Ordinary `production` is GRIN-off. Preview
APK is sideload only. Play Internal candidate is **only** `internal-grin`
AAB.

Visibility is **not** backend admission (Approval A). Compile-time flags:
changing them later requires a new binary.

`src/goodsEvidence/isolation.contract.test.ts` at `540e07a` asserts
`"versionCode": 23` and `internal-grin` GRIN `"1"`. If Play already has
23 at B1 time, **stop** — do not ship 24+ while that test still requires
23.

Isolation forbids `/PLAY_BILLING/` inside `src/goodsEvidence/**` (not a
live Play Billing on-switch).

---

## Play inventory — **RE-READ immediately before B1**

Last complete unfiltered explorer: **2026-10-06** (Team 3; highest
uploaded **vc22**). That read is **not** current at B1 time. Owner must
re-open App bundle explorer (unfiltered) **immediately before** choosing
a code. Do not treat this packet as a live inventory.

Reminder from that read (stale until re-read):

| Fact | 2026-10-06 |
|---|---|
| Highest **uploaded** | **vc22** Active (Internal Testing, 23 Sept 2026) |
| 23 / 21 / 18 | **absent** (search: No results) |
| Production / open / closed | Inactive |
| versionCode 23 | **UNRESERVED** — unused ≠ reserved |
| Package | `com.specialsoftwares.vyaamikkdiary` |
| Profile | `internal-grin` AAB |
| Signing | Play App Signing at Google; upload key on EAS — no fingerprints in git |
| GRIN flags | `"1"` on `internal-grin` |
| Purchase-entry | `"0"`; quota-upsell `"0"`; `PLAY_BILLING` unset |
| Backend dest | production project `vyaamikk-diary` (`982505811909`) |

Choose an unused integer **strictly greater** than the then-highest
uploaded Play versionCode. Do not re-upload 22.

Android Publisher API was not invoked. Do not use a Firebase token as
Publisher. No Play write this session.

Recheck steps and B1 verification **commands** (not execution):
`PHONE_HANDOFF.md` §§4–5.

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
`vyaamikk-diary.firebasestorage.app`, Functions region `asia-south1`,
seven GRIN callables (`grinRegisterGoodsReceipt`, `grinReconcileCommand`,
`grinMutateGoodsReceipt`, `grinReadGoodsReceipt`, `grinReserveEvidence`,
`grinBeginEvidenceUpload`, `grinUploadEvidence`).

**Live GRIN seven: ABSENT** (complete inventory; last coordinator
inspect). XR / original-read stay **N/A until backend**. Until lifecycle
is approved: **synthetic** GRIN only.

Without live callables + seeded admission, GRIN register rows are
`backend_absent` / `blocked_by_runtime` — not a product pass. Useful
GRIN device tests need **later** backend.

---

## B1 evidence to record (when owner authorizes later)

Prerequisites: **B1 letter** (not granted); **clean** checkout of
`540e07aa07f376716484adb879ce66cb9fb170ce`; Play inventory **re-read**;
versionCode written and committed if it must change. Do **not** checkout
`7e0d629` as the B1 source.

Commands (do not run now): `PHONE_HANDOFF.md` §5.

- EAS `buildId`
- `gitCommitHash` matching `540e07aa07f376716484adb879ce66cb9fb170ce`
- resolved public env from the **build worker** (not only `eas.json`)
- AAB sha256
- `bundletool dump manifest` package / versionCode / versionName
- upload-cert role vs Play App Signing (do not commit fingerprints)
- mapping/ProGuard stored **privately** (not git)

## B2 (later, separate letter)

Internal Testing track only. Console artifact identity must match B1. No
production track. No store listing submission. **Do not request B2 in
the same letter as B1.**

Owner form: `docs/release/proposals/team3/OWNER_DEVICE_FORM.md`  
Phone handoff: `docs/release/proposals/team3/PHONE_HANDOFF.md`  
Sheet: `docs/release/packets/DEVICE_EXECUTION_SHEET.md`  
Scripts (no AAB required to prepare; no phone = **NOT RUN**):
`docs/release/proposals/team3/device/`  
Host SQLite / mounted inert React / emulator / CI are **not**
physical-device evidence.
