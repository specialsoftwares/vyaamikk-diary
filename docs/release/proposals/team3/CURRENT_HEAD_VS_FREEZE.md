# Current combined HEAD vs Internal AAB freeze

**2026-10-06.** Team 3 observation only. Combined
`/Users/shivamsaurav/vyd-worktrees/grin-combined` is **read-only**.
Historical workspace is **read-only**. Freeze SHA is **unchanged**.
B1 ≠ B2; **neither granted**. No EAS/native/prebuild/OTA. No Play write.
No testers invented.

---

| What | SHA | Role |
|---|---|---|
| **Internal AAB freeze (this packet)** | `520f9f98bc952fd7f30a907da9e85774629a69c0` | S1/S2 application. **Only** checkout B1 may use under this packet. |
| Canonical CI for that freeze | GHA **`37425360211`** / job **`112143748428`** / head **`0d7aa17a6efcf3ce6874269eb57afda0a2b45559`** | Matching CI for `520f9f9`. Does **not** cover `56f2040`. |
| Helper-pin tree | `0d7aa17` | Use only if the owner insists the pin is in-tree. Application blobs still `520f9f9`. |
| **Current combined application** | `56f2040e30159579edc0cbfbc88e2ba706a6abd2` | T2 capacity/cleanup fold. **Not** the freeze. Canonical GHA **NOT RUN** on this SHA. |
| Combined docs HEAD (observed) | `28182c2ee8cf4767d3c316f4cc6b337b4bfa240a` | Coordinator-owned note after `56f2040`. **Not** an application SHA. |

`56f2040` is a descendant of `520f9f9`. `git diff --stat 520f9f9 56f2040 -- functions src tools/goods-evidence-storage` is **non-empty**. That is a **new application**, not a docs-only advance.

**B1 must not build `56f2040` under the `520f9f9` freeze packet.** Do not
silently retarget `eas build --profile internal-grin` to combined HEAD.
A later freeze requires a **new** SHA **and** matching canonical CI — this
file does not cut that freeze.

versionCode **23 UNRESERVED**. Profile `internal-grin` AAB. Owner device
form remains **blank**. Live GRIN seven **ABSENT**.
