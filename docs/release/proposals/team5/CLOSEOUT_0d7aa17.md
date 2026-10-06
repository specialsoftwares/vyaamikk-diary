# Team 5 closeout — pin / CI / register at `0d7aa17`

AI QA / release-gate role, not human certification. Combined
`/Users/shivamsaurav/vyd-worktrees/grin-combined` was **read-only**. This
worktree was **not** reset. Historical dirty workspace **not** edited.
**No deploy.** Parent `GRIN_OPS_ALLOW_LIVE` remained **unset**.

Scope is **only** operational/integration change after Team 5
`S1_S2_POST_FIX.md` (`1e33894`). S1 / S2 / P3 are **not reopened** (no new
failure). Entire GRIN history is **not** re-reviewed. Device / live
backend / billing / public are **not accepted**. P8 is **not flipped**.

Leftover dirty `POLICY_QA.md` / issuance-monthly-allowance copies still
describe **P3 FAIL at `5d5df3d`**. They were **left uncommitted**.

---

## Coordinates (verified)

| Item | Value |
|---|---|
| QA worktree | `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa` `team/grin-t5-qa` @ `1e33894` before this file |
| Combined (read-only) | `/Users/shivamsaurav/vyd-worktrees/grin-combined` `integration/grin-g1-g5-source` |
| Docs freeze HEAD | `aea65c170adb25f09ca1045593f18847df2f3b30` |
| Published CI / PR head | `0d7aa17a6efcf3ce6874269eb57afda0a2b45559` |
| Application SHA | `520f9f98bc952fd7f30a907da9e85774629a69c0` |
| Helper `PINNED_APP_SHA` at `0d7aa17` | `520f9f98bc952fd7f30a907da9e85774629a69c0` |
| Historical ops-guard bytes | `228a8f58ac83d3c71e853cdccb6e4c4fa64c251f` (`PINNED_APP_SHA` was `5d5df3d…`) |
| Tooling successor | **`0d7aa17`** — **not** byte-identical to `228a8f5` |
| Canonical GHA | Independently recorded run **`37425360211`**, job **`112143748428`**, workflow head **`0d7aa17`**, verify + canonical gate **success**. `gh` unauthenticated here; **not re-fetched**. Inner CI suite counts **not invented**. Do **not** cite `37379529193` (`41b05a4`) or `37351685421` for this SHA. |
| `GRIN_OPS_ALLOW_LIVE` (this shell) | unset |

`git diff --stat 520f9f9 0d7aa17 -- functions src eas.json app.json app firebase.json tools/goods-evidence-storage`: **empty**.
`git diff --stat 520f9f9 HEAD` on those paths at freeze `aea65c1`: **empty**.
`aea65c1` vs `0d7aa17`: docs only (board / register / Jira note).

`git diff 228a8f5 0d7aa17 -- docs/release/packets/grin-ops/grin-functions-op.mjs`: **+1 / −1** pin constant only. Helper blobs differ (`d42c74ba…` vs `23f71103…`).

---

## 1. Helper pin + live-mode reject (TOOLING)

`docs/release/packets/grin-ops/grin-functions-op.mjs` at `0d7aa17`:

```js
export const PINNED_APP_SHA = "520f9f98bc952fd7f30a907da9e85774629a69c0";
```

`assertLiveOverridesRejected()` still aborts when `GRIN_OPS_ALLOW_LIVE === "1"`
and `GRIN_OPS_PINNED_SHA` (or other `LIVE_FORBIDDEN_ENV`) is set. This session
did **not** export `GRIN_OPS_ALLOW_LIVE=1` in the parent shell.

| Command | Label | Result |
|---|---|---|
| `unset GRIN_OPS_ALLOW_LIVE GRIN_OPS_PINNED_SHA PINNED_APP_SHA; node --test --test-name-pattern 'live mode rejects' docs/release/packets/grin-ops/grin-functions-op.test.mjs` (combined) | TOOLING | exit **0**. TAP: **pass 3** (fixture / **source-pin** / hang), fail 0, skipped 31 |
| same file, full `node --test` | TOOLING | exit **0**. TAP this run: `# tests 34` `# pass 34` `# fail 0` (observed here; not a GHA inner count) |

Named case `live mode rejects source-pin override before mutation` **passed**.
That is TOOLING, **not** application CI, **not** LIVE_BACKEND.

---

## 2. Coordinator register vs stale lines

