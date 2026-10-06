# Owner device form — Internal GRIN (OnePlus 12R upgrade)

Fill remaining blanks via an **approved private channel** (coordinator
chat or an out-of-repo file the coordinator names). Do **not** invent
names, emails, UIDs, or passwords. Do not paste secrets, OTPs, keys, or
recovery codes into git. Do not write Firebase tester UIDs into this file.

**Firebase Auth UIDs only.** Play Internal email is a **separate**
identifier from the Firebase UID and from GRIN admission
(`users/{uid}/goodsEvidenceAdmission/runtime`, Approval A — not present).

Exact coordinator → owner ask (one line):

Please reply here (or in an out-of-repo file I name) with your Firebase Auth UID only — no password, OTP, key, or recovery code; do not git it. Play Internal email is separate from that UID and from GRIN admission.

Internal AAB: coordinator-selected **FINAL** application SHA after
billing-lifecycle correction + matching **completed** canonical CI —
not an intermediate. Current app blobs (may be superseded):
`fcda7cd64e9622e50c38223a7156f0f6b8ca5576`. Combined docs HEAD
`70bdfe4` is **not** a B1 checkout.  
Do **not** build `520f9f9` / `56f2040` / `313025f` alone.  
Canonical CI GHA `37440328976` **IN_PROGRESS** on `70bdfe4` (app blobs =
`fcda7cd`). IN_PROGRESS ≠ matching CI. Do not cite GHA `37425360211`.  
Profile: `internal-grin` AAB. B1 ≠ B2; **neither granted**. This
instruction does **not** authorize B1/B2.  
Purchase-entry `"0"`, quota-upsell `"0"`, `PLAY_BILLING` unset — this
GRIN build is **not** an interactive purchase-test build unless a later
reviewed configuration enables the restricted purchase interface with
server-side tester authorization intact.  
`adb devices -l` this session: **empty** → every execution row
**NOT RUN**, never PASS.  
Host SQLite / mounted inert React / emulator / CI are **not**
physical-device evidence.

Handoff: `docs/release/proposals/team3/PHONE_HANDOFF.md`.

---

## Testers (UIDs via private channel — see coordinator)

| Slot | Role | Availability (dates) | Notes |
|---|---|---|---|
| O | Owner | **today** (2026-10-06) | Firebase Auth UID via **private channel**. Play Internal email separately, also private. Neither in git. |
| T1 | Trusted tester 1 | | Firebase Auth UID via private channel |
| T2 | Trusted tester 2 | | Firebase Auth UID via private channel |

Do not request passwords / OTPs / keys / recovery codes here. Play list ≠
Firestore admission (Approval A) ≠ Firebase UID.

---

## Phones

| Slot | Purpose | Model | Android version | Has Play Internal **vc22** now? | Available when |
|---|---|---|---|---|---|
| D1 | Upgrade over vc22 (`PLAY_INSTALLED`) | **OnePlus 12R** | **Android 16** | **yes** (Vyaamikk Diary vc22) | **today** (2026-10-06) |
| D2 | Clean install (`PLAY_INSTALLED` or labelled `NATIVE_DEVICE`) | | | must be empty or uninstalled **after** D1 record saved **and** owner agreement to § loss-risk | |
| TalkBack | A11 (may be D1 or D2) | may use D1 OnePlus 12R | Android 16 | yes on D1 | today if run on D1 |

D1 is the **upgrade** device. Owner FINAL: prepare this device even if a
second phone is still unnamed. D2 **clean-install** stays **pending
until actually executed**. Leave model / Android / availability
**blank** until the owner names it.

Do not invent device serials, IMEIs, or Android IDs. Do **not** uninstall
or clear vc22 data on the OnePlus 12R in this packet.

---

## Loss-risk if the owner later agrees to a clean install

Uninstall, “clear storage”, or a factory-style app reset on D1 (or any
phone used as D2) destroys:

- Unsynced ordinary diary / PO / credit / letterhead rows in **local
  SQLite** that have not reached the server
- PDFs generated and stored on the device
- GRIN outbox / pending evidence uploads / local serials not yet issued
- On-device session (re-OTP required)

A second phone is preferred for D2. Using D1 as D2 after uninstall is
allowed only after the D1 upgrade record is saved **and** the owner
agrees to the loss above. Clean-install coverage stays pending until
that happens. Team 3 will not perform that wipe.

---

## Backend / data (do not override)

- Live GRIN (Approval A): **NOT present** — GRIN seven **ABSENT**. Useful
  GRIN register rows need live callables + seeded admission later.
- XR / original-read: **N/A until backend**. Do not mark PASS.
- Until lifecycle is approved: **synthetic** GRIN only. No customer
  originals.
