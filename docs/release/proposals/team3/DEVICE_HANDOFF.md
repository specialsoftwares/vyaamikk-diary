# Team 3 handoff — Android build / real-phone acceptance (`candidate-1310`)

**Superseded for the phone path.** Use
`docs/release/proposals/team3/PHONE_HANDOFF.md` and
`APPROVAL_B_DRAFT.md`. Named Internal AAB is the coordinator-selected
**FINAL** SHA after billing-lifecycle correction + matching completed
CI — not `56f2040` / `313025f` / `520f9f9` alone. Current app blobs
(may be superseded): `fcda7cd`. B1 ≠ B2; **neither granted**.

**2026-10-06.** Worktree `/Users/shivamsaurav/vyd-worktrees/grin-t3-offline`.  
Provenance branch `team/grin-t3-phone-handoff`. Combined and historical
workspace were **read-only**. `package.json` / `eas.json` / `app.json`
were **not** edited. No EAS/native/prebuild/OTA. No Play write. Do not
force-push `origin/team/grin-t3-offline`. `gh` unauthenticated.

This branch is **docs provenance**, not a B1 checkout. The freeze-prepare
tables below named `56f2040` are **historical** and **not** the B1
checkout.

---

## Freeze-prepare SHA (Internal AAB) — `520f9f9` RETIRED

Copy block: `docs/release/proposals/team3/APPROVAL_B_DRAFT.md`.

| Pin | Value | Use |
|---|---|---|
| **Named freeze-prepare** | `56f2040e30159579edc0cbfbc88e2ba706a6abd2` | Combined application (verified). **Will retarget** when T2 commits 1/3/10 GiB + 45-day after `2cebe32`. |
| Canonical CI for `56f2040` | **NOT RUN** | Do **not** cite GHA `37425360211`. |
| T2 HEAD this session | `2cebe32` — **no** later commit | Owner-choice not yet an application SHA. |
| **Retired freeze** | `520f9f98bc952fd7f30a907da9e85774629a69c0` | **Do not build.** Matching CI `37425360211` covers that SHA only. |

Do not build from a dirty tree. Do not reuse historical EAS AAB `72cb7254-…`
(vc22, profile `production`, git `0da2f58`). Do not build this provenance
branch.

A later **material source change** (including the in-flight T2 owner-choice)
requires a **new binary** and a **new CI**.

---

## Play uploaded-version inventory — last explorer **2026-10-06** — **RE-READ immediately before B1**

The table below is a reminder (highest uploaded **vc22**; 23 unused). It is
**not** the B1-time inventory. Recheck-complete App bundle explorer
(unfiltered) **immediately before** any authorized build.

Read-only Play Console `u/1` that day. Developer **SPECIAL SOFTWARES**
`5171346189091805855`. App `4972339006118168782`. Package
`com.specialsoftwares.vyaamikkdiary`. Draft / temporary unreviewed name.
**No** Save, upload, Create new release, Pause, Promote, or ToS accept this
session either.

Android Publisher API: **not invoked**. `gcloud` absent. No ADC. Firebase /
`support.vyd` token **not** used as Publisher. `eas submit:list` is not a
Play-track read.

Unfiltered **App bundle explorer** (`…/bundle-explorer-selector`, Add filter
empty): heading **9 app versions**, pager **1–9 of 9**.

| versionCode | versionName | File type | Uploaded | Status |
|---|---|---|---|---|
| **22** | 1.0.0 | App bundle Enhanced | 23 Sept 2026, 08:56 | **Active** |
| 20 | 1.0.0 | App bundle Enhanced | 22 Sept 2026, 07:17 | Inactive |
| 19 | 1.0.0 | App bundle Enhanced | 21 Sept 2026, 08:30 | Inactive |
| 17 | 1.0.0 | App bundle Enhanced | 26 Aug 2026, 17:28 | Inactive |
| 16 | 1.0.0 | App bundle Enhanced | 25 Aug 2026, 17:42 | Inactive |
| 15 | 1.0.0 | App bundle Enhanced | 13 Aug 2026, 01:10 | Inactive |
| 14 | 1.0.0 | App bundle Enhanced | 12 Aug 2026, 23:01 | Inactive |
| 13 | 1.0.0 | App bundle Enhanced | 9 Aug 2026, 13:06 | Inactive |
| 10 | 1.0.0 | App bundle Enhanced | 9 Aug 2026, 10:38 | Inactive |

