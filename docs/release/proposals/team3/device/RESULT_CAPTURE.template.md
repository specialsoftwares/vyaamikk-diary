# Device result-capture template — Internal GRIN (OnePlus 12R upgrade)

Copy one block **per executable row**. Fill on the phone after the named
run. Do **not** invent UIDs, serials, IMEIs, OTPs, passwords, or recovery
codes. Do **not** commit raw Firebase uids — hash if a shared log needs a
correlation id. Customer PDFs / GSTIN / tokens stay out of git.

Internal AAB: coordinator-selected **FINAL** SHA after billing-lifecycle
correction + matching **completed** CI. Current app blobs (may be
superseded): `fcda7cd64e9622e50c38223a7156f0f6b8ca5576`. Do not build
`520f9f9` / `56f2040` / `313025f` alone. Profile: `internal-grin` AAB.
B1/B2 **not granted**. Purchase-entry **off** — not a purchase-test
build. Live GRIN seven **ABSENT** — G1/G3/G7/XR cannot be product PASS
until later backend.

Host SQLite / mounted inert React / emulator / CI = **not** evidence.
No connected phone = leave **NOT RUN**. Scripts never auto-PASS.

Firebase Auth UID via coordinator chat or out-of-repo file. Play Internal
email is separate from that UID and from GRIN admission.

```
ROW_ID:
DATE (local):
TESTER_SLOT: O / T1 / T2   (uid via private channel — see coordinator)
ARTIFACT_CLASS: PLAY_INSTALLED / NATIVE_DEVICE
PACKAGE: com.specialsoftwares.vyaamikkdiary
INSTALLED_VERSION_NAME:
INSTALLED_VERSION_CODE:
AAB_OR_APK_SHA256:          (empty until B1 artifact exists)
GIT_COMMIT_ON_BINARY:       (FINAL SHA after billing correction + matching CI)
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
- Status until executed: **NOT RUN** (pending owner agreement to
  uninstall / data-loss risk in `PHONE_HANDOFF.md` §8)
