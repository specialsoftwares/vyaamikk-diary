# Team 5 independent review — application `60c4bc1` (already-owned Play lifecycle)

AI QA / release-gate role, not human certification. Combined
`/Users/shivamsaurav/vyd-worktrees/grin-combined` was **read-only** (this
review did not edit it; working tree there was already dirty from other
workstreams). This T5 worktree was **not** reset. Historical dirty
workspace **not** edited. **No deploy.** Helper **not** rewritten.
`GRIN_OPS_ALLOW_LIVE` remained **unset**. `PLAY_BILLING_ENABLED` remained
**unset** in this shell. **No INCLUDE_GRIN_IN_ACCOUNT_PURGE flip.**

Scope is **only** application `60c4bc1` vs prior accepted `fcda7cd`
(skip tester allowlist for **already-owned same-uid** Play token
lifecycle; keep fail-closed **NEW** grants). Entire GRIN history is **not
re-reviewed**. S1 / S2 / P3 are **not reopened** (no new reproduction).
Device / live backend / catalog / RTDN live / Play / public are **not
accepted**. **P8 is not flipped.** **GRIN readiness ≠ billing readiness.**

Leftover dirty `POLICY_QA.md` / `issuance-monthly-allowance.regression.test.mjs`
/ `public-deletion-retention.regression.test.mjs` still describe **P3 FAIL
at `5d5df3d`**. They were **left uncommitted**.

Prior billing-tester slice: `REVIEW_fcda7cd.md`. This file is the
already-owned lifecycle follow-up on that candidate.

Independent INJECTED driver (FakePlay, not source-string search):
`already-owned-play-lifecycle.injected.ts`.

---

## Coordinates (verified)

| Item | Value |
|---|---|
| QA worktree | `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa` provenance `team/grin-t5-review-60c4bc1` |
| Combined (read-only inspect) | `/Users/shivamsaurav/vyd-worktrees/grin-combined` `integration/grin-g1-g5-source` |
| **Application SHA** | `60c4bc179c46b8986ab0dbd2c95db0e4a5ceb49a` |
| Prior accepted application | `fcda7cd64e9622e50c38223a7156f0f6b8ca5576` |
| Combined HEAD at INJECTED re-run | `540e07aa07f376716484adb879ce66cb9fb170ce` |
| Combined vs `60c4bc1` on `functions/src/billing` / `src/billing` / `eas.json` / `app.json` / `app` / `firebase.json` / `package.json` / `tools/billing-acceptance` | **empty** (billing slice matches `60c4bc1`) |
| Combined vs `60c4bc1` on `functions/src/deletion/*` | **not empty** — later `540e07a` inert-P8 purge wiring. **Out of scope.** Not this review. Not accepted. |
| Helper `PINNED_APP_SHA` at `60c4bc1` | `520f9f98bc952fd7f30a907da9e85774629a69c0` — **STALE vs `60c4bc1`**. Pin apply is **coordinator HOLD**. **Not rewritten.** |
| Canonical GHA `37440328976` | covers `fcda7cd` / `70bdfe4` **only**. Does **not** cover `60c4bc1`. `gh auth status`: not logged into any GitHub hosts. **NOT RUN** / **not invented**. |
| `INCLUDE_GRIN_IN_ACCOUNT_PURGE` at `60c4bc1` | **false** |
| `GRIN_OPS_ALLOW_LIVE` (this shell) | unset |
| `PLAY_BILLING_ENABLED` (this shell) | unset |
| `adb devices` | `List of devices attached` (empty) |

Application slice `fcda7cd..60c4bc1` on billing: **6 files**, +325 / −62.
`eas.json` / `app.json` / `app` / `firebase.json` **unchanged**. Remainder
of that range is docs (other teams) — not re-reviewed here.

`60c4bc1` is an ancestor of combined HEAD. Combined is **not** docs-only
after `60c4bc1` once `540e07a` is present. Billing/client blobs used for
this slice still match `60c4bc1`.

---

## Label split (keep separate)

| Host | This review |
|---|---|
| SOURCE | Enablement exact `"true"`, purchase-entry `"0"`, wrapper `enforceRestrictedTesters`, `validate` no longer pre-asserts allowlist, helper **stale**, P8 flag **false** |
| INJECTED | Independent FakePlay driver + `androidPlay.unit.test.ts` (no live Play) |
| EMULATOR | **NOT RUN** |
| LIVE_BACKEND | **NOT RUN** |
| Catalog / RTDN live / Play permissions | **NOT RUN** — do not claim empty |
| NATIVE_DEVICE / PLAY_INSTALLED | **NOT RUN** (empty `adb`; host SQLite is not device evidence) |
| REAL-CHARGE | **NOT RUN** |
| Payment / public-submission | **NOT RUN** / **not accepted** |

