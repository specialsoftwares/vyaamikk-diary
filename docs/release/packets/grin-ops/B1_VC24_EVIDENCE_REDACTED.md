# B1 / B2 evidence (redacted) — vc24 internal-grin

**No credentials, keystore material, tester emails, UIDs, or phone numbers.**

Updated: **2026-10-07**

## Application pin (this AAB)

| Item | Value |
|---|---|
| Application SHA | `7c938f836891411752e6fa6af8879ddfe275ab60` |
| CI | GHA **`37616692491` SUCCESS** / job **`112776635103`** |
| Package | `com.specialsoftwares.vyaamikkdiary` |
| Version | `1.0.0` / versionCode **24** |
| EAS profile | `internal-grin` |

## B1 — EAS AAB (complete)

| Item | Value |
|---|---|
| Status | **COMPLETE** |
| EAS build ID | `c931da3d-4dcb-472e-9c63-f72217c6d95c` |
| AAB SHA-256 | `dbda921d1da8b425aaa3f8b0556cf5e43665ab7bd189138a12c20d2b06bfd43d` |
| Mapping SHA-256 | `09e2fe76ece46e4b6080d2e996ab265ee7b69c04ff25109036fad1b588c744ba` |
| Auto-submit | **No** |
| Durable archive | Outside repository under access-controlled local private storage (path not published) |

## Signing (public fingerprints only)

| Role | SHA-256 | Match to AAB |
|---|---|---|
| **Upload key** | `E6:88:FA:0B:A5:FA:3B:D3:05:85:11:4F:8C:21:43:E1:EF:DD:A1:AC:BF:DB:9D:AA:DC:42:DA:89:61:78:75:2A` | **MATCH** |
| **App signing key** (Play delivery) | `B9:C5:21:E3:B5:7E:AB:0C:3D:3D:C7:B8:5D:E9:1D:67:EF:9F:2A:BD:90:CC:69:50:C5:70:0B:4F:26:36:CE:92` | Distinct (expected) |

Upload key SHA-1: `20:F8:15:0E:21:3C:9C:3F:84:FD:CA:C5:1E:9E:4D:CC:EE:A2:42:AD`

## Play inventory (pre-B2 live read)

- Unfiltered: **10** versions (1–10 of 10)
- Highest Active before upload: **23** (`1.0.0`)
- Search `24`: **No results** → versionCode 24 unused before upload
- Re-verified AAB SHA-256 **MATCH** + upload-key **MATCH** before upload

## B2 — Internal Testing upload (complete)

| Item | Value |
|---|---|
| Status | **COMPLETE** (upload + publish to Internal Testing) |
| Track | **Internal testing** (Active) — existing tester audience unchanged |
| Release | **24 (1.0.0)** |
| Console status | Available to internal testers · Released **7 Oct 20:30** (local) · Not reviewed |
| Latest release (track summary) | **24 (1.0.0)** |
| Tester join / update link | `https://play.google.com/apps/internaltest/4699683181760265777` |
| Tester lists observed | Known Testers / Owner — **not edited** (Save disabled) |
| Production / open / closed | Not modified |
| Billing / purge / Functions / OTA / main / public | Not authorized / not done |

**Upload ≠ device acceptance.** D1: Play upgrade over installed vc23 on OnePlus 12R — **no** uninstall / clear / OTP loops.

## Explicit limitations

- Authenticated LIVE F: still **WAITING**
- P8 purge: off
- Payments / purchase-entry: off
- Device PLAY_INSTALLED for vc24: **pending owner D1**