Searches **23**, **21**, **18**: **0 app versions / No results**. Highest
**uploaded** Play versionCode = **22**.

Tracks (same session):

| Track | Status |
|---|---|
| Internal testing | **Active**. Latest release **Vyaamikk Diary (Vc22)**. 1 version code. Available to internal testers, full roll-out, 23 Sept 2026 14:28. Not reviewed. |
| Production | **Inactive**. No production release. |
| Open testing | Inactive |
| Closed testing | Inactive |

App-list “Last updated **5 Oct 2026**” is **not** a new uploaded versionCode
(explorer still ends at vc22 / 23 Sept).

Testers tab opened; **Save disabled**. Join-on-the-web exists. Emails / names
**not copied**. Play lists are **not** Firestore admission and **not** the
O/T1/T2 identity table.

**versionCode 23 is still UNRESERVED.** `app.json` `"versionCode": 23` and
`isolation.contract.test.ts` asserting 23 do **not** reserve Play.
**Re-read App bundle explorer (unfiltered) immediately before B1.** Choose
an unused integer **strictly greater** than the then-highest **uploaded**
Play versionCode. If 23 is still unused it **may** be used. If Play already
has 23, **stop** — do not ship 24+ while the isolation test still requires
23; cut a new SHA with both changes. Do not re-upload 22.

---

## Reproducible Internal AAB packet (B1 later — not authorized)

### Artifact classes (do not mix)

| Artifact | EAS profile (`eas.json`) | Android type | Resolved use |
|---|---|---|---|
| **Play Internal Testing candidate** | **`internal-grin`** | `app-bundle` (AAB) | **Only** this profile has GRIN flags `"1"`. Ordinary `production` is the wrong AAB. |
| Ordinary store AAB | `production` | `app-bundle` | GRIN flags **unset** (not `"1"`). Not Internal-GRIN. |
| Sideload / USB | `preview` or `development*` | `apk` | **NATIVE_DEVICE** only. Not a Play Internal upload. |

Do not submit a preview APK to Internal Testing. Do not call a local APK a
`PLAY_INSTALLED` run.

### Flags — `git show 56f2040:eas.json` (no EAS started)

| Key | `internal-grin` | `production` / `preview` |
|---|---|---|
| `EXPO_PUBLIC_APP_MODE` | `production` | `production` |
| `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` | `"0"` | `"0"` |
| `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` | `"0"` | `"0"` |
| `EXPO_PUBLIC_PLAY_BILLING` | **unset** | unset |
| `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED` | **`"1"`** | unset (not `"1"`) |
| `EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT` | **`"1"`** | unset (not `"1"`) |
| Android `buildType` | `app-bundle` | `app-bundle` / preview `apk` |
| `autoIncrement` | `false` | `false` |
| `environment` | `production` | production / preview |

PLAY_BILLING **off**. GRIN **on** only for `internal-grin`. Visibility is
**not** backend admission (Approval A). Compile-time flags: changing them
later requires a new binary.

### Separate approvals (do not collapse)

| Gate | Authorizes | This packet |
|---|---|---|
| **B1 — Build** | `eas build --profile internal-grin --platform android` from a **clean** checkout of the **then-current freeze SHA**, after Play inventory is **re-read** and committed versionCode | **not granted** |
| **B2 — Internal upload** | Play Internal Testing upload of the **B1 AAB only**, after B1 evidence | **not granted**; request only after B1 evidence |

B1 does not imply B2. B2 does not imply production promotion, listing Save,
or OTA.

