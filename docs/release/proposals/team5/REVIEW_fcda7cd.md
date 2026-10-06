# Team 5 independent review — application `fcda7cd` (billing-tester slice)

AI QA / release-gate role, not human certification. Combined
`/Users/shivamsaurav/vyd-worktrees/grin-combined` was **read-only** (git
status stayed clean). This T5 worktree was **not** reset. Historical dirty
workspace **not** edited. **No deploy.** Helper **not** rewritten.
`GRIN_OPS_ALLOW_LIVE` remained **unset**. `PLAY_BILLING_ENABLED` remained
**unset** in this shell.

Scope is **only** application `fcda7cd` vs prior accepted `313025f`
(fail-closed restricted Play tester admission; billing **not** enabled).
Entire GRIN history is **not** re-reviewed. S1 / S2 / P3 are **not
reopened** (no new reproduction). Device / live backend / catalog / RTDN
live / Play / public are **not accepted**. **P8 is not flipped.**
**GRIN readiness ≠ billing readiness.**

Leftover dirty `POLICY_QA.md` / `issuance-monthly-allowance.regression.test.mjs`
/ `public-deletion-retention.regression.test.mjs` still describe **P3 FAIL at
`5d5df3d`**. They were **left uncommitted**.

Prior combined application review: `REVIEW_313025f.md`. This file is the
billing-tester slice on that candidate.

---

## Coordinates (verified)

| Item | Value |
|---|---|
| QA worktree | `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa` provenance `team/grin-t5-review-fcda7cd` |
| Combined (read-only) | `/Users/shivamsaurav/vyd-worktrees/grin-combined` `integration/grin-g1-g5-source` |
| **Application SHA** | `fcda7cd64e9622e50c38223a7156f0f6b8ca5576` |
| Prior accepted application | `313025f902b0a3416815da7ce75a3a7d6bec9559` |
| Published docs HEAD | `df889eca387fb70a31ad69069e2e4afc0c650f6f` |
| Docs HEAD vs `fcda7cd` on `functions` / `src` / `tools/billing-acceptance` / `package.json` / `eas.json` / `app.json` / `app` / `firebase.json` | **empty** |
| Helper `PINNED_APP_SHA` at `fcda7cd` **and** at `df889ec` | `520f9f98bc952fd7f30a907da9e85774629a69c0` — **STALE vs `fcda7cd`**. Pin apply is **coordinator HOLD**. **Not rewritten.** |
| Canonical GHA | **NOT RUN** (`gh auth status`: not logged into any GitHub hosts). Do not invent coverage of `fcda7cd`. Prior recorded run `37425360211` covers `0d7aa17` / `520f9f9` **only**. |
| `INCLUDE_GRIN_IN_ACCOUNT_PURGE` | **false** |
| `GRIN_OPS_ALLOW_LIVE` (this shell) | unset |
| `PLAY_BILLING_ENABLED` (this shell) | unset |
| `adb devices` | `List of devices attached` (empty) |

Application slice `313025f..fcda7cd`: **21 files**, +1144 / −66. Billing /
deletion-copy / `package.json` script are the application delta. `eas.json` /
`app.json` / `app` / `firebase.json` **unchanged**. Remainder is docs.

---

## Label split (keep separate)

| Host | This review |
|---|---|
| SOURCE | Fail-closed enablement, empty allowlist, email reject, wrapper `enforceRestrictedTesters`, purchase-entry `"0"`, 45-day copy, **stale helper pin** |
| INJECTED | `androidPlay.unit.test.ts` FakePlay grant/deny (no live Play) |
| EMULATOR | **NOT RUN** |
| LIVE_BACKEND | **NOT RUN** |
| Catalog / RTDN live / Play permissions | **NOT RUN** — do not claim empty |
| NATIVE_DEVICE / PLAY_INSTALLED | **NOT RUN** (empty `adb`; host SQLite is not device evidence) |
| REAL-CHARGE | **NOT RUN** |
| Payment / public-submission | **NOT RUN** / **not accepted** |

---

## Slice vs `313025f` (application)

- `isPlayBillingEnabled` remains exact `"true"` only. Absent / `"false"` /
  `"TRUE"` are off.
- Empty or absent `PLAY_BILLING_TESTER_UIDS` parses to an empty set and
  **denies all** once the allowlist is asserted.
- CSV / JSON array / JSON object (`uids`, `firebaseUids`, `testerUids`,
  nested env-name key) accepted. Strings containing `@` throw
  `play_billing_tester_allowlist_email_not_uid`. Malformed JSON throws
  `play_billing_tester_allowlist_malformed` (not treated as empty).
  Emails-only JSON object (`{"emails":[...]}`) yields empty set → deny all.
- **No owner tester UIDs committed** outside tests/docs.
- Production `validateAndActivateAndroid` / `prepareAndroidBillingAccount`
  still check enablement **then** `assertPlayBillingTesterAllowed`.
- Production `androidRtdn` / `scheduledBillingReconciliation` /
  `validateAndActivateAndroid` set `enforceRestrictedTesters: true`.
  Adapter `reconcileFetchedSubscription` calls
  `assertPlayBillingTesterAllowedIfEnforced` **after**
  `assertOwnerMatchesCaller`.
- Unit tests omit `enforceRestrictedTesters` except the new restricted-tester
  block (empty deny; listed UID grant; RTDN type 4 /
  `SUBSCRIPTION_PURCHASED` deny; no `subscription/status` written).
- `eas.json` `preview` / `production` / `internal-grin`:
  `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` **`"0"`** and
  `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` **`"0"`**.
- `deletionGraceCopy.unit.test.ts` interpolates `DELETION_GRACE_DAYS` and
  rejects leftover `starts a 15-day`. Constant remains **45**.
