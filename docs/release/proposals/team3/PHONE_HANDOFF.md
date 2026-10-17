# Team 3 phone handoff — Internal GRIN (upgrade on OnePlus 12R)

**2026-10-06.** AI Team 3 (build / device). Not human sign-off.  
Worktree `/Users/shivamsaurav/vyd-worktrees/grin-t3-offline`.  
Provenance branch `team/grin-t3-aab-540e07a` (from
`team/grin-t3-phone-handoff` `5692e25`). Do **not** force-push
`origin/team/grin-t3-offline` or `origin/team/grin-t3-phone-handoff`.
Combined and historical workspace were **read-only**.
`package.json` / `eas.json` / `app.json` were **not** edited this pass.

**This instruction does not authorize B1 or B2.** Named Internal AAB is
application `540e07a`. Recheck Play immediately before B1 remains
**required**. B1 ≠ B2. Neither is granted. Restricted billing is **not**
a prerequisite for this billing-off GRIN Internal AAB. No `eas build`,
`eas submit`, Play write, OTA, prebuild, or uninstall of the owner phone.

This branch is **docs provenance**, not a B1 checkout. Application blobs
here are **not** the Internal AAB source. Combined docs HEAD `7e0d629`
is **not** a B1 checkout.

Related: `APPROVAL_B_DRAFT.md`, `OWNER_DEVICE_FORM.md`,
`CURRENT_HEAD_VS_FREEZE.md`, `device/`. Older `DEVICE_HANDOFF.md` is
superseded by this file for the phone path.

---