### B1 evidence (when owner authorizes later)

- EAS `buildId`
- `gitCommitHash` = tagged freeze SHA (clean tree of `56f2040` **or** the
  T2 retarget — never `520f9f9`, never this docs branch)
- resolved public env from the **build worker** (not only `eas.json` /
  `eas config`)
- AAB sha256
- `bundletool dump manifest` package / versionCode / versionName
- upload-cert role vs Play App Signing (**do not** commit fingerprints)
- mapping/ProGuard stored **privately** (not git)

### Signing roles (no fingerprints in git)

| Role | Holder |
|---|---|
| Play App Signing key | Google Play |
| Upload key | EAS Android credentials for `@vydspecial2026/vyaamikk-diary` |
| Mapping / ProGuard | private store after B1 |

### Backend destination

Intended later: project `vyaamikk-diary` / `982505811909`,
`asia-south1`, GRIN seven. **Live GRIN seven ABSENT.** Useful GRIN device
tests need later backend. Until then: `backend_absent` / synthetic only.
XR **N/A until backend**.

### Prior EAS Android list (2026-10-06, not Play tracks; not re-run this pass)

`npx eas-cli@16.28.0 build:list`: 28 Android builds. **No** `internal-grin`.
Highest EAS `appBuildVersion` **22**. EAS vc**23** absent. Latest store AAB:
vc22 `72cb7254-0be9-4f92-a514-dbfab2b1150d`, profile **`production`**, git
`0da2f58…`. **Not this SHA. Not Internal-GRIN.** Finished EAS ≠ Play upload.
**Not re-run** this session (no EAS).

---

## Owner device checklist (scripts prepared without AAB)

Coordinator/AI does **not** physically execute. `adb devices -l` this
session: **empty**. Host / emulator / SQLITE_HOST / mounted inert React /
CI greens are **not** device PASS. **No hardware = NOT RUN, not PASS.**

Scripts (do **not** wait for AAB to exist; refuse PASS without a phone):
`docs/release/proposals/team3/device/`. Result-capture template:
`docs/release/proposals/team3/device/RESULT_CAPTURE.template.md`.

Form: `docs/release/proposals/team3/OWNER_DEVICE_FORM.md`.

Live GRIN (Approval A) is **NOT present** — GRIN seven **ABSENT**. XR /
original-read **N/A until backend**. Synthetic GRIN until lifecycle is
approved.

### Who can execute

Arrangement: **owner + two trusted testers**. Firebase UIDs: owner supplies
privately (coordinator chat or out-of-repo file). **Do not invent** names,
UIDs, emails, or passwords. Do not write UIDs into git.

| Slot | Role | Display name | Firebase uid | Play Internal email | Phone | Device ID / model / API / RAM |
|---|---|---|---|---|---|---|
| O | Owner | | *(private channel)* | *(private channel)* | | D1: OnePlus 12R / Android 16. No password here. |
| T1 | Tester 1 | | | | | Owner fills. |
| T2 | Tester 2 | | | | | Owner fills. |

Play Internal list membership ≠ Firestore
`users/{uid}/goodsEvidenceAdmission/runtime` (Approval A). Owner must add
the three people to the Internal testers list **and** seed admission
separately.

### Required physical devices

| Slot | Requirement | This session |
|---|---|---|
| **D1 upgrade** | Phone that currently has Play Internal **vc22** (`com.specialsoftwares.vyaamikkdiary`) | **OnePlus 12R**, Android 16, vc22 **yes**, available **today**. UPGRADE device. |
| **D2 clean** | Second Android 12+ phone, **or** D1 after uninstall only after the D1 upgrade record is saved | **Still unnamed.** Leave blank. |
| TalkBack | Hardware that can run TalkBack for A11 (may be D1 or D2) | May use D1; D2 unnamed. |
| Optional low-RAM | ≤ 4 GiB RAM for M1 if available | **Not identified.** |