- `INCLUDE_GRIN_IN_ACCOUNT_PURGE` still **false**. **Not flipped.**
- S1/S2 identity helpers were **not** functionally changed. **Not re-run.**

SOURCE residual (billing-activation HOLD, **not** an Internal GRIN blocker
while `PLAY_BILLING_ENABLED` is off and purchase-entry is `"0"`):
`processAndroidVoidedPurchase` still records the refund, then live-reconciles
via `reconcileFetchedSubscription`, which now hits the allowlist. The
voided-function source slice lacks the identifier; the indirect call does
not. A later de-listed tester’s expire/cancel/refund RTDN or scheduled
revalidate can fail `play_billing_tester_not_allowlisted` (non-retryable →
reconciliation **terminal**) without clearing live entitlement. Do **not**
enable billing to reproduce. Do **not** treat as LIVE_STORE.

---

## Verdicts

| Item | Result |
|---|---|
| `PLAY_BILLING_ENABLED` fail-closed (exact `"true"`) | **PASS** SOURCE |
| Empty/absent `PLAY_BILLING_TESTER_UIDS` denies all | **PASS** SOURCE + INJECTED |
| Emails rejected (`@` / emails-only object deny-all) | **PASS** SOURCE |
| RTDN + reconciliation `enforceRestrictedTesters: true` | **PASS** SOURCE; INJECTED RTDN grant-deny |
| Purchase-entry `"0"` on internal-grin / production / preview | **PASS** SOURCE |
| Deletion copy 45-day cancellation window (not leftover 15) | **PASS** SOURCE |
| **P3** | **ACCEPTED** preserved (`quota.injected`) — **not re-run** |
| **P8** | **FAIL** (`INCLUDE_GRIN_IN_ACCOUNT_PURGE=false`; GRIN omitted from default purge) |
| **S1 / S2** | **PASS preserved** — no new reproduction — **not re-run** |
| Helper pin | **`520f9f9` STALE vs `fcda7cd`** — recorded, not rewritten |
| Catalog / RTDN live / Play permissions | **NOT RUN** |
| NATIVE_DEVICE | **NOT RUN** |
| Canonical GHA for `fcda7cd` | **NOT RUN** |

`REVIEW_313025f.md` SOURCE+INJECTED PASS for 1/3/10 GiB + 45-day **stands**.
This slice did not change those tables.

---

## Commands actually run (labels + exits)

Tests executed **in** combined (read-only git; application paths stayed
clean). Combined HEAD `df889ec` is docs-only vs `fcda7cd` on application
blobs.

| Command | Label | Exit |
|---|---|---|
| `npx --yes tsx functions/src/billing/google/playConstants.unit.test.ts` | SOURCE | **0** (`playConstants.unit.test.ts: ok`) |
| `npx --yes tsx functions/src/billing/google/androidPlay.unit.test.ts` | INJECTED | **0** (`androidPlay.unit.test.ts: ok`) |
| `npm run test:deletion-grace-copy` | SOURCE | **0** (`deletionGraceCopy.unit.test.ts: ok`) |
| `bash tools/billing-acceptance/run-restricted-billing-source.sh` | SOURCE (wrapper; includes INJECTED play + money/recon/entitlement/transition/iap) | **0** (`SOURCE acceptance PASS`) |
| `adb devices` | NATIVE_DEVICE | empty list — **NOT RUN** |
| `gh auth status` | Canonical CI | not logged in — **NOT RUN** |

The SOURCE wrapper also printed `ok preview/production/internal-grin:
purchase-entry=0 quota-upsell=0` and `LIVE_STORE: NOT RUN`. It refused to
run if `PLAY_BILLING_ENABLED=true`; that key was unset.

---

## NOT RUN

LIVE_BACKEND inspect/apply, A1–A7 execute, EAS, Play writes, billing
activation, catalog/RTDN live, REAL-CHARGE, public submission,
NATIVE_DEVICE / PLAY_INSTALLED, G2 Firestore/Storage emulator, S1/S2 Team 5
harness re-exec, canonical GHA API fetch, leftover `5d5df3d` expected-FAIL
copies, helper rewrite, `INCLUDE_GRIN_IN_ACCOUNT_PURGE` flip.

---

## Blockers

**None** for Internal candidate `fcda7cd` at SOURCE/INJECTED for this
billing-tester slice. No unauthorized access / cross-account grant path,
no committed tester UIDs or billing secrets, no purchase-entry `"1"`, no
enablement of `PLAY_BILLING_ENABLED`.

Do not delay the GRIN Internal candidate on billing-activation residuals
or cosmetics.

---

## Verdict

**PASS at SOURCE + INJECTED** for Internal candidate `fcda7cd` vs
`313025f` **for the fail-closed restricted Play tester slice only**.
Empty allowlist denies grants; emails are not UIDs; RTDN/reconciliation
production deps set `enforceRestrictedTesters`; purchase-entry stays
`"0"`; deletion copy asserts a **45-day** cancellation window. Helper pin
remains **`520f9f9` (STALE)**. Canonical GHA **NOT RUN**.

**P3 ACCEPTED. P8 FAIL. S1/S2 preserved.** No new defect with a
reproduction that blocks Internal GRIN.

**GRIN readiness ≠ billing readiness.** This SHA does **not** enable
Play billing, does **not** accept catalog/RTDN/LIVE_STORE/REAL-CHARGE, and
does **not** mark Packet E Done. Do not flip
`INCLUDE_GRIN_IN_ACCOUNT_PURGE`. Do not rewrite the helper in this review.
Do not mark device / billing / public Done.
