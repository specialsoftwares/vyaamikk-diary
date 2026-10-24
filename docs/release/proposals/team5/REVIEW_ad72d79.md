# Team 5 independent review — T2 owner-choice `ad72d79`

AI QA / release-gate role, not human certification. Combined
`/Users/shivamsaurav/vyd-worktrees/grin-combined` was **read-only**. This
worktree was **not** reset. Historical dirty workspace **not** edited.
**No deploy.** Parent `GRIN_OPS_ALLOW_LIVE` remained **unset**. Helper
**not** rewritten.

Scope is **only** T2 `2cebe32..ad72d79` (owner 1/3/10 GiB live lookup +
45-day deletion). Entire GRIN history is **not** re-reviewed. S1 / S2 / P3
are **not reopened** (no new reproduction). Device / live backend / billing /
public are **not accepted**. **P8 is not flipped.**

Executed from `REVIEW_OWNER_CHOICE_CHECKLIST.md` (`8a013ae`). Leftover dirty
`POLICY_QA.md` / `issuance-monthly-allowance.regression.test.mjs` /
`public-deletion-retention.regression.test.mjs` still describe **P3 FAIL at
`5d5df3d`**. They were **left uncommitted**.

---

## Coordinates (verified)

| Item | Value |
|---|---|
| QA worktree | `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa` `team/grin-t5-qa` |
| T2 worktree | `/Users/shivamsaurav/vyd-worktrees/grin-t2-evidence` `team/grin-t2-owner-choice-1310` |
| **Reviewed SHA** | `ad72d793c60406e7595a3887f21b63b62e11b4d8` |
| Parent | `2cebe32a8a78dc1928c5abc984a29887ccf7a954` |
| Prior application | `56f2040e30159579edc0cbfbc88e2ba706a6abd2` |
| Combined (read-only, observed) | `313025f902b0a3416815da7ce75a3a7d6bec9559` — same commit message; **not** an ancestor of `ad72d79`; application-path diff vs `ad72d79` **empty** |
| `INCLUDE_GRIN_IN_ACCOUNT_PURGE` | **false** |
| `GRIN_OPS_ALLOW_LIVE` (this shell) | unset |
| `adb devices` | `List of devices attached` (empty) |

---

## Label split (keep separate)

| Host | This review |
|---|---|
| SOURCE | Caps 1/3/10; live lookup; 45-day clocks; flag; advertising scan; packager body match |
| INJECTED / PURE_DOMAIN | Commands below |
| EMULATOR | **NOT RUN** (no new emulator case; S1/S2 named G2 emulator **not** re-executed) |
| LIVE_BACKEND | **NOT RUN** |
| NATIVE_DEVICE / PLAY_INSTALLED | **NOT RUN** (empty `adb`; never PASS) |
| Payment / public-submission | **NOT RUN** / **not accepted** |

---

## What landed (this slice only)

16 files vs `2cebe32`. Application:

- `OWNER_SELECTED_STORAGE_CAPS_BYTES` = starter **1 GiB** / professional **3 GiB** / business **10 GiB** (free 0)
- `storageCapBytesFromStatus` **returns that table** (historical 1/5/20 and 256 MiB/1/5 remain named, **not** live)
- `DELETION_GRACE_DAYS = 45` in `src/domain/identityLifecycle.ts`
- `DELETION_GRACE_MS = 45 * 24 * 60 * 60 * 1000` in `functions/src/deletion/finalPurge.ts` **and** `functions/src/identity/resolveOrCreateUserByPhone.ts`
- In-app privacy interpolates `DELETION_GRACE_DAYS` (not a hardcoded 15)
- `INCLUDE_GRIN_IN_ACCOUNT_PURGE` still **false**
- Packaged G2 `storageQuota.ts` keeps GENERATED header; body **equals** tools after stripping that line

S1/S2 identity helpers (`parseStorageAccounting` / corrupt-counter fail-closed)
were **not** functionally changed. **Not re-run. Not reopened.**

---

## Assertions (checklist A–G)

### A–B. Caps 1/3/10 used as live lookup — **PASS** (SOURCE + INJECTED)

| Plan | Live bytes | Leftover trap |
|---|---|---|
| starter | `1073741824` | not 256 MiB |
| professional | `3221225472` | **not** 5 GiB |
| business | `10737418240` | **not** 20 GiB |