---

## Slice vs `fcda7cd` (application)

- `isPlayBillingEnabled` remains exact `"true"` only. Absent / `"false"` /
  `"TRUE"` are off. Production `validateAndActivateAndroid` /
  `prepareAndroidBillingAccount` / `androidRtdn` still check enablement
  **before** Play work.
- `prepareAndroidBillingAccount` still asserts
  `assertPlayBillingTesterAllowed` at the **wrapper** (new Play-account
  bind). Core `handlePrepareAndroidBillingAccount` is unchanged.
- `validateAndActivateAndroid` **no longer** pre-asserts the allowlist.
  Production deps still set `enforceRestrictedTesters: true`. Already-owned
  same-uid restore is adapter-gated.
- Production `androidRtdn` / `scheduledBillingReconciliation` still set
  `enforceRestrictedTesters: true`.
- Adapter `reconcileFetchedSubscription` resolves owner, then skips
  `assertPlayBillingTesterAllowedIfEnforced` only when
  `alreadyOwnsSameUidPurchaseToken` (company uid matches caller/owner uid
  **and** `credentialFingerprint` equals this token). First bind / new
  token still hits the allowlist.
- Empty/absent `PLAY_BILLING_TESTER_UIDS` still denies **NEW** grants.
  Emails still rejected. **No owner tester UIDs committed** outside
  tests/docs.
- `eas.json` `preview` / `production` / `internal-grin`:
  `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` **`"0"`** and
  `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` **`"0"`**.
- `INCLUDE_GRIN_IN_ACCOUNT_PURGE` still **false**. **Not flipped.**
- S1/S2 identity helpers were **not** functionally changed. **Not re-run.**

`REVIEW_fcda7cd.md` SOURCE residual (delisted expire/cancel/refund /
voided live-reconcile throwing `play_billing_tester_not_allowlisted`)
**does not reproduce** on this SHA at INJECTED FakePlay.

Intentional fail-closed (not a defect for this slice): a **new** purchase
token after delist is still denied even for the same uid. Play replacement
tokens are new fingerprints → NEW grant.

---

## INJECTED FakePlay scenarios (independent)

Driver imported production adapter / RTDN / validate from combined billing
blobs matching `60c4bc1`. FakePlay only. Distinct UIDs/tokens from the
in-tree unit file.

| # | Scenario | Result |
|---|---|---|
| 1 | Listed tester gets entitlement | **PASS** INJECTED |
| 2 | Tester removed from `PLAY_BILLING_TESTER_UIDS` | **PASS** (setup; empty allowlist after grant) |
| 3 | Expire / `processAndroidVoidedPurchase` refund/revocation updates entitlement; must **not** throw `play_billing_tester_not_allowlisted` | **PASS** INJECTED (also RTDN `voidedPurchaseNotification`) |
| 4 | New grant / RTDN type 4 with no owned token still denied when not listed | **PASS** INJECTED (existing entitlement **not** cleared; same-token validate restore still works) |
| 5 | Different uid cannot receive the token | **PASS** INJECTED (`play_account_owner_mismatch`; forged obfuscated id → `play_credential_index_collision`; Alice stays active) |
| 6 | Failed verification does not clear valid paid entitlement | **PASS** INJECTED (`play_api_not_found`; unqueryable void records refund, `reconciliationRequired`, status stays active) |
| 7 | Duplicate / out-of-order voided events idempotent | **PASS** INJECTED (`alreadyProcessed`; ledger count stays 2) |
| 8 | Purchase-entry still `"0"` | **PASS** SOURCE (`preview` / `production` / `internal-grin`) |
| 9 | `PLAY_BILLING_ENABLED` fail-closed | **PASS** SOURCE + INJECTED (`false`/`TRUE`/absent off; `handleAndroidRtdnHttp` → `play_billing_disabled` before OIDC) |

---

## Verdicts

| Item | Result |
|---|---|
| Listed tester grant | **PASS** INJECTED |
| Delist then expire / voided refund updates live status | **PASS** INJECTED |
| New grant / type 4 fail-closed | **PASS** INJECTED |
| Cross-uid token steal denied | **PASS** INJECTED |
| Failed Play verify does not clear paid entitlement | **PASS** INJECTED |
| Duplicate / out-of-order voided idempotent | **PASS** INJECTED |
| Purchase-entry `"0"` | **PASS** SOURCE |
| `PLAY_BILLING_ENABLED` fail-closed (exact `"true"`) | **PASS** SOURCE + INJECTED |
| **P3** | **ACCEPTED** preserved (`quota.injected`) — **not re-run** |
| **P8** | **FAIL** (`INCLUDE_GRIN_IN_ACCOUNT_PURGE=false` at `60c4bc1`; GRIN omitted from default purge). Later combined `540e07a` **not** used to flip this. |
| **S1 / S2** | **PASS preserved** — no new reproduction — **not re-run** |
| Helper pin | **`520f9f9` STALE vs `60c4bc1`** — recorded, not rewritten |
| Catalog / RTDN live / Play permissions | **NOT RUN** |
| NATIVE_DEVICE | **NOT RUN** |
| Canonical GHA for `60c4bc1` | **NOT RUN** (`37440328976` is `fcda7cd`/`70bdfe4` only) |

