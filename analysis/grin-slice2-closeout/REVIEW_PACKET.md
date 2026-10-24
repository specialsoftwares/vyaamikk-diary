# Review packet (inspection copy)

This file is the handoff body. Same facts as the chat response.

## 1. Admission-table correction

See DESIGN_CLOSEOUT.md §A. Ambiguous “either policy deny” row removed.
Four independent combinations plus missing-config. Selected submit contract:
idempotent stored-result replay on matching digest; never duplicate;
reconciliation RPC independently gated. P7 deny. Cross-owner silence.
Config/user/ledger reads stay inside the register transaction.

## 2. Compiler experiment

Cursor ran tsc 5.9.3. Control emits `lib/index.js`. Relative import of
repo `src/goodsEvidence` emits `lib/functions/src/index.js`. Independent
reviewer has not reproduced. Adapter location remains
`tools/goods-evidence-emulator/**`.

## 3. Future registration parity

See DESIGN_CLOSEOUT.md §C. Oracle is `InMemoryGoodsLedger` loaded only by
the future test file, not by the adapter and not by production Functions.

## 4. Logging reproductions

Cursor executed `npx tsx analysis/grin-slice2-closeout/logging-repro.ts`
with `env.isProduction=true`, synthetic `@example.invalid` data, captured
console, injected Crashlytics.

Observed: email retained in message and `email` keys; phone masked to
`+91***10`; token redacted; URL query on `href` retained; HTML/PDF data
redacted; PDF-like **message** not redacted; disabled Crashlytics empty;
enabled Crashlytics got original Error.message; ErrorBoundary console
kept the email. Full JSON: `logging-repro.out.json`.

## 5. Provenance (EAS 72cb7254)

FINISHED Android STORE production. `appBuildVersion` 22.
`gitCommitHash` 0da2f58 (that commit’s app.json versionCode is 20).
Fingerprint hash `4b3882e7447e522a1476b46142b980a15e996548`.
AAB path identity `.../BwNnDnKOfPL56ButCthA-pB606kOzM2UV7Fg-2stHsU.aab`.
Dirty flag, lockfile, bundled flags, AAB sha256: missing from CLI JSON.
Source-to-binary: UNVERIFIED.

Git scope: 65 refs (heads/remotes/tags), no stash, log -S and grep: no
committed versionCode 22. Working tree 22. Reflogs/other remotes not searched.

## 6. Ownership and purchase

Emulator (this assignment): firestore.rules.test.ts all ok including
unauthenticated, alice↛bob, forged ueid/status/email, pending_deletion;
coordinationOwnership.emulator.test.ts ok.
iap.static.test.ts ok. PLAY_BILLING_ENABLED left false. requestPurchase
only after prepare; prepare fail-closed in source.

## 7. Skips

No scanner. No device Crashlytics. No live Functions env read. No AAB
download. No identity Admin emulator re-run. gh unauthenticated. No merge.

## 8. Proposed diffs

`proposed-patches/logger-allowlist.diff`
`proposed-patches/purchase-entry-public-release.diff`
Not applied.
