# Shipping-app security register (bounded)

Worktree `draft/goods-evidence-domain-contract` at `55f2df1405c296336eea058238c8ae24e7a8b370`.
Uncommitted vc22/Play dirt preserved, not this SHA.
No production reads, no credential rotation, no scanner install.

Evidence labels: VERIFIED_SOURCE | VERIFIED_SIMULATION | VERIFIED_EMULATOR | VERIFIED_DEVICE | VERIFIED_LIVE_CONFIG
Remediation: NOT_APPLIED | PROPOSED | N/A

This register is not a security certification and does not claim an absence of vulnerabilities.

---

## A. CONFIRMED FINDINGS

### F-LOG-1 Logger retains synthetic email; phone mask works

- **Severity:** Medium for a production console sink if a caller interpolates
  or keys `email`. Not a proven historical disclosure.
- **Reasoning:** Reproduced from actual `src/utils/logger.ts` with
  `env.isProduction === true`. `SENSITIVE_KEY` omits `email`. Message strings
  are not sanitized. Phone keys are masked.
- **Source:** worktree `src/utils/logger.ts` (HEAD domain SHA + dirty icons/vc22
  tree; logger file is the committed logger).
- **Entry / preconditions:** `createLogger(scope).error/warn` in production
  mode (`EXPO_PUBLIC_APP_MODE=production`, store-or-standalone signals).
- **Synthetic reproduction:** `npx tsx analysis/grin-slice2-closeout/logging-repro.ts`
  (Cursor executed; reviewer must re-run). Email `alice.reviewer@example.invalid`.
- **Expected:** email absent from console payload; phone masked.
- **Observed:** email present in message and `{ email }` / nested `user.email`.
  Phone `+919876543210` → `+91***10`. Token key redacted. `href` query
  `sk_test_not_real` retained. HTML key redacted. PDF-like **data** string
  redacted; PDF-like **message** argument retained. 12k non-html string
  redacted by `pdfSafeLog` (>4000), not by logger sanitize. Enumerable
  `Error.customData.email` retained; `Error.message` itself was not enumerable.
  Cyclic payload did not throw.
- **Affected:** process console (Logcat / Xcode), not Crashlytics by this
  finding alone.
- **Minimal fix:** proposed allowlist + classified errors
  (`proposed-patches/logger-allowlist.diff`). Not applied.
- **Regression:** re-run `logging-repro.ts` after patch; email/query markers
  must be absent.
- **Uncertainty:** device console collection / Play pre-launch report not
  inspected.
- **Gate:** core public app.
- **Evidence:** VERIFIED_SIMULATION (Node, actual source). **Remediation:** PROPOSED, NOT_APPLIED.

### F-LOG-2 ErrorBoundary console + enabled Crashlytics forward original Error.message

- **Severity:** Medium after crash-report consent. Low before consent
  (recordError no-op). Console path does not wait for consent.
- **Reasoning:** Extracted `RootErrorBoundary.componentDidCatch` from source.
  `recordError` forwards the Error object to the native SDK when `_enabled`.
- **Entry:** render/lifecycle throw → componentDidCatch; consent
  `setCrashReportingEnabled(true)` from Settings / TelemetryConsentHost.
- **Synthetic:** same `logging-repro.ts`. Disabled: crash sink empty.
  Enabled: `recordError` received `enabled path alice.reviewer@example.invalid`.
  Boundary console: `[RootErrorBoundary]` + raw message with email.
- **Expected:** console/telemetry use redacted/classified errors; never the
  original unsafe Error.
- **Observed:** original message on console; original Error on injected
  Crashlytics after enable. Cause object is not walked by `recordError`
  (only Error.message/stack go to the SDK).
- **Affected:** device console always; Crashlytics after consent.
- **Fix:** same proposed patch. Do not pass `error` through an alternate path.
- **Gate:** core public app.
- **Evidence:** VERIFIED_SIMULATION. **Remediation:** PROPOSED, NOT_APPLIED.

### F-IAP-1 Purchase UI can be visible while store charging is unavailable