## 1. Internal AAB target (copy this block)

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
Purchase-entry:    OFF (see §2). Billing activation off.
Restricted billing is NOT a prerequisite for this billing-off GRIN Internal AAB.
P8:                FAIL operationally. GRIN synthetic-only until later backend.
```

| Tree | SHA | Use |
|---|---|---|
| **B1 checkout** | `540e07aa07f376716484adb879ce66cb9fb170ce` | **Only** this |
| CI-tested checkout | `7e0d629023198333ed384ae076285925e98047d6` | Canonical CI SUCCESS; docs/QA after `540e07a`. **Not** a B1 checkout |
| Checkout parent | `d4c7ed4cb49d1bb5547fe3738702016bd1bcc36f` | Parent of `7e0d629` |
| Canonical CI | GHA `37445383607` **SUCCESS**, job `112208918347` | Covers `540e07a` because `540e07a`..`7e0d629` DEPLOYMENT_PATHS empty. Not a letter. |
| Do **not** rebuild alone | `520f9f9` / `56f2040` / `313025f` / `fcda7cd` / `60c4bc1` | Older packets exist |
| This provenance branch | `team/grin-t3-aab-540e07a` | Docs only. **Not** a B1 checkout |

Do not start `eas build` from this provenance branch, from Combined docs
HEAD `7e0d629`, or from a dirty tree. Do not rebuild `520f9f9` /
`56f2040` / `313025f` / `fcda7cd` / `60c4bc1` alone. A later material
source change (versionCode rewrite, purchase-entry / quota / GRIN flag
change) requires a **new binary** and a **new CI**. Do not reuse
historical EAS AAB `72cb7254-…` (vc22, profile `production`, git
`0da2f58`).

After owner letters **B1** (not granted; **do not execute** now): recheck
Play inventory immediately, then `eas build --profile internal-grin` of
`540e07aa07f376716484adb879ce66cb9fb170ce`, then later **B2** Internal
upload (separate letter), then **D1** upgrade over vc22 on OnePlus 12R.

**Prepared 2026-10-06 (not executed):** B1 checkout remains `540e07a`.
versionCode 23 UNRESERVED until Play recheck. Purchase-entry `"0"`.
P8 FAIL. This file is still not a B1/B2 grant.

Executable packet (still unexecuted):
`docs/release/proposals/team3/INTERNAL_AAB_540e07a_PACKET.md`.

---

## OnePlus 12R upgrade checklist (D1; after B2; not authorized now)

1. Confirm phone: OnePlus 12R, Android 16, installed **vc22**.
2. Confirm Play Internal track has the B2-uploaded `540e07a` AAB (vc23 after
   reservation).
3. Upgrade in place (do **not** uninstall / clear data without a separate
   owner agreement).
4. Capture results in `device/RESULT_CAPTURE.template.md`.
5. Backend gate state is independent: today seven GRIN callables are
   **gate=off**; device GRIN UI may appear while callables deny until a
   later proven E enable.

---
## 2. This Internal GRIN AAB is not a purchase-test build

On `internal-grin` at application `540e07a` (`git show
540e07aa07f376716484adb879ce66cb9fb170ce:eas.json`; re-read immediately
before B1):

| Key | Value |
|---|---|
| `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` | `"0"` |
| `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` | `"0"` |
| `EXPO_PUBLIC_PLAY_BILLING` | **unset** (not `"1"`) |
| `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED` | `"1"` |
| `EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT` | `"1"` |

This GRIN Internal build is **not** an interactive purchase-test build
unless a **later reviewed configuration** enables the restricted purchase
interface **with server-side tester authorization intact**. Play Internal
membership, a visible upgrade control, and a Firebase UID in chat are
**not** Play Billing authorization. REAL-CHARGE rows stay **NOT RUN**.

---

## 3. Private Firebase Auth UID (never git)

Slot **O** Firebase Auth UID is **already received privately** (count=1).
Do **not** ask again. Do **not** write UIDs, emails, or phones into git.
T1 / T2 stay unnamed — additional testers are **optional**. Live
cross-account tests need another authenticated user.

Coordinator used coordinator chat or an **out-of-repo** file the
coordinator named. **Firebase Auth UIDs only.**

Do **not** request or accept passwords, OTPs, API keys, recovery codes,
or service-account JSON. Do **not** commit UIDs, Play emails, or a filled
testers file to git. Hash a UID in shared logs if a correlation id is
required.

Three identifiers stay distinct:

| Identifier | What it is | What it is not |
|---|---|---|
| Firebase Auth UID | Account id for Auth / Firestore path / (later) GRIN admission seed | Not a Play email |
| Play Internal tester email | Play Console Internal Testing list | Not a Firebase UID; not GRIN admission |
| GRIN admission | `users/{uid}/goodsEvidenceAdmission/runtime` (Approval A, **not** present) | Not Play list membership |

Play Internal email ≠ Firebase UID ≠ GRIN admission.

### Exact one-line ask (already satisfied for slot O — do not send again)

Please reply here (or in an out-of-repo file I name) with your Firebase Auth UID only — no password, OTP, key, or recovery code; do not git it. Play Internal email is separate from that UID and from GRIN admission.

Slots O / T1 / T2 stay blank in git. Form:
`docs/release/proposals/team3/OWNER_DEVICE_FORM.md`.

---

## 4. Play inventory recheck — immediately before authorized B1

Last complete unfiltered App bundle explorer: **2026-10-06**. That read
is **not** current at B1 time. Recheck **immediately before** choosing a
versionCode. Do not treat this packet as live inventory. No Play write
this session. Do not use a Firebase token as Android Publisher.

Reminder (stale until re-read):

| Fact | 2026-10-06 |
|---|---|
| Package | `com.specialsoftwares.vyaamikkdiary` |
| Highest **uploaded** | **vc22** Active (Internal Testing, 23 Sept 2026) |
| 23 / 21 / 18 | **absent** (search: No results) |
| versionCode 23 | **UNRESERVED** — unused ≠ reserved |
| Profile for this AAB | `internal-grin` (`app-bundle`) |
| GRIN flags | `"1"` on `internal-grin` only |
| Purchase-entry / quota-upsell / `PLAY_BILLING` | `"0"` / `"0"` / unset |
| Signing | Play App Signing at Google; upload key on EAS `@vydspecial2026/vyaamikk-diary` — no fingerprints in git |
| Backend dest | production project `vyaamikk-diary` (`982505811909`), bucket `vyaamikk-diary.firebasestorage.app`, Functions `asia-south1`. **Live GRIN seven ABSENT** |

### Recheck steps (commands / Console — do not execute B1)

1. Play Console → Vyaamikk Diary → Release → **App bundle explorer**.
2. Add filter **empty** (unfiltered). Record every versionCode,
   versionName, file type, uploaded date, status. Confirm pager is
   complete (last read: 1–9 of 9).
3. Search **23**. If still No results, 23 remains unused — still
   **unreserved**.
4. Choose an unused integer **strictly greater** than the then-highest
   **uploaded** Play versionCode. Do not re-upload 22.
5. If 23 is still unused it **may** be used. If Play already has 23,
   **stop** — `src/goodsEvidence/isolation.contract.test.ts` at
   `540e07a` asserts `"versionCode": 23`. Do not ship 24+ while that
   test still requires 23; cut the new SHA with both changes.
6. Re-read `git show 540e07aa07f376716484adb879ce66cb9fb170ce:eas.json` and
   `git show 540e07aa07f376716484adb879ce66cb9fb170ce:app.json`
   for package, profile `internal-grin`, AAB `buildType`, GRIN `"1"`,
   purchase-entry `"0"`, quota-upsell `"0"`, `PLAY_BILLING` unset.
7. Confirm intended backend dest is still production project
   `vyaamikk-diary` / `982505811909` (Approval A not present; useful
   GRIN device tests need later backend).

Android Publisher API: do not invoke for this packet. `eas submit:list`
is not a Play-track read.

---

## 5. B1 artifact verification (commands only — do not run)

B1, if later lettered, is `eas build --profile internal-grin --platform android`
from a **clean** checkout of `540e07aa07f376716484adb879ce66cb9fb170ce`,
after the inventory recheck and a committed versionCode if it must
change. Do **not** checkout `7e0d629` as the B1 source.

Do **not** run the following until that letter exists.

```bash
# 0. Checkout 540e07a in a clean worktree (not this provenance branch).
git fetch origin
git rev-parse HEAD                    # must equal 540e07aa07f376716484adb879ce66cb9fb170ce
git status --porcelain                # must be empty
git diff --stat 540e07aa07f376716484adb879ce66cb9fb170ce -- functions src eas.json app.json app package.json
# empty. If not, stop.