PURE_DOMAIN `storageCapBytesFromStatus` equals `OWNER_SELECTED_*` and
**not** `PROPOSED_*` / `OWNER_ALTERNATIVE_*`. Adapter still
`storageCapOverrideBytes ?? storageCapBytesFromStatus`.

INJECTED (ephemeral `/tmp/t5-ad72d79-live-lookup.ts`, **no** override; small
16-byte claims against seeded retained bytes — a 3 GiB PDF claim is blocked
by `MAX_PDF_ORIGINAL_BYTES`, which is **not** a cap-table defect):

- professional at 3 GiB − 16: reserve **ok**; at 3 GiB: **quota_exhausted**; no evidence object; accounting unchanged
- 16 bytes over 3 GiB would still fit leftover **5 GiB** — **denied**
- business at 10 GiB − 16: **ok**; at 10 GiB: **denied** (leftover 20 GiB trap)
- starter same at 1 GiB
- missing status: **enforcement_off**, reserve **ok**

First harness attempt that claimed 3 GiB as one PDF **failed** (`ok: false`)
because of the 15 MiB original ceiling. That is **not** a product FAIL.

### C. 45-day grace in identityLifecycle **and** finalPurge — **PASS** (SOURCE)

No split-brain: phone-resolve local copy is also **45**. Not 15. Not 180.
Not 30. `lifecycle.ts` still **imports** `DELETION_GRACE_MS` from
`finalPurge`. Entitlement 90+30 remains distinct (`entitlementLifecycle.test.ts`).
Cleanup lock asserts 45 in all three files and rejects 180.

### D. Flag still false — **PASS** for that fact; **P8 FAIL**

`INCLUDE_GRIN_IN_ACCOUNT_PURGE = false`. `runFinalAccountPurge` still
`if (INCLUDE_GRIN_IN_ACCOUNT_PURGE)`. `scheduledDeletionCleanup` does **not**
import the flag. Default `USER_STORAGE_CATEGORIES` =
`letterhead | attachments | pdfs`. Default `USER_SUBCOLLECTIONS` still omit
GRIN trees.

### E. Behavioral deletion — **PASS** (INJECTED)

`grinCleanup.unit.test.ts` seeds inventory (including a reserved original)
and asserts behaviour, **not** a collection-name search: flag-off leaves
u1+u2; `force: true` empties u1 including nested children and isolates u2;
retry after Storage timeout; second force is empty. Inactive cleanup **≠**
operational deletion service. Live account purge is **not** GRIN-complete.

### F. Capacity fail-closed preserves originals — **PASS** (INJECTED)

Existing holds-map case: 2500 holds; new reserve denied; snapshot identical;
`downloadOriginal` / `retrieveOriginal` of the kept 80-byte original still
**ok**. `HOLDS_MAP_CAPACITY_DETAIL` names **neither** 2500 **nor** GiB.
`MAX_STORAGE_HOLDS = 2500` is not a SKU.

### G. No advertising strings — **PASS** (SOURCE)

`rg` of `1 GiB|3 GiB|10 GiB|5 GiB|20 GiB|256 MiB` in `src/` / `app/` / i18n:
**no matches**. GiB numbers appear only in tools/Functions `storageQuota.ts`
comments (SOURCE, not customer copy). `labels.ts` says caps “must not be
advertised” without naming sizes. Deletion UI still interpolates `{{days}}`.

Public-site HTML left at **15 days** (T2 recorded; not a live site deploy).
**Observation.** Public/Play listing still UNRESOLVED. **P8 stays FAIL.**

---

## Commands actually run (labels + exits)

| Command | Label | Exit |
|---|---|---|
| `python3 /tmp/t5-ad72d79-source.py` | SOURCE | **0** |
| `npx --yes tsx tools/goods-evidence-storage/storageQuota.unit.test.ts` | PURE_DOMAIN | **0** |
| `npx --yes tsx tools/goods-evidence-storage/storageQuota.injected.unit.test.ts` | INJECTED | **0** |
| `npx --yes tsx /tmp/t5-ad72d79-live-lookup.ts` | INJECTED | **0** (first attempt exit **1** was 15 MiB PDF harness, not product) |
| `npx --yes tsx functions/src/deletion/grinCleanup.unit.test.ts` | INJECTED | **0** |
| `npx --yes tsx tools/goods-evidence-emulator/quota.injected.unit.test.ts` | INJECTED (P3) | **0** |
| `npx --yes tsx src/goodsEvidence/entitlementLifecycle.test.ts` | SOURCE / INJECTED clock | **0** |
| `npm run typecheck:goods-evidence-g2` | SOURCE | **0** |
| `adb devices` | NATIVE_DEVICE | empty list — **NOT RUN** |

