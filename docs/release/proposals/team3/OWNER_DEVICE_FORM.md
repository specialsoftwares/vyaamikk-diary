# Owner device form — Internal GRIN (`candidate-1310`)

Fill remaining blanks via an **approved private channel** (coordinator chat
or an out-of-repo file). Do **not** invent names, emails, UIDs, or
passwords. Do not paste secrets, OTPs, keys, or recovery codes into git.
Do not write Firebase tester UIDs into this file.

Named Internal candidate: `fcda7cd64e9622e50c38223a7156f0f6b8ca5576`.  
Retired for new builds: `520f9f9`, `56f2040`, `313025f` alone.  
Canonical CI on `fcda7cd`: **NOT RUN** (GHA `37425360211` covers `520f9f9`
only).  
Profile: `internal-grin` AAB. B1 ≠ B2; **neither granted**.  
`adb devices -l` this session: **empty** → every execution row **NOT RUN**,
never PASS.  
Host SQLite / mounted inert React / emulator / CI are **not** physical-device
evidence.

---

## Testers (UIDs via private channel — see coordinator)

| Slot | Role | Availability (dates) | Notes |
|---|---|---|---|
| O | Owner | **today** (2026-10-06) | Identifier / Firebase uid / Play Internal email via **private channel**. Not in git. |
| T1 | Trusted tester 1 | | Identifier via private channel |
| T2 | Trusted tester 2 | | Identifier via private channel |

Play Internal emails and Firebase uids: private channel only. Play list ≠
Firestore admission (Approval A). Do not request passwords / OTPs / keys /
recovery codes here.

---

## Phones

| Slot | Purpose | Model | Android version | Has Play Internal **vc22** now? | Available when |
|---|---|---|---|---|---|
| D1 | Upgrade over vc22 (`PLAY_INSTALLED`) | **OnePlus 12R** | **Android 16** | **yes** (Vyaamikk Diary vc22) | **today** (2026-10-06) |
| D2 | Clean install (`PLAY_INSTALLED` or labelled `NATIVE_DEVICE`) | | | must be empty or uninstalled **after** D1 record saved | |
| TalkBack | A11 (may be D1 or D2) | may use D1 OnePlus 12R | Android 16 | yes on D1 | today if run on D1 |

D1 is the **upgrade** device. D2 **clean-install** device is still **unnamed**
— leave model / Android / availability **blank** until the owner names it.
If only one phone: run D1 first, save the record, then D2 on the same device
after uninstall. That still needs the owner to confirm D2 on OnePlus 12R;
do not assume it.

Do not invent device serials, IMEIs, or Android IDs.

---

## Backend / data (do not override)

- Live GRIN (Approval A): **NOT present** — GRIN seven **ABSENT**. Useful GRIN
  register rows need live callables + seeded admission later.
- XR / original-read: **N/A until backend**. Do not mark PASS.
- Until lifecycle is approved: **synthetic** GRIN only. No customer originals.