git show 540e07aa07f376716484adb879ce66cb9fb170ce:eas.json
git show 540e07aa07f376716484adb879ce66cb9fb170ce:app.json
# Confirm internal-grin: AAB, GRIN 1, purchase-entry 0, quota-upsell 0,
# PLAY_BILLING unset, package com.specialsoftwares.vyaamikkdiary.

# 1. After the B1 letter only:
# npx eas-cli@16.28.0 build --profile internal-grin --platform android --non-interactive

# 2. Record worker identity (buildId, gitCommitHash, env from the worker):
# npx eas-cli@16.28.0 build:view "$EAS_BUILD_ID" --json
# Required fields:
#   id
#   gitCommitHash          == 540e07aa07f376716484adb879ce66cb9fb170ce
#   appBuildVersion        == chosen Play-unused versionCode
#   metadata / expoConfig / env (worker, not local eas.json / eas config):
#     EXPO_PUBLIC_APP_MODE=production
#     EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED=0
#     EXPO_PUBLIC_QUOTA_UPSELL_ENABLED=0
#     EXPO_PUBLIC_PLAY_BILLING absent or not 1
#     EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED=1
#     EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT=1
# Local `eas config` is not worker evidence.

# 3. Download AAB (after finish; still not B2):
# npx eas-cli@16.28.0 build:download --id "$EAS_BUILD_ID" --output ./internal-grin.aab
# shasum -a 256 ./internal-grin.aab

# 4. Manifest dump:
# bundletool dump manifest --bundle ./internal-grin.aab
# Expect:
#   package=com.specialsoftwares.vyaamikkdiary
#   android:versionCode=<chosen unused integer>
#   android:versionName=1.0.0   (unless owner changed it at 540e07a)