- **Severity:** Low (availability/UX). Not a charge bypass.
- **Reasoning:** `eas.json` production/preview set
  `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED=1` and
  `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED=1`. Server
  `PLAY_BILLING_ENABLED` must be the string `"true"` or prepare callables
  throw `failed-precondition`. `iapSession.purchase` calls prepare **before**
  `requestPurchase`; on throw it returns `kind:"failed"` and does not launch
  the sheet. Charge, Play acknowledgement, and entitlement grant are separate
  and remain fail-closed in source.
- **Expected for a public core release:** no Upgrade CTA that ends in
  "Purchase didn't complete."
- **Observed (source + existing unit tests, not a device purchase):** UI
  gates can be on in production profile env; store request is not issued if
  prepare fails; restore uses `getAvailablePurchases` (not `requestPurchase`)
  and then `validateAndActivate*` which is also fail-closed.
- **Fix:** proposed eas.json flag-off, billing stays off
  (`proposed-patches/purchase-entry-public-release.diff`). Not applied.
- **Gate:** paid activation UX on the core public app.
- **Evidence:** VERIFIED_SOURCE + `iap.static.test.ts` PASS this assignment.
  VERIFIED_DEVICE store sheet: skipped. **Remediation:** PROPOSED, NOT_APPLIED.

No confirmed historical PII incident is claimed.

---

## B. CONTROL OBSERVATIONS

| ID | Observation | Evidence |
|---|---|---|
| C-1 | Client `EXPO_PUBLIC_*` Firebase web config is public client config, not a private server credential. Diagnostics print presence booleans. | VERIFIED_SOURCE |
| C-2 | `firebase.json` `crashlytics_auto_collection_enabled: false`. Collection stays off until consent sets `_enabled`. | VERIFIED_SOURCE |
| C-3 | Phone keys masked; PDF/html keys and PDF-like data strings redacted; `pdfSafeLog` allowlist for PDF meta; long strings >4000 redacted. | VERIFIED_SIMULATION (logging-repro) |
| C-4 | App Check native init exists; no `enforceAppCheck`; no Rules `request.appCheck`. Init ≠ enforcement. | VERIFIED_SOURCE |
| C-5 | R8/minify appears in dirty `app.json` and in EAS build **message** for 72cb7254. R8 is not encryption. | VERIFIED_SOURCE / EAS metadata |
| C-6 | Firestore Rules `isOwner` / `isActiveUser`; alice cannot read bob; forged ueid/status/email identity fields denied; pending_deletion blocks entry create; phoneIndex client write denied. | VERIFIED_EMULATOR this assignment |
| C-7 | Account-switch while save in flight: `coordinationOwnership.emulator.test.ts` PASS this assignment. | VERIFIED_EMULATOR |
| C-8 | Admin callables use `request.auth?.uid` (e.g. `mintClientAuthToken` unauthenticated → HttpsError). Admin SDK bypasses Rules. | VERIFIED_SOURCE |
| C-9 | GRIN production flag `isGoodsEvidenceEnabled` is off on store-or-standalone even if env is `"1"`. Future GRIN is not a core-app blocker. | VERIFIED_SOURCE |
| C-10 | CORS is a browser concern; native Auth uses Firebase SDKs. CORS is not authorization. | guidance, not a finding |
| C-11 | `iap.static.test.ts` PASS: IAP client must not `setDoc`/`updateDoc` subscription status; no firebase-admin. | this assignment |

---

## C. VERIFICATION GAPS

