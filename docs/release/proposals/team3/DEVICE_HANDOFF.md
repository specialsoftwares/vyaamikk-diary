# Team 3 handoff — Android build / real-phone acceptance

**2026-10-06.** Worktree `/Users/shivamsaurav/vyd-worktrees/grin-t3-offline`.  
Branch `team/grin-t3-offline` @ `aa5253e4e070195227055cde836d6b528d5e0070`.  
Historical dirty workspace and `grin-combined` were **not** edited.  
`package.json` / `eas.json` / `app.json` were **not** edited.

Application pin remains `5d5df3d54df08953bfb26db39a9b7f5e3d67ed47` until the
coordinator assigns a new SHA after Team 2 source lands. Canonical CI
`37351685421` (GitHub CLI unauthenticated this session; pin as given).  
`versionCode` **23 is UNRESERVED**.

---

## Inventory

### Play uploaded versions — **NOT RUN**

Last complete Console read (2026-10-01: Internal vc22 Active; 21/18/23
absent; Production Inactive) is **STALE**. This session did **not** obtain a
replacement Play-track list. Do not reuse “catalog empty.” Do not invent
versionCodes.

| Route | Result |
|---|---|
| Play Console bundle explorer | `support.vyd@specialsoftwares.com` redirected to `https://play.google.com/console/u/0/accept-terms` (“Review Terms of Service”). Terms **not** accepted. |
| Play Console as `aeadmin@` | Password challenge; heading **“Too many failed attempts.”** Password not entered. |
| Android Publisher API | **Not invoked.** Firebase / `support.vyd` ADC **not** used as Publisher. `gcloud` missing; `googleapiclient` missing. |
| `eas submit:list` | `eas-cli@16.28.0`: `Error: command submit:list not found` — not a Play-track read |

Owner must re-read App bundle explorer (unfiltered) immediately before
choosing a versionCode.

### EAS Android — RUN 2026-10-06 (not Play tracks)

CLI: `npx eas-cli@16.28.0` (not on PATH; npx). Account `vydspecial2026`.
Project `@vydspecial2026/vyaamikk-diary`.
`eas build:list --platform android --limit 50 --non-interactive --json`:
**28** builds. **No** `internal-grin`. **No** git `5d5df3d…`. Highest EAS
`appBuildVersion` **22**. EAS vc**23** **absent**.

Latest store AAB: **vc22** `72cb7254-0be9-4f92-a514-dbfab2b1150d`, profile
`production`, git `0da2f58970f23c7ce6cbefae6efffd49c731f44b`, created
2026-09-23T08:34:57Z, expires 2026-10-23T08:34:57Z. **Not this SHA.** Sideload
APK (`preview` / `development*`) ≠ Play Internal AAB.

EAS vc21 `5e1e124b-…` exists on EAS (same git `0da2f58…`). Finished EAS ≠
Play upload.

No `eas build` / `eas submit` this session.

---

## EAS profiles (from `eas.json` + `eas config`, no mutation)

| Profile | Android type | GRIN `ENABLED` / `STORE_RUNTIME_ADMIT` | purchase-entry | quota-upsell | Use |
|---|---|---|---|---|---|
| `internal-grin` | AAB (`app-bundle`); resolved `distribution=store` | exact `"1"` / `"1"` | `"0"` | `"0"` | **Only** Play Internal candidate |
| `production` | AAB; `store` | unset (not `"1"`) | `"0"` | `"0"` | Ordinary store AAB; GRIN-off |
| `preview` | APK; `internal` | unset | `"0"` | `"0"` | Sideload `NATIVE_DEVICE` only |

`eas config --platform android --profile internal-grin` resolved profile env
as above; overlap warning: remote production `EXPO_PUBLIC_APP_MODE` vs
profile — **profile wins**. `git status` unchanged after config.

---

## Listing artwork (this tree — tracked; **not** claimed in Play Console)

`git ls-files` **does** track the three store files. The
`PLAY_SUBMISSION_READINESS.md` line “Not in this worktree / untracked in a
different workspace” is **incorrect for this tree**. Hashes
(`shasum -a 256`):

| File | sha256 | Pixels |
|---|---|---|
| `store/play-icon-512.png` | `cc550cb8450c62d5b991da56d0e5989db9ee14fb7d971b679848728caf401f5a` | 512×512 PNG |
| `store/play-feature-graphic.png` | `b17f8082b5b7f025ce0ecfc23d0dd096c8997a945f5960198e135b27d10dddd1` | 1024×500 PNG |
| `store/play-icon-512-masked-preview.png` | `a0c18f35fde4a2585fb0a6d6131441552c7a784992bebee7ae248b081fd51a30` | 512×512 PNG |

These files existing in git is **not** proof they are uploaded to Play
Console (listing Save **NOT RUN**).

Screenshots: `public-site/assets/screenshots/screenshots.manifest.json` —
**11** entries. `safeForPublic: true` **6**; `safeForPublic: false` **5**.

Unsafe ids (dashboard shots; demo profile / registered company names):
`dashboard-en`, `dashboard-hi`, `dashboard-ta`, `dashboard-te`,
`dashboard-gu`.

Safe ids: `location-access-en`, `new-record-gu`, `new-record-en`,
`new-record-hi`, `new-record-te`, `statutory-info-en`.

---

## Device

`adb devices -l`: empty. Sheet stays **NOT RUN**. Host/emulator not converted
to PASS. Expiry-read row is **N/A until backend**.

Owner + two testers arrangement accepted; identities still need **owner
input** (no UIDs / emails / passwords invented).

---

## Files written this session

| Path | Purpose |
|---|---|
| `docs/release/packets/DEVICE_EXECUTION_SHEET.md` | Tester blanks; G7 original download/export; Q80/Q95/QCAP; XR N/A until backend; L1/A11/M1 kept NOT RUN |
| `docs/release/proposals/team3/APPROVAL_B_DRAFT.md` | B1 vs B2 freeze text |
| `docs/release/proposals/team3/DEVICE_HANDOFF.md` | This handoff |

---

## Remaining HOLDs

- EAS/native/prebuild/OTA; **no** `eas build` / `eas submit`
- Play upload / Internal track / production promotion / listing Save
- Play uploaded-version inventory (owner Console re-read)
- `versionCode` 23 reservation (none)
- Approval **B1** and **B2** (separate; neither granted)
- New application SHA if Team 2 merges
- Approval A live GRIN backend / original-read (XR)
- Packet D retention / commercial quota
- NATIVE_DEVICE / PLAY_INSTALLED execution
- Tester identity fill-in by owner
