# Approval B freeze-prepare — Team 3 (`team/grin-t3-phone-handoff`)

**Not authorization.** This packet prepares Internal AAB + OnePlus 12R
upgrade handoff. **B1 ≠ B2. Neither granted.** This instruction does
**not** authorize B1 or B2. Coordinator will not build until a complete
batch is lettered **after billing-lifecycle correction + matching
completed canonical CI**.

No EAS/native/prebuild/OTA. No Play upload. No `eas build`. No
`eas submit`. Combined `/Users/shivamsaurav/vyd-worktrees/grin-combined`
was **read-only**. Historical workspace was **read-only**. Do **not**
force-push `origin/team/grin-t3-offline`.

Worktree: `/Users/shivamsaurav/vyd-worktrees/grin-t3-offline`  
Provenance branch: `team/grin-t3-phone-handoff` (from
`team/grin-t3-candidate-1310` `21fac5b`). This branch is **docs
provenance**. It is **not** a B1 checkout. Application blobs on this
branch are **not** the Internal AAB source.

Phone handoff: `docs/release/proposals/team3/PHONE_HANDOFF.md`.

---

## Internal AAB pin (copy this block)

```
Internal AAB SHA:  coordinator-selected FINAL application SHA
                   after billing-lifecycle correction + matching
                   completed canonical CI — not an intermediate
Current app blobs (observation only, may be superseded):
                   fcda7cd64e9622e50c38223a7156f0f6b8ca5576
Docs HEAD observed (not a B1 checkout):
                   70bdfe4b2ea2a7cf6a9fe5f1cf7bf08ff6ebc4e9
                   (application blobs = fcda7cd)
Canonical CI:      GHA 37440328976 IN_PROGRESS on 70bdfe4
                   (verify job 112192249694). IN_PROGRESS ≠ matching CI.
                   Do not cite GHA 37425360211 (covers 520f9f9 only).
Do not build alone: 520f9f9 / 56f2040 / 313025f
Version name:      1.0.0 (re-read at FINAL SHA)
versionCode:       23 UNRESERVED — re-read Play explorer immediately before B1
EAS profile:       internal-grin
Android type:      AAB (app-bundle)
Package:           com.specialsoftwares.vyaamikkdiary
B1 / B2:           neither granted (B1 ≠ B2)
Purchase-entry:    OFF — this is not an interactive purchase-test build
```

| Tree | SHA | What it is |
|---|---|---|
| **B1 checkout** | Coordinator-selected **FINAL** application SHA after billing-lifecycle correction **and** matching **completed** canonical CI | **Only** this |
| Current application (may be superseded) | `fcda7cd64e9622e50c38223a7156f0f6b8ca5576` | Restricted Play-tester SOURCE on 1/3/10 GiB + 45-day. T5 SOURCE+INJECTED PASS does **not** grant B1. **Do not treat as FINAL** if correction lands later |
| Combined docs HEAD | `70bdfe4b2ea2a7cf6a9fe5f1cf7bf08ff6ebc4e9` | Docs; application blobs **= `fcda7cd`**. **Not** a B1 checkout |
| Canonical CI | GHA `37440328976` **IN_PROGRESS** | Checkout `70bdfe4`. Not success. Not a letter. |
| Retired / superseded (do **not** build alone) | `520f9f98bc952fd7f30a907da9e85774629a69c0` / `56f2040e30159579edc0cbfbc88e2ba706a6abd2` / `313025f902b0a3416815da7ce75a3a7d6bec9559` | Retired freeze / superseded freeze-prepare / pre-tester-SOURCE |
| Retired matching CI | GHA `37425360211` | Covers `520f9f9` only |

Do not silently retarget to Combined docs HEAD. Do not start `eas build`
from this provenance branch. A later **material source change** (billing
correction, versionCode rewrite, purchase-entry / quota / GRIN flag
change) requires a **new binary** and a **new CI**. Do not rebuild from a
dirty tree. Do not reuse historical AAB `72cb7254-…` git `0da2f58`.

See `CURRENT_HEAD_VS_FREEZE.md`.

---

## This GRIN AAB is not a purchase-test build

`internal-grin` at `fcda7cd` (re-verify at FINAL SHA): purchase-entry
`"0"`, quota-upsell `"0"`, `EXPO_PUBLIC_PLAY_BILLING` **unset**. This
Internal GRIN build is **not** an interactive purchase-test build unless
a later reviewed configuration enables the restricted purchase interface
**with server-side tester authorization intact**.

---

## Separate approvals (do not collapse)

| Gate | What it authorizes | This draft |
|---|---|---|
| **B1 — Build** | `eas build --profile internal-grin --platform android` from a **clean** checkout of the **FINAL** SHA, after Play inventory is **re-read** and `versionCode` is written/committed if it must change | **not granted** |
| **B2 — Upload** | Play Internal Testing track upload of the B1 AAB only, after B1 evidence (buildId, worker env, AAB sha256, bundletool dump) | **not granted**; requested only after B1 evidence, as a **separate later letter** |

B1 does not imply B2. B2 does not imply production promotion, store
listing Save, or OTA. Sideload APK (`preview` / `development*`) is a
separate `NATIVE_DEVICE` artifact — never the B2 upload.

---

## Package / version / profile / flags (from `eas.json` + `app.json` at `fcda7cd`)

Verified by `git show fcda7cd:eas.json` and `git show fcda7cd:app.json`.
**Re-read at FINAL SHA before B1.** **No** `eas build` / `eas submit` /
`eas config` this session.

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

`src/goodsEvidence/isolation.contract.test.ts` at `fcda7cd` asserts
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

Prerequisites: FINAL SHA settled (billing correction + matching
**completed** CI); **clean** checkout of that SHA; Play inventory
**re-read**; versionCode written and committed if it must change.

Commands (do not run now): `PHONE_HANDOFF.md` §5.

- EAS `buildId`
- `gitCommitHash` matching the FINAL SHA
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