| ID | Gap |
|---|---|
| G-1 | vc22 **source-to-binary UNVERIFIED**. EAS 72cb7254 reports `gitCommitHash=0da2f58` (committed `versionCode` **20**) and `appBuildVersion` **22**. `isGitWorkingTreeDirty` absent from `eas build:view --json`. No lockfile or bundled `EXPO_PUBLIC_*` dump in that payload. AAB content hash not in JSON; AAB not downloaded. Git search: 65 refs (all local branches, remotes, tags), empty stash, `git log --all -S 'versionCode": 22'`, `git grep` on those refs: **no committed 22**. Working tree `app.json` is 22. Did not inspect reflogs, other remotes, or the EAS upload tarball. |
| G-2 | Native Crashlytics payload on a physical device / Firebase console: not tested. |
| G-3 | Deployed Functions env (`PLAY_BILLING_ENABLED` live value) not read. Source fail-closed. |
| G-4 | Deployed callable authentication/App Check enforcement not inspected live. |
| G-5 | No external secret/SCA scanner. Manual ripgrep is not a scanner pass. |
| G-6 | Identity Admin emulator (`demo-vyaamikk` resolveOrCreate) not re-run this assignment. |
| G-7 | Storage rules emulator not re-run this assignment. |
| G-8 | Play Console binary attestation / mapping.txt for vc22 not pulled. |
| G-9 | PR #27 state: `gh` unauthenticated this session; previously observed open, unmerged, draft:false. Not re-confirmed. |

---

## Reachability for F-LOG-1 / F-LOG-2

Not every unsafe sink is a confirmed disclosure.

**Established production-shaped callers of `createLogger().error/warn`:**

| Caller | Input | Construction | Sink | Sensitive data? |
|---|---|---|---|---|
| `identityCallable` | callable failures | `callable ${name} failed` + codes/suffixes | logger | name is a function id; no email key |
| `nativePhoneAuth` / `nativePhoneContactChange` | phone send fail | suffix + firebaseAuthCode | logger | full E.164 not logged; suffix only |
| `jsAuthBridge` | bridge fail | uid suffixes | logger | suffixes, not full uid |
| `AuthFlowGate` | auth_flow_error | appCode / diagnosticCode / firebaseAuthCode | logger | no email/phone values |
| `state/auth` | boot / signOut | `log.error("boot failed", e)` | logger | **reachable if** `e` has enumerable `email` / `customData.email` (Firebase-shaped). Native `Error.message` was not enumerable in the Node repro. |
| `syncEngine` / `persistentSaveLock` | thrown errors | `{ msg }` / `{ err: String(e) }` | logger | keys `msg`/`err` are not sensitive-listed; **message text can carry provider strings** |
| `localDb/init` | initError | `{ message: initError.message }` | logger | **message key not redacted** |
| `RootErrorBoundary` | any render Error | raw `error.message` | console always; Crashlytics if consented | **user-controlled if a child throws a message containing PII** |
| `globalHandlers` | uncaught | screen uses `redactStartupMessage`; logger only `{ code }` | logger + UI | logger path conservative; UI redacted |
| `recordError` | only ErrorBoundary in app source | original Error | Crashlytics if enabled | see F-LOG-2 |

No current production caller was found that interpolates a user email into a
logger **message** except the synthetic repro. Firebase-shaped enumerable
`customData.email` on `log.error("boot failed", e)` **is** a concrete reachable
shape. That is not evidence of a past incident.

---

## Purchase-entry trace (`PLAY_BILLING_ENABLED` not `"true"`)

Routes to `deps.native.requestPurchase` (only in `iapSession.ts`):

1. Quota upsell: composer / customer-credit / professional-pack / purchase-order
   → `notifyOrdinaryQuotaUpsell` → host `runtime.purchase` → `session.purchase`.
   Client gate: `isQuotaUpsellEnabled()` (`EXPO_PUBLIC_QUOTA_UPSELL_ENABLED==="1"`).
   eas.json production/preview: **1**.
2. Settings / subscription management: `notifyManualUpgrade` → same host
   `purchase`. Client gate: `isSubscriptionPurchaseEntryEnabled()`
   (`EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED==="1"`). eas.json: **1**.
3. Retry: user taps purchase again on the same sheet; still `session.purchase`.
4. Restore: `getAvailablePurchases`, **not** `requestPurchase`.

Layers (do not equate):

| Layer | Current source |
|---|---|
| UI visibility | Can be on (eas.json flags) |
| Store-request dispatch | Android/iOS `requestPurchase` only after successful prepare* |
| Actual charge | Play/App Store, not executed this task |
| Server verification | `validateAndActivate*` fail-closed if billing flags not `"true"` |
| Entitlement grant | server transition; not client IAP |

`iap.static.test.ts`: ok (this assignment). Device purchase: skipped.
