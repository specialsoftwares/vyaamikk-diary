# Current combined HEAD vs Internal AAB freeze-prepare

**2026-10-06 (`candidate-1310`).** Team 3 observation only. Combined
`/Users/shivamsaurav/vyd-worktrees/grin-combined` is **read-only**.
Historical workspace is **read-only**. B1 ≠ B2; **neither granted**.
No EAS/native/prebuild/OTA. No Play write. `gh` unauthenticated.

The **`520f9f9` Internal AAB freeze is retired** for new builds. Named
freeze-prepare is Combined application **`56f2040`**. It **will retarget**
when Team 2 commits owner-choice (1/3/10 GiB + 45-day) after `2cebe32`.

---

| What | SHA | Role |
|---|---|---|
| **Named freeze-prepare (this packet)** | `56f2040e30159579edc0cbfbc88e2ba706a6abd2` | Combined application (verified). **Will retarget.** Not a B1 grant. |
| Canonical CI for `56f2040` | **NOT RUN** | Do **not** cite GHA `37425360211`. |
| T2 HEAD (no commit after `2cebe32`) | `2cebe32a8a78dc1928c5abc984a29887ccf7a954` | Owner-choice **not** an application SHA yet. |
| Combined docs (observed, read-only) | `c45518a89a22ac3134e1b9e56f2c9ee97142ac1f` | Owner 1/3/10 GiB + 45-day recorded; application blobs still `56f2040`. Coordinator-owned. |
| **Retired freeze** | `520f9f98bc952fd7f30a907da9e85774629a69c0` | **Do not build.** |
| Retired matching CI | GHA **`37425360211`** / job **`112143748428`** / head **`0d7aa17`** | Covers `520f9f9` only. |

`56f2040` is a descendant of `520f9f9`. Application diff
`functions` / `src` / `tools/goods-evidence-storage` is **non-empty**.

**B1 must not build `520f9f9`.** Do not build Combined docs HEAD. Do not
build this provenance branch. A later freeze requires the T2 owner-choice
SHA **and** matching canonical CI.

versionCode **23 UNRESERVED**. Profile `internal-grin` AAB. Live GRIN seven
**ABSENT**.
