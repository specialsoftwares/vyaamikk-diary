# Team 5 independent review — combined application `313025f`

AI QA / release-gate role, not human certification. Combined
`/Users/shivamsaurav/vyd-worktrees/grin-combined` was **read-only** (git
status stayed clean). This T5 worktree was **not** reset. Historical dirty
workspace **not** edited. **No deploy.** Helper **not** rewritten.
`GRIN_OPS_ALLOW_LIVE` remained **unset**.

Scope is **only** application `313025f` vs `56f2040` (owner 1/3/10 GiB live
lookup + 45-day deletion). Entire GRIN history is **not** re-reviewed.
S1 / S2 / P3 are **not reopened** (no new reproduction). Device / live
backend / billing / public are **not accepted**. **P8 is not flipped.**

Leftover dirty `POLICY_QA.md` / `issuance-monthly-allowance.regression.test.mjs`
/ `public-deletion-retention.regression.test.mjs` still describe **P3 FAIL at
`5d5df3d`**. They were **left uncommitted**.

Prior T2 worktree review: `REVIEW_ad72d79.md`. This file is the combined
application SHA.

---

## Coordinates (verified)

| Item | Value |
|---|---|
| QA worktree | `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa` `team/grin-t5-qa` |
| Combined (read-only) | `/Users/shivamsaurav/vyd-worktrees/grin-combined` `integration/grin-g1-g5-source` |
| **Application SHA** | `313025f902b0a3416815da7ce75a3a7d6bec9559` |
| Provenance | cherry-pick of T2 `ad72d793c60406e7595a3887f21b63b62e11b4d8` |
| vs T2 `ad72d79` on `functions` / `src` / `eas.json` / `app.json` / `app` / `firebase.json` / `tools/goods-evidence-storage` | **empty** |
| Published docs HEAD | `5b3b4cebc607ccbfc0ae366e049fc2e499ccaead` |
| Docs HEAD vs `313025f` on application paths | **empty** |
| Prior application | `56f2040e30159579edc0cbfbc88e2ba706a6abd2` |
| Helper `PINNED_APP_SHA` at `313025f` **and** at `5b3b4ce` | `520f9f98bc952fd7f30a907da9e85774629a69c0` — **STALE vs `313025f`**. **Not rewritten.** |
| Canonical GHA `37425360211` | covers `0d7aa17` / `520f9f9` **only**. Does **not** cover `313025f`. Not re-fetched. |
| `INCLUDE_GRIN_IN_ACCOUNT_PURGE` | **false** |
| `GRIN_OPS_ALLOW_LIVE` (this shell) | unset |
| `adb devices` | `List of devices attached` (empty) |

Application slice `56f2040..313025f` on `functions` / `src` /
`tools/goods-evidence-storage`: **14 files**, +164 / −42. `eas.json` /
`app.json` / `app` / `firebase.json` **unchanged**.

---

## Label split (keep separate)

| Host | This review |
|---|---|
| SOURCE | Caps, live lookup, 45-day clocks, flag, advertising scan, packager body, **stale helper pin** |
| INJECTED / PURE_DOMAIN | Commands below (run on combined working tree = `313025f` blobs) |
| EMULATOR | **NOT RUN** |
| LIVE_BACKEND | **NOT RUN** |
| NATIVE_DEVICE / PLAY_INSTALLED | **NOT RUN** (empty `adb`; never PASS) |
| Payment / public-submission | **NOT RUN** / **not accepted** |

---

## Slice vs `56f2040` (application only)

- `OWNER_SELECTED_STORAGE_CAPS_BYTES` is the **live** table: starter **1 GiB** /
  professional **3 GiB** / business **10 GiB** (free 0).
- `storageCapBytesFromStatus` **returns `OWNER_SELECTED_*`**, not historical
  `PROPOSED_PENDING_OWNER_CONFIRMATION` (1/5/20) and not
  `OWNER_ALTERNATIVE_*` (256 MiB/1/5).
- Adapter path unchanged: `storageCapOverrideBytes ?? storageCapBytesFromStatus`.
- `DELETION_GRACE_DAYS = 45` in `src/domain/identityLifecycle.ts`.
- `DELETION_GRACE_MS = 45 * 24 * 60 * 60 * 1000` in
  `functions/src/deletion/finalPurge.ts` **and**
  `functions/src/identity/resolveOrCreateUserByPhone.ts`.