---

## P3 / P8 / S1 / S2

| ID | Result | Notes |
|---|---|---|
| **S1** | **PASS preserved** | Lookup/table/comments only. No new identity reproduction. **Not re-run.** |
| **S2** | **PASS preserved** | Same. |
| **P3** | **ACCEPTED** | G1 register path **not** in this slice. Re-ran `quota.injected.unit.test.ts` exit **0**. |
| **P8** | **OPEN / FAIL** | Flag false; default purge lists omit GRIN; 180 not implemented; public window UNRESOLVED. 45-day source clock does **not** close P8. |

---

## Peer packets — blockers vs cosmetic (skimmed; do not delay this candidate)

### T1 consolidated `9ae9624` — `CONSOLIDATED_PILOT_PACKET.md`

| Class | Finding |
|---|---|
| Unauthorized access | A1 still client CUD **false**. Not executed. |
| Secret leakage | Smoke never prints UIDs/tokens. No `secret-uids.txt` in git. |
| Unsafe deploy targeting | A3 **HOLD**. Helper pin still `520f9f9`. Proposed pin still names **`56f2040`** and **must retarget** to `ad72d79`. A6 omitted-`--source` **UNPROVEN — REFUSED**. LIVE_BACKEND smoke **REFUSED**. `GRIN_OPS_ALLOW_LIVE` unset. |
| **Blocker for this T2 SHA?** | **No.** Do not execute A3 against `56f2040` now that `ad72d79` exists. |

### T3 device `ddd1598` — freeze-prepare + scripts

| Class | Finding |
|---|---|
| NATIVE_DEVICE | Scripts print `PASS=false` / `NOT_RUN` without a phone. Empty `adb`. **NOT RUN**, never PASS. |
| Unsafe deploy targeting | Named freeze-prepare is **`56f2040`**, explicitly **will retarget** after T2. B1/B2 **not granted**. Building `56f2040` **after** `ad72d79` would omit 1/3/10 + 45-day. Building retired `520f9f9` is also forbidden. |
| **Blocker for this T2 SHA?** | **No** (B1 not granted). Coordinator must not authorize B1 on `56f2040`. |

### T4 billing `7e4ed20` (unchanged this session)

| Class | Finding |
|---|---|
| Unintended charges | Purchase-entry `"0"`; `PLAY_BILLING_ENABLED` absent. LIVE_STORE **NOT RUN**. |
| Broken deletion commitments | Sheets still 15-vs-180 **UNRESOLVED** while source is now **45**. **Cosmetic** until T4 refreshes copy. P8 remains FAIL (GRIN purge). |
| **Blocker for this T2 SHA?** | **No.** |

Cosmetic (do not delay): T4 owner sheets; T1/T3 still naming `56f2040`; helper pin `520f9f9`; public-site HTML still 15 days.

---

## NOT RUN

LIVE_BACKEND inspect/apply, A1–A7 execute, EAS, Play writes, billing
activation, public submission, NATIVE_DEVICE / PLAY_INSTALLED, G2
Firestore/Storage emulator, S1/S2 Team 5 harness re-exec, canonical GHA
API fetch, leftover `5d5df3d` expected-FAIL copies.

---

## Verdict

**PASS at SOURCE + INJECTED** for T2 `ad72d79` vs `2cebe32`: live storage
lookup is owner **1 / 3 / 10 GiB**; deletion grace is **45 days** in
identityLifecycle **and** finalPurge **and** phone-resolve; capacity
fail-closed keeps originals; inactive GRIN cleanup remains off.

**P3 ACCEPTED. P8 FAIL. S1/S2 preserved.** No new defect with a
reproduction. Do not advertise GiB. Do not flip `INCLUDE_GRIN_IN_ACCOUNT_PURGE`.
Do not treat 2500 as a SKU. Do not mark device / billing / public Done.
Do not B1 `56f2040` or `520f9f9` now that this SHA exists.