`REVIEW_fcda7cd.md` SOURCE+INJECTED PASS for fail-closed **new** tester
admission **stands**. This slice only changes already-owned lifecycle.

---

## Commands actually run (labels + exits)

Tests executed **against combined billing blobs identical to `60c4bc1`**
(combined git not edited by this review). Combined HEAD `540e07a` is a
later deletion-path commit, **not** this application SHA.

| Command | Label | Exit |
|---|---|---|
| `npx --yes tsx functions/src/billing/google/playConstants.unit.test.ts` | SOURCE | **0** (`playConstants.unit.test.ts: ok`) |
| `npx --yes tsx functions/src/billing/google/androidPlay.unit.test.ts` | INJECTED | **0** (`androidPlay.unit.test.ts: ok`) |
| `bash tools/billing-acceptance/run-restricted-billing-source.sh` | SOURCE (wrapper; includes INJECTED play + money/recon/entitlement/transition/iap + deletion-grace-copy) | **0** (`SOURCE acceptance PASS`) |
| `GRIN_QA_REPO_ROOT=…/grin-combined npx --yes tsx docs/release/proposals/team5/already-owned-play-lifecycle.injected.ts` | INJECTED (Team 5 FakePlay) | **0** (`TEAM5_ALREADY_OWNED_PLAY_LIFECYCLE: ok`; PASS 1–9) |
| `adb devices` | NATIVE_DEVICE | empty list — **NOT RUN** |
| `gh auth status` | Canonical CI | not logged in — **NOT RUN** |

The SOURCE wrapper printed `ok preview/production/internal-grin:
purchase-entry=0 quota-upsell=0` and `LIVE_STORE: NOT RUN`. It refused to
run if `PLAY_BILLING_ENABLED=true`; that key was unset. Wrapper HEAD
banner was `540e07a`; billing tests still ran `60c4bc1`-identical billing
source.

Lifecycle PASS is the FakePlay driver, **not** `playConstants` source-string
presence of `alreadyOwnsSameUidPurchaseToken`.

---

## NOT RUN

LIVE_BACKEND inspect/apply, A1–A7 execute, EAS, Play writes, billing
activation, catalog/RTDN live, REAL-CHARGE, public submission,
NATIVE_DEVICE / PLAY_INSTALLED, G2 Firestore/Storage emulator, S1/S2 Team 5
harness re-exec, canonical GHA API fetch for `60c4bc1`, leftover `5d5df3d`
expected-FAIL copies, helper rewrite, `INCLUDE_GRIN_IN_ACCOUNT_PURGE` flip,
review of combined `540e07a` P8 deletion wiring.

---

## Blockers

**None** for Internal candidate `60c4bc1` at SOURCE/INJECTED for this
already-owned Play lifecycle slice. No unauthorized cross-uid grant path,
no committed tester UIDs or billing secrets, no purchase-entry `"1"`, no
enablement of `PLAY_BILLING_ENABLED`.

Do not delay the GRIN Internal candidate on billing-activation residuals
or on later combined `540e07a` P8 wiring.

---

## Verdict

**PASS at SOURCE + INJECTED** for Internal candidate `60c4bc1` vs
`fcda7cd` **for already-owned same-uid Play token lifecycle only**.
Delist no longer blocks expire / refund / restore / duplicate voided
events on the owned token. NEW grants and RTDN type 4 without an owned
token stay fail-closed. Cross-uid bind fails. Failed verification does
not clear a valid paid entitlement. Purchase-entry stays `"0"`.
`PLAY_BILLING_ENABLED` stays fail-closed. Helper pin remains
**`520f9f9` (STALE)**. Canonical GHA **`37440328976` does not cover this
SHA**.

**P3 ACCEPTED. P8 FAIL. S1/S2 preserved.** No new defect with a
reproduction that blocks Internal GRIN.

**GRIN readiness ≠ billing readiness.** This SHA does **not** enable
Play billing, does **not** accept catalog/RTDN/LIVE_STORE/REAL-CHARGE, and
does **not** mark Packet E / device / billing / public Done. Do not flip
`INCLUDE_GRIN_IN_ACCOUNT_PURGE`. Do not rewrite the helper in this review.
Do not treat later combined `540e07a` as this application SHA.
