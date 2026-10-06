# Internal AAB candidate — billing correction pending

**2026-10-06.** Team 3 observation only. Combined is **read-only**. No
EAS/Play. B1 ≠ B2; **neither granted**. This instruction does **not**
authorize B1/B2.

The Internal AAB is the coordinator-selected **FINAL** application SHA
**after billing-lifecycle correction + matching completed canonical CI**,
not an intermediate.

| What | SHA |
|---|---|
| **B1 checkout** | FINAL application SHA after billing correction + matching **completed** CI |
| Current application (may be superseded) | `fcda7cd64e9622e50c38223a7156f0f6b8ca5576` |
| Combined docs HEAD (not a B1 checkout) | `70bdfe4b2ea2a7cf6a9fe5f1cf7bf08ff6ebc4e9` (app blobs = `fcda7cd`) |
| Canonical CI | GHA `37440328976` **IN_PROGRESS** on `70bdfe4` — not matching CI |
| Do **not** build alone | `520f9f9` / `56f2040` / `313025f` |
| Do **not** cite as this candidate's CI | GHA `37425360211` (`520f9f9` only) |

This provenance branch (`team/grin-t3-phone-handoff`) is **not** a B1
checkout. Do not build Combined docs HEAD. Profile `internal-grin` AAB.
versionCode **23 UNRESERVED**. Purchase-entry **off** — not a purchase-test
build.

Phone handoff: `PHONE_HANDOFF.md`.