Authoritative table: `docs/release/RELEASE_COMPLETION_REGISTER.md`
**Current state (authoritative — 2026-10-06 closeout)** at `aea65c1`.

It **does not** claim device, live backend, billing, or public pass:

| Gate (register) | Stated |
|---|---|
| SOURCE READY | app `520f9f9` + tooling `0d7aa17` + GHA `37425360211` |
| BACKEND PILOT READY | A1 offerable, **not authorized**; GRIN seven ABSENT |
| INTERNAL BUILD READY | freeze + CI; B1≠B2, **neither granted** |
| DEVICE ACCEPTED | **NOT RUN** |
| BILLING ACCEPTED | catalog **NOT RUN**; purchases **off** |
| PUBLIC SUBMISSION / ROLLOUT | blocked / not authorized |

A later workstream row still says Team 5 “Device/Play/live/GHA **NOT RUN**”.
The register header says such historical lines are **superseded** for
`520f9f9` / `0d7aa17`. That stale row is **not** treated as current-state
and does **not** convert SOURCE CI into device/live acceptance.

---

## 3. Label split

| Host | This closeout |
|---|---|
| SOURCE | Pin constant + empty app diff `520f9f9`…`0d7aa17` |
| SOURCE CI | GHA `37425360211` / `112143748428` on `0d7aa17` recorded; **not** live; **not** device |
| TOOLING | Ops-guard re-run above; live-mode still rejects `GRIN_OPS_PINNED_SHA` |
| INJECTED / EMULATOR (S1/S2) | Prior `1e33894` — **not re-run**; **not reopened** |
| LIVE_BACKEND | **NOT RUN** (no inspect/apply; `GRIN_OPS_ALLOW_LIVE` unset) |
| NATIVE_DEVICE / PLAY_INSTALLED | **NOT RUN** |
| Payment / public-submission | **NOT RUN** / **not accepted** |

`0d7aa17` CI is **SOURCE CI only**.

---

## 4. Team 2 / 3 / 4 new source

No new application source on combined after the T5 post-fix fold
(`git log 074f082..HEAD -- functions src tools/goods-evidence-storage tools/goods-evidence-emulator eas.json app.json app firebase.json` empty).

Team worktrees (read-only HEADs): T2 `0cd3473`, T3 `7bdf375`, T4 `ec4a03d`.
Those packets were **not** independently re-reviewed here.

**WAITING** (do not invent a pass): owner GiB / capacity economics; public
deletion window; Internal AAB / B1; owner 15-vs-180 decision sheet
completion; Play catalog.

---

## 5. Deletion / P8 (behavioral, not a name-search close)

`npx --yes tsx functions/src/deletion/grinCleanup.unit.test.ts` — INJECTED
exit **0**. Observed behavior:

- `INCLUDE_GRIN_IN_ACCOUNT_PURGE === false`
- `purgeGrinEvidenceIfEnabled` without `force` returns `attempted: false`,
  `detail: "grin_purge_disabled"` even when `users/{uid}/grinEvidence/**`
  objects exist
- Default `USER_STORAGE_CATEGORIES` still omit `grinEvidence`; default
  `USER_SUBCOLLECTIONS` still omit GRIN trees
- `runFinalAccountPurge` still gates GRIN behind the flag
- `DELETION_GRACE_MS` still 15 days

An inactive flag is **not** an operational deletion service.
**P8 remains FAIL.** Do not flip the flag.

---

## Prior findings (not reopened)

| ID | Status |
|---|---|
| S1 | **PASS** at INJECTED + named G2 EMULATOR (`1e33894`). Not re-run. No new failure. |
| S2 | **PASS** at that same boundary. Not re-run. No new failure. |
| P3 | **ACCEPTED**. Not re-run. No new issuance failure. |
| P8 | **FAIL** (above). |

---

## Verdict

**PASS at TOOLING + SOURCE CI boundary** for the pin apply
(`PINNED_APP_SHA=520f9f9` at `0d7aa17`) and recorded GHA
`37425360211` / `112143748428` on that SHA. Live-mode still rejects
`GRIN_OPS_PINNED_SHA`. Register current-state does **not** claim
device/live/billing/public.

**NOT RUN:** LIVE_BACKEND inspect/apply, NATIVE_DEVICE, PLAY_INSTALLED,
billing catalog/purchases, public submission, A1 deploy, S1/S2 re-exec,
P3 re-exec, GHA API re-fetch.

Do not mark GRIN / device / billing / public Done.
