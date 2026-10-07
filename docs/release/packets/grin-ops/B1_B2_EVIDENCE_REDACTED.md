# B1 / B2 evidence (redacted)

**No credentials, keystore material, tester emails, UIDs, or phone numbers.**

Updated: **2026-10-07**

## Application pin (unchanged)

| Item | Value |
|---|---|
| Application SHA | `540e07aa07f376716484adb879ce66cb9fb170ce` |
| CI identity | GHA **`37445383607` SUCCESS** on `7e0d629`; `DEPLOYMENT_PATHS` empty vs `540e07a` |
| Package | `com.specialsoftwares.vyaamikkdiary` |
| Version | `1.0.0` / versionCode **23** |
| EAS profile | `internal-grin` (purchase-entry `0`, quota-upsell `0`, goods evidence on) |

## B1 — EAS AAB (complete)

| Item | Value |
|---|---|
| Status | **COMPLETE** |
| EAS build ID | `8c789fa9-705a-4a97-9d87-ba6d6dbd3b88` |
| AAB SHA-256 | `dc2dbf61d6fda549f77a4e16cbf093b0d3b61fa011a7902cfc6dd6925e3ae24c` |
| Mapping SHA-256 | `09e2fe76ece46e4b6080d2e996ab265ee7b69c04ff25109036fad1b588c744ba` |
| Auto-submit | **No** |
| Durable archive | Outside repository under access-controlled local private storage (path not published) |

## Signing (public fingerprints only)

| Role | SHA-256 | Match to AAB |
|---|---|---|
| **Upload key** (Play Console + AAB signer) | `E6:88:FA:0B:A5:FA:3B:D3:05:85:11:4F:8C:21:43:E1:EF:DD:A1:AC:BF:DB:9D:AA:DC:42:DA:89:61:78:75:2A` | **MATCH** |
| **App signing key** (Google Play App Signing; delivery identity) | `B9:C5:21:E3:B5:7E:AB:0C:3D:3D:C7:B8:5D:E9:1D:67:EF:9F:2A:BD:90:CC:69:50:C5:70:0B:4F:26:36:CE:92` | Distinct (expected) |

Upload key SHA-1 (AAB / Play): `20:F8:15:0E:21:3C:9C:3F:84:FD:CA:C5:1E:9E:4D:CC:EE:A2:42:AD`

## Play inventory (pre-B2 live read, 2026-10-07)

- Unfiltered App bundle explorer: **9** versions
- Highest Active before upload: **22** (`1.0.0`)
- Search `23`: **No results** → versionCode 23 unused before upload

## B2 — Internal Testing upload (complete)

| Item | Value |
|---|---|
| Status | **COMPLETE** (upload + publish to Internal Testing) |
| Track | **Internal testing** (Active) — existing tester audience unchanged |
| Release | **23 (1.0.0)** |
| Console status | Available to internal testers · Released **7 Oct 10:45** (local) · Not reviewed |
| Tester join link | `https://play.google.com/apps/internaltest/4699683181760265777` |
| Production / open / closed | Not modified |
| Tester list | Not expanded |
| Billing / purge / main / public | Not authorized / not done |

**Upload ≠ device acceptance.** D1 OnePlus 12R upgrade remains owner-installed.

## Explicit limitations

- Authenticated LIVE F: still **WAITING**
- P8 purge: off
- Payments / purchase-entry: off
- No uninstall / clear data of vc22