# 5. Mapping / ProGuard: download from the EAS artifact store privately.
#    Do not commit. Upload-cert vs Play App Signing: compare privately;
#    do not print fingerprints into git.
```

Historical vc22 EAS id `72cb7254-0be9-4f92-a514-dbfab2b1150d` is a
**different** SHA and profile `production`. Do not reuse as this
candidate.

---

## 6. B2 Internal upload is a separate later letter

B1 evidence (buildId, worker env, AAB sha256, bundletool dump) does
**not** authorize Play upload.

B2, if later lettered, is Internal Testing track upload of the **B1 AAB
only**. Console artifact identity must match B1. No production track.
No store listing Save. No OTA. Sideload APK (`preview` /
`development*`) is `NATIVE_DEVICE` only — never the B2 upload.

Do not request B2 in the same letter as B1.

---

## 7. Upgrade-test script — OnePlus 12R over vc22

Owner FINAL: **OnePlus 12R**, **Android 16**, Vyaamikk Diary **vc22**
installed, available **today** = **UPGRADE** test device (`D1`,
`PLAY_INSTALLED`). A second phone is desirable but **must not stop**
preparing this device. Clean-install (`D2`) stays **pending** until
actually executed after owner agreement (§8).

Do not uninstall or clear vc22 data on this phone in this packet.

`adb devices -l` at packet time: **empty** → every execution row
**NOT RUN**, never PASS. Scripts in `device/` exit 2 with
`STATUS=NOT_RUN` / `PASS=false`. They never print `STATUS=PASS`.

Host SQLite (`SQLITE_HOST` / `GRIN_SQLITE_HOST`), mounted inert React,
emulator, and CI greens are **not** physical-device evidence.

Live GRIN seven **ABSENT**. G1/G3/G7/XR cannot be product PASS until
later backend + seeded admission. Until then record `backend_absent` /
`blocked_by_runtime`. Synthetic GRIN only. No customer originals.

### 7.1 Invoke later (owner / tester on hardware)

From a tree that contains these scripts (AAB need not exist to **prepare**;
without a phone the scripts stay NOT RUN):

```bash
bash docs/release/proposals/team3/device/print-matrix.sh
bash docs/release/proposals/team3/device/d1-upgrade-oneplus-12r.sh
bash docs/release/proposals/team3/device/startup-otp-onboarding-reviewer.sh
bash docs/release/proposals/team3/device/diary-save-pdf.sh
bash docs/release/proposals/team3/device/grin-offline-sync-amend-export.sh
bash docs/release/proposals/team3/device/interrupt-death-account-switch.sh
bash docs/release/proposals/team3/device/languages-a11y-low-memory.sh
# D2 placeholder only — do not uninstall D1:
bash docs/release/proposals/team3/device/d2-clean-install-placeholder.sh
```

Each script refuses `eas` / `play` / `deploy` / `ota` / `prebuild` /
`submit` arguments.

### 7.2 D1 sequence (after B1+B2, neither granted)

Pre-record on every row: model OnePlus 12R, Android 16, RAM, installed
versionCode / versionName, AAB sha256, `GIT_COMMIT_ON_BINARY` =
`540e07aa07f376716484adb879ce66cb9fb170ce`, artifact `PLAY_INSTALLED`,
tester slot O (UID already received privately; do not ask again),
backend `LIVE_BACKEND_SEEDED` vs `backend_absent`. Do not invent
serials, IMEIs, or Android IDs.

| ID | What to run on OnePlus 12R | Required evidence | Status |
|---|---|---|---|
| D0 | Slot O UID already received privately (count=1); confirm artifact class | Do **not** ask O again; UID not in git; Play email separate; GRIN admission separate; T1/T2 optional | NOT RUN |
| D1 | Play-install **over vc22** (not sideload labelled PLAY_INSTALLED) | Play shows new versionCode; cold start; existing diary/PO/credit/letterhead/PDF still open; SQLite v10 migrates | NOT RUN |
| D3 | Force-stop; reboot; open | Splash completes; main tabs; legal date `2026-07-27`; no token printed | NOT RUN |
| D4 | Phone OTP on the tester's own number | Session bound to that uid; **no OTP in git**; hash uid in shared logs | NOT RUN |
| D5 | Reviewer `+91 9000000000` / `654321` **only if** live fixture verified | Reaches tabs; **no founder email**. Else `fixture_unverified` | NOT RUN |
| D6 | Email / profile onboarding if shown | Completes; consents recorded | NOT RUN |
| D7 | Ordinary diary create/edit/save | Persists after force-stop; GRIN flags must not drop the record | NOT RUN |
| D8 | PDF export of that record | PDF generates; no live GSTR-2B / E-Way Bill claim; no customer GSTIN in screenshots | NOT RUN |
| D9 | Saved Records hub | Ordinary records listed; GRIN tile only if this binary is `internal-grin` | NOT RUN |
| G1 | GRIN create online (needs later backend + seeded admission) | One serial; no duplicate. Else `backend_absent` — not a product pass | NOT RUN |
| G2 | Airplane create; force-stop; relaunch offline; reconnect | Local serial null while queued; **exactly one** issued serial after reconnect. Capture `networkSteps` + `issuedNumbersObserved` | NOT RUN |
| G3 | Reserve → upload evidence → confirmation | Stored-byte verify; failed read stays pending/confirmation_refresh; no second serial | NOT RUN |
| G4 | QC; amend a non-original field; partial return; EWB observation (manual) | `original` snapshot unchanged; history appends | NOT RUN |
| G5 | Pack / export | Summary; `originalsBundled=false`; ITC `not_determined`; missing originals explicit. **Not** an archive of original files | NOT RUN |
| G6 | GRIN UI hidden or `backend_absent` | Honest block — **not** a product pass | NOT RUN |
| G7 | Original download of a verified original (not the G5 pack) | File leaves the device as the retained original, or `missing_control` / N/A until backend | NOT RUN |
| P1–P3 | Permission grant / deny-or-cancel / max files | Attach; honest cancel; policy deny; already-linked kept | NOT RUN |
| I1 | Interrupt an evidence upload; retry | Original intact; no duplicate evidence id | NOT RUN |
| I2 | Process death during save/upload (`am force-stop` or Recents); relaunch | No duplicate issuance; pending work recoverable or honestly failed | NOT RUN |
| I3 | Log out / switch account while work is pending | No cross-account publication; hashed uids only | NOT RUN |
| L1 | Languages `en`, `hi`, `ta`, `te`, `gu` | Switch all five; critical actions not clipped | NOT RUN |
| L2 | Large text / font scale | Primary actions reachable | NOT RUN |
| L3 | Keyboard | Fields not permanently covered; save reachable | NOT RUN |
| A11 | TalkBack (may use this OnePlus 12R) | Sign-in, save, GRIN primary actions announced; TalkBack version recorded | NOT RUN |
| M1 | `dumpsys meminfo` RSS/PSS during a G3-like upload | Numbers recorded. OOM-free **not** claimed from source. Optional ≤4 GiB phone not identified | NOT RUN |
| W1 | Repeated daily-use | No sustained unusable jank; record duration | NOT RUN |
| Q80 / Q95 / QCAP | Ordinary monthly usage 80% / 95% / cap | Quota-upsell sheet **must not** appear (`EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` `"0"`). This is not a purchase test | NOT RUN |
| XR | Expiry-read of a stored GRIN original | **N/A until backend**. Do not mark PASS | N/A |
| D2 | Clean install | **Pending** until executed after §8 agreement. Second phone unnamed | NOT RUN — not executed |

Do not tick PASS because a host SQLite fixture or emulator run is green.

### 7.3 Result capture

Copy one block per row from
`docs/release/proposals/team3/device/RESULT_CAPTURE.template.md`.
Fill on the phone after the named run. Customer PDFs / GSTIN / tokens /
raw UIDs stay out of git. Screenshots: **state labels only**.

Executable sheet: `docs/release/packets/DEVICE_EXECUTION_SHEET.md`.

---

## 8. Loss-risk if the owner later agrees to a clean install

Clean-install coverage stays **pending until actually executed**. Do
**not** uninstall or clear Vyaamikk Diary vc22 data on the OnePlus 12R
without owner agreement after this disclosure.

Uninstall, “clear storage”, or a factory-style app reset on this device
destroys local state that Play Internal upgrade does **not** destroy,
including:

- Unsynced ordinary diary / PO / credit / letterhead rows in **local
  SQLite** that have not reached the server
- PDFs generated and stored on the device
- GRIN outbox / pending evidence uploads / local serials not yet issued
- On-device session; re-OTP will be required

A second phone is the preferred D2 path. Using D1 as D2 after uninstall
is allowed **only** after the D1 upgrade record is saved **and** the
owner agrees to the loss above. Team 3 will not perform that wipe.

---

## 9. Remaining HOLDs

- EAS/native/prebuild/OTA; **no** `eas build` / `eas submit`
- Play upload / Internal track / production promotion / listing Save
- Approval **B1** and **B2** (separate later letters; **neither granted**)
- Recheck Play inventory **immediately before** authorized B1 of `540e07a`
- versionCode **23 reservation** (none; unused on Play as of 2026-10-06)
- Approval A live GRIN backend / original-read (XR) — seven **ABSENT**
- P8 **FAIL** operationally (`INCLUDE_GRIN_IN_ACCOUNT_PURGE` false). GRIN
  **synthetic-only** until later backend
- Restricted billing is **not** a prerequisite for this billing-off AAB
- Private Firebase UIDs: slot O received privately (count=1), do **not**
  ask again; T1/T2 unnamed and optional
- NATIVE_DEVICE / PLAY_INSTALLED execution (`adb` empty this session)
- D2 clean-install **unnamed** and **not executed**
- Interactive purchase-test (flags off; not this GRIN AAB)
