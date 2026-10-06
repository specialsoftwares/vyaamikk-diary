# Device result-capture template — Internal GRIN (`candidate-1310`)

Copy one block **per executable row**. Fill on the phone after the named
run. Do **not** invent UIDs, serials, IMEIs, OTPs, passwords, or recovery
codes. Do **not** commit raw Firebase uids — hash if a shared log needs a
correlation id. Customer PDFs / GSTIN / tokens stay out of git.

Named freeze-prepare: `56f2040e30159579edc0cbfbc88e2ba706a6abd2` (will
retarget). Retired: `520f9f9`. Profile: `internal-grin` AAB. B1/B2 **not
granted**. Live GRIN seven **ABSENT** — G1/G3/G7/XR cannot be product PASS
until later backend.

Host SQLite / mounted inert React / emulator / CI = **not** evidence.
No connected phone = leave **NOT RUN**. Scripts never auto-PASS.

```
ROW_ID:
DATE (local):
TESTER_SLOT: O / T1 / T2   (uid via private channel — see coordinator)
ARTIFACT_CLASS: PLAY_INSTALLED / NATIVE_DEVICE
PACKAGE: com.specialsoftwares.vyaamikkdiary
INSTALLED_VERSION_NAME:
INSTALLED_VERSION_CODE:
AAB_OR_APK_SHA256:          (empty until B1 artifact exists)
GIT_COMMIT_ON_BINARY:
DEVICE_MODEL:               (D1 = OnePlus 12R; D2 = unnamed until owner fills)
ANDROID_VERSION:
DEVICE_SERIAL_OR_ID:        (private / omit from git if identifying)
RAM_GIB:
TALKBACK_VERSION:           (A11 only)
NETWORK_STEPS:              (G2 / I1)
ISSUED_NUMBERS_OBSERVED:    (G1 / G2)
BACKEND: LIVE_BACKEND_SEEDED / backend_absent
STATUS: NOT_RUN / N/A / FAIL / (PASS only after named hardware run)
PASS_EVIDENCE:              (photos of state labels only; no customer data)
NOTES:
```

## D1 prefill (do not treat as a run)

- Device model: OnePlus 12R
- Android: 16
- Play Internal vc22 now: **yes**
- Purpose: **upgrade** over vc22
- Available: **today** (2026-10-06)
- Status until executed: **NOT RUN**

## D2 prefill

- Device model: **blank** (still unnamed)
- Status until executed: **NOT RUN**