If only one phone exists: D1 first, then D2 on the same device after logs
are saved. Owner must confirm that D2 path; do not assume.

### Pre-record (every executable row)

Device ID, model, Android API, RAM, installed versionCode, AAB/APK sha256,
artifact label (`PLAY_INSTALLED` vs `NATIVE_DEVICE`), tester slot (O/T1/T2),
auth method, backend (`LIVE_BACKEND` seeded vs `backend_absent`). Synthetic
evidence only while Packet D retention is unset. **Do not invent IDs.**

Upgrade path = Play-install **over vc22** on OnePlus 12R. Clean path = D2
(unnamed). Sideload APK rows must not be labelled `PLAY_INSTALLED`.

Executable sheet: `docs/release/packets/DEVICE_EXECUTION_SHEET.md`. All
executable rows **NOT RUN** (XR **N/A until backend**). Scripts may be
invoked **before** an AAB exists; without a connected phone they stay
**NOT RUN**.

### Evidence requirements (do not tick PASS without these)

No customer PDFs, GSTIN, tokens, or raw uids in shared artefacts.
Screenshots: **state labels only**.

| ID | What to run | Required evidence | Status |
|---|---|---|---|
| D0 | Owner fills O/T1/T2; confirm artifact class | Named identities via private channel; D1 OnePlus 12R recorded; no guessed vc22-from-commit | Slot **O UID received privately** (`count=1`, not in git). T1/T2 still missing. Artifact class unconfirmed (no Internal-GRIN AAB). D writes HOLD |
| D1 | Upgrade install over vc22 via Play on **OnePlus 12R** | Play shows new versionCode; cold start; existing diary/PO/credit/letterhead/PDF still work; SQLite v10 migrates. Photos of About/version + one existing record. `PLAY_INSTALLED` only | NOT RUN — no adb / no Internal-GRIN AAB |
| D2 | Clean install | Empty local DB; same launch/sign-in. Label `PLAY_INSTALLED` or `NATIVE_DEVICE` | NOT RUN — D2 unnamed; no hardware attached |
| D3 | Force-stop; reboot; open | Splash completes; main tabs; legal date `2026-07-27`; no token printed | NOT RUN |
| D4 | Sign-in phone OTP | Session bound to that uid (hash uid in shared logs) | NOT RUN |
| D5 | Reviewer login `+91 9000000000` / `654321` **only if** live test-phone fixture verified | Reaches tabs; **no founder email** | NOT RUN |
| D6 | Email / profile onboarding if shown | Completes; consents recorded | NOT RUN |
| D7 | Ordinary diary create/edit/save | Persists; no GRIN-induced loss | NOT RUN |
| D8 | PDF export of a diary record | PDF generates; ITC/GST claims unchanged (app does not assert live 2B/EWB) | NOT RUN |
| D9 | Saved Records hub | Ordinary records listed; GRIN tile only if Internal-GRIN flags baked | NOT RUN |
| G1 | GRIN create online (seeded admission) | One serial; no duplicate. Needs `PLAY_INSTALLED` + `LIVE_BACKEND` | NOT RUN |
| G2 | Airplane mode create; force-stop; relaunch offline; reconnect | Local serial null while queued; **exactly one** issued serial after reconnect. `networkSteps` + `issuedNumbersObserved` | NOT RUN |
| G3 | Reserve → upload evidence → confirmation | Stored-byte verify; failed read stays pending/confirmation_refresh; no second serial | NOT RUN |
| G4 | QC, amend non-original field, partial return, EWB observation (manual) | `original` snapshot unchanged; history appends; expectedVersion conflicts surface | NOT RUN |
| G5 | Pack / export | Summary; `originalsBundled=false`; ITC `not_determined`; missing originals explicit. **Not** an archive of original files | NOT RUN |
| G6 | GRIN UI hidden or `backend_absent` | Record `blocked_by_runtime` or `backend_absent` — **not** a product pass | NOT RUN |
| G7 | Original download / export of a verified original (**not** pack-as-archive) | Original PDF/image leaves the device as the retained file (share/save/open), distinct from G5. If no control: `missing_control` | NOT RUN |
| I1 | Interrupt upload; retry | Original intact; no duplicate evidence id | NOT RUN |
| I2 | Process death during save/upload; restart | No duplicate issuance; pending work recoverable or honestly failed | NOT RUN |
| I3 | Account switch / logout during pending work | No cross-account publication; hashed uids only | NOT RUN |
| P1 | Picker / camera permission grant | File attached | NOT RUN |
| P2 | Permission deny / picker cancel | Honest cancel; no crash; no zero-byte original claimed verified | NOT RUN |
| P3 | Maximum admitted files on one receipt | Policy deny or cap message; already-linked kept | NOT RUN |
| Q80 | Ordinary monthly usage ≥80% of cap | `quotaWarn80` (or equivalent). Quota-upsell sheet **must not** appear (`EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` `"0"`) | NOT RUN |
| Q95 | ≥95% of cap | Dedicated 95% copy **if present on the binary**; else record the actual string (`warnAt80` today; **no** `quotaWarn95` key) | NOT RUN |
| QCAP | Hit ordinary monthly cap | Cap messaging; new save stays on device or is honestly refused; upsell remains off | NOT RUN |
| XR | Expiry-read window for a stored GRIN original | **N/A until backend**. Do not mark PASS | N/A (backend) |
| W1 | Repeated daily-use | No sustained unusable jank; record duration | NOT RUN |
| M1 | RSS/PSS on representative phones during G3 | `dumpsys meminfo` numbers; OOM-free **not** claimed from source | NOT RUN |
| L1 | Five languages `en`, `hi`, `ta`, `te`, `gu` | Switch through all five; no clipped critical actions | NOT RUN |
| L2 | Large text / font scale | Primary actions reachable | NOT RUN |
| L3 | Keyboard | Fields not permanently covered; save reachable | NOT RUN |
| A11 | TalkBack | Sign-in, save, GRIN primary actions announced; TalkBack version recorded | NOT RUN |
| C1 | Crash reporting consent disabled | No upload of crashes beyond documented fail-closed | NOT RUN |
| C2 | Consent enabled | Crashlytics test non-fatal **only if** owner allows | NOT RUN |

