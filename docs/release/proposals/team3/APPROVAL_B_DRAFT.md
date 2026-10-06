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
Application SHA: PLACEHOLDER — post-S1/S2 application SHA (not b845e8a)
Canonical CI:    PLACEHOLDER — matching GitHub Actions success on that SHA
                 (do not reuse 37379529193)
Version name:    1.0.0
versionCode:     UNRESERVED — Play inventory 2026-10-06 shows 23 unused;
                 do not assume it remains available at B1 time
EAS profile:     internal-grin
Package:         com.specialsoftwares.vyaamikkdiary
```

Current checkpoint (pre-freeze, **not** B1-eligible):

| Item | Value |
|---|---|
| Application | `b845e8a30262b9e8740fa53b55e9a0f237caea0b` |
| PR head | `41b05a49e8e60597b63a35f22825878bc1945dee` |
| GHA | run `37379529193` **success** on `41b05a4` (job `111997702708` from coordinator register; `gh` unauthenticated here) |
| S1 / S2 | **Open** — storage accounting bypass + hold key omits ledgerId |

Internal AAB freeze **must wait** until Team 2 lands S1/S2, the coordinator
assigns the new application SHA, and canonical CI succeeds on **that** SHA.
Owner may approve **B1** only after those exist. Do not freeze B1 on
`b845e8a` / `41b05a4`. Do not cite `5d5df3d` / CI `37351685421`.

A later **material source change** (S1/S2 merge, versionCode rewrite,
purchase-entry/quota/GRIN flag change, or any other application commit)
requires a **new binary**. Do not rebuild from a dirty tree. Do not reuse
historical AAB `72cb7254-…` git `0da2f58`.

---

## Separate approvals (do not collapse)

| Gate | What it authorizes | This draft |
|---|---|---|
| **B1 — Build** | `eas build --profile internal-grin --platform android` from a **clean** tree whose HEAD application SHA is the **post-S1/S2 freeze pin**, after Play inventory is **re-read** and `versionCode` is written/committed if it must change | **not granted** |
| **B2 — Upload** | Play Internal Testing track upload of the B1 AAB only, after B1 evidence (buildId, worker env, AAB sha256, bundletool dump) | **not granted**; requested only after B1 evidence |

B1 does not imply B2. B2 does not imply production promotion, store listing
Save, or OTA. Sideload APK (`preview` / `development*`) is a separate
`NATIVE_DEVICE` artifact — never the B2 upload.

---

## Frozen Internal-GRIN flags

Source: `eas.json` `build.internal-grin` (this tree; **no mutation**).
Ordinary `production` is **not** the Internal candidate (GRIN flags unset).

| Key | Value |
|---|---|
| `EXPO_PUBLIC_APP_MODE` | `production` |
| `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` | `"0"` |
| `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` | `"0"` |
| `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED` | `"1"` |
| `EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT` | `"1"` |
| Android `buildType` | `app-bundle` |
| Resolved `distribution` (prior `eas config`, 2026-10-06) | `store` |
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
asserts `"versionCode": 23`. If Play already has 23 at B1 time, **stop** —
do not ship 24+ while that test still requires 23; cut a new SHA with both
changes.

---

## Inventory that must be true before B1

### Play uploaded-version inventory — **RUN** 2026-10-06T05:51Z–05:53Z

Read-only Play Console `u/1`, developer SPECIAL SOFTWARES
`5171346189091805855`, app `4972339006118168782`, package
`com.specialsoftwares.vyaamikkdiary`. No mutation.

Android Publisher API **not invoked** (`gcloud` / ADC absent; Firebase token
not used as Publisher). Previous session’s ToS / aeadmin-lockout blockers
are **superseded for this Console session**.

Unfiltered App bundle explorer: **9 app versions**, pager **1–9 of 9**.

| Uploaded versionCodes | Status |
|---|---|
| **22** | **Active** (1.0.0, 23 Sept 2026 08:56) |
| 20, 19, 17, 16, 15, 14, 13, 10 | Inactive |
| **21, 18, 23** | **absent** (search each: No results) |

Internal testing: **Active**, latest **Vyaamikk Diary (Vc22)**, 1 version
code, available to internal testers, full roll-out, 23 Sept 2026 14:28,
not reviewed. Production / open / closed: **Inactive**.

Highest **uploaded** Play versionCode = **22**. Next unused integer as of
this read **may** be **23**. **23 is not reserved.** Re-read the unfiltered
explorer **immediately before B1** — S1/S2 freeze is later; this list can
change. Choose unused integer **strictly greater** than the then-highest
uploaded code. Do not re-upload 22.

### EAS Android — RUN 2026-10-06 (not Play tracks; not re-run this pass)

`npx eas-cli@16.28.0 build:list --platform android --limit 50 --non-interactive --json`  
Account `vydspecial2026` / project `@vydspecial2026/vyaamikk-diary`
(`00bb47ff-b22f-4a64-ace8-a0e7275fd2a1`). 28 Android builds. No mutation.

| Finding | Value |
|---|---|
| `internal-grin` builds | **none** |
| Builds of SHA `5d5df3d…` | **none** (2026-10-06 list; `b845e8a` not re-listed this pass) |
| Highest EAS `appBuildVersion` | **22** |
| versionCode **23** on EAS | **absent** |
| Latest store AAB on EAS | vc**22**, profile `production`, id `72cb7254-0be9-4f92-a514-dbfab2b1150d`, git `0da2f58970f23c7ce6cbefae6efffd49c731f44b` (2026-09-23). **Do not reuse** as Internal-GRIN. **Not this SHA.** |
| Sideload vs Play | `preview` / `development*` are APK/`INTERNAL`. Play Internal candidate is **only** `internal-grin` AAB |

---

## B1 evidence to record (when owner authorizes later)

Prerequisites: post-S1/S2 SHA + matching CI; clean `git status` on
deployment paths; Play inventory re-read; versionCode written and committed
if it must change.

- EAS `buildId`
- `gitCommitHash` matching the tagged freeze SHA
- resolved public env from the **build worker**
- AAB sha256
- `bundletool dump manifest` package / versionCode / versionName
- upload-cert role vs Play App Signing (do not commit fingerprints)
- mapping/ProGuard stored **privately** (not git)

## B2 (later, separate)

Internal Testing track only. Console artifact identity must match B1. No
production track. No store listing submission.

Device sheet: `docs/release/packets/DEVICE_EXECUTION_SHEET.md` — all
executable rows **NOT RUN** (expiry-read **N/A until backend**). No
attached phone this session. Handoff:
`docs/release/proposals/team3/DEVICE_HANDOFF.md`.
