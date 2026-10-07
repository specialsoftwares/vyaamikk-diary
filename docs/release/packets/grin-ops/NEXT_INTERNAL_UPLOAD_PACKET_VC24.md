# Next Internal Testing upload packet — vc24 (**B2 COMPLETE**)

Build + Internal Testing upload complete. Device D1 remains separate.

## Artifact uploaded

| Item | Value |
|---|---|
| Application SHA | `7c938f836891411752e6fa6af8879ddfe275ab60` |
| EAS build | `c931da3d-4dcb-472e-9c63-f72217c6d95c` |
| Package | `com.specialsoftwares.vyaamikkdiary` |
| versionName / versionCode | `1.0.0` / **24** |
| AAB SHA-256 | `dbda921d1da8b425aaa3f8b0556cf5e43665ab7bd189138a12c20d2b06bfd43d` |
| Upload-key SHA-256 | `E6:88:FA:0B:A5:FA:3B:D3:05:85:11:4F:8C:21:43:E1:EF:DD:A1:AC:BF:DB:9D:AA:DC:42:DA:89:61:78:75:2A` |
| Profile flags | purchase-entry `0`, quota-upsell `0`, GRIN enabled+admit `1` |
| Durable archive | access-controlled `vyd-private` (path not published) |

## B2 result (2026-10-07)

| Item | Value |
|---|---|
| Track | Internal testing — Active |
| Release | **24 (1.0.0)** — Available to internal testers · Released **7 Oct 20:30** |
| Tester link | `https://play.google.com/apps/internaltest/4699683181760265777` |
| Testers | Unchanged |
| Production / open / closed | Not touched |

## Remaining owner step

1. Owner D1: Play upgrade over installed vc23 on OnePlus 12R — no uninstall/clear/OTP loops.
2. Record PLAY_INSTALLED evidence; do not mark live/billing/public Done from upload alone.

## Explicitly out of scope until separately authorized

Functions redeploy, IAM, billing/purge activation, OTA, main merge, public submission.