- `INCLUDE_GRIN_IN_ACCOUNT_PURGE` still **false**. Default purge lists still
  omit GRIN. `scheduledDeletionCleanup` does **not** import the flag.
- Packaged G2 `storageQuota.ts` keeps GENERATED header; body equals tools.
- In-app privacy interpolates `DELETION_GRACE_DAYS`. `src/` / `app/` / i18n
  have **no** `1 GiB` / `3 GiB` / `10 GiB` / leftover 5/20 / 256 MiB strings.
- S1/S2 identity helpers were **not** functionally changed. **Not re-run.**

---

## Verdicts

| Item | Result |
|---|---|
| Live caps 1/3/10 via `OWNER_SELECTED_STORAGE_CAPS_BYTES` | **PASS** SOURCE + INJECTED |
| `DELETION_GRACE_DAYS=45` in identityLifecycle **and** finalPurge (phone-resolve also 45) | **PASS** SOURCE |
| `INCLUDE_GRIN_IN_ACCOUNT_PURGE` false | **PASS** for that fact |
| Capacity fail-closed preserves originals | **PASS** INJECTED |
| No advertising GiB in customer copy | **PASS** SOURCE |
| **P3** | **PASS** (G1 not in slice; `quota.injected.unit.test.ts` exit 0) |
| **P8** | **FAIL** (flag false; GRIN omitted from default purge; public window UNRESOLVED) |
| **S1 / S2** | **PASS preserved** — no new reproduction — **not re-run** |
| Helper pin | **`520f9f9` STALE vs `313025f`** — recorded, not rewritten |
| NATIVE_DEVICE | **NOT RUN** |

INJECTED live lookup (no `storageCapOverrideBytes`; 16-byte claims against
seeded retained bytes): professional **denied** 16 bytes over 3 GiB (leftover
5 GiB trap); business **denied** over 10 GiB (leftover 20 GiB trap); equality
admits; missing status remains `enforcement_off`. Holds-map 2500 case still
keeps the original. Behavioral `grinCleanup` still flag-off skip /
`force:true` isolation — **not** a collection-name search. Inactive cleanup
**≠** operational deletion.

---

## Commands actually run (labels + exits)

Tests executed **in** combined (read-only git; application paths stayed
clean). Combined HEAD `5b3b4ce` is docs-only vs `313025f` on application
blobs.

| Command | Label | Exit |
|---|---|---|
| `python3 /tmp/t5-313025f-source.py` | SOURCE | **0** |
| `npx --yes tsx tools/goods-evidence-storage/storageQuota.unit.test.ts` | PURE_DOMAIN | **0** |
| `npx --yes tsx tools/goods-evidence-storage/storageQuota.injected.unit.test.ts` | INJECTED | **0** |
| `npx --yes tsx /tmp/t5-313025f-live-lookup.ts` | INJECTED | **0** |
| `npx --yes tsx functions/src/deletion/grinCleanup.unit.test.ts` | INJECTED | **0** |
| `npx --yes tsx tools/goods-evidence-emulator/quota.injected.unit.test.ts` | INJECTED (P3) | **0** |
| `npx --yes tsx src/goodsEvidence/entitlementLifecycle.test.ts` | SOURCE / INJECTED clock | **0** |
| `npm run typecheck:goods-evidence-g2` | SOURCE | **0** |
| `adb devices` | NATIVE_DEVICE | empty list — **NOT RUN** |

---

## NOT RUN

LIVE_BACKEND inspect/apply, A1–A7 execute, EAS, Play writes, billing
activation, public submission, NATIVE_DEVICE / PLAY_INSTALLED, G2
Firestore/Storage emulator, S1/S2 Team 5 harness re-exec, canonical GHA
API fetch, leftover `5d5df3d` expected-FAIL copies, helper rewrite.

---

## Verdict

**PASS at SOURCE + INJECTED** for combined application `313025f` vs
`56f2040`. Live storage lookup is owner **1 / 3 / 10 GiB**. Deletion grace is
**45 days** in identityLifecycle **and** finalPurge. Helper pin remains
**`520f9f9` (STALE)**. Canonical GHA `37425360211` does **not** cover this
SHA.

**P3 ACCEPTED. P8 FAIL. S1/S2 preserved.** No new defect with a
reproduction. Do not advertise GiB. Do not flip
`INCLUDE_GRIN_IN_ACCOUNT_PURGE`. Do not rewrite the helper in this review.
Do not mark device / billing / public Done.