---

## Listing artwork (this tree — tracked; **not** claimed in Play Console)

`git ls-files` tracks the three store files. Hashes (`shasum -a 256`):

| File | sha256 | Pixels |
|---|---|---|
| `store/play-icon-512.png` | `cc550cb8450c62d5b991da56d0e5989db9ee14fb7d971b679848728caf401f5a` | 512×512 PNG |
| `store/play-feature-graphic.png` | `b17f8082b5b7f025ce0ecfc23d0dd096c8997a945f5960198e135b27d10dddd1` | 1024×500 PNG |
| `store/play-icon-512-masked-preview.png` | `a0c18f35fde4a2585fb0a6d6131441552c7a784992bebee7ae248b081fd51a30` | 512×512 PNG |

Files in git ≠ uploaded to Play (listing Save **NOT RUN**).

---

## Remaining HOLDs

- EAS/native/prebuild/OTA; **no** `eas build` / `eas submit`
- Play upload / Internal track / production promotion / listing Save
- versionCode **23 reservation** (none; unused on Play as of 2026-10-06, still unreserved)
- Play explorer **re-read** immediately before B1
- Approval **B1** and **B2** (separate; **neither granted**)
- Freeze **retarget** when T2 commits 1/3/10 GiB + 45-day; matching canonical CI on that SHA
- Approval A live GRIN backend / original-read (XR) — seven **ABSENT**
- Packet D retention / commercial quota (owner 1/3/10 + 45-day selected, not yet wired)
- NATIVE_DEVICE / PLAY_INSTALLED execution (`adb` empty this session)
- D2 clean-install device **unnamed**
- Firebase tester UIDs in git (must stay out of git)
