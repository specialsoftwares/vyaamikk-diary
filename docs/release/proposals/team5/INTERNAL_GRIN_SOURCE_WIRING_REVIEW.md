# Internal GRIN source-wiring review (Team 5)

AI QA / release-gate role, not human certification. Independent of the
implementation pass. **Wave 2 is not accepted.** Not live deploy. Not G6.
Not main merge. Not EAS/build. This session did **not** claim NATIVE_DEVICE.

Application SHA: `4409366f0a0862ef18d5825c47dedaae9b7f9f3f`
(`feat(grin): export lazy production GRIN callables and Internal-test visibility`).
Parent published docs head: `3b030c95a26843a81bb94c67596d1b41185f6119`.
Prior Admin-config application: `4aac867af015d83f6ec3badb0748ff3b4bcc1a22`
(ancestor; not reopened). Confirmation-refresh `dcc325a` was **not** reopened.
PR #31. Canonical GitHub CI on this SHA was **not** recorded. Do **not** reuse
`37337067895` or `37330701057`.

Inspected in `/Users/shivamsaurav/vyd-worktrees/grin-combined` on
`integration/grin-g1-g5-source`. `HEAD` equals the application SHA. Origin still
points at `3b030c9` (this SHA is local, ahead by 1). Production/application
files were not edited. `functions/lib/` is gitignored; `tsc` for this review
wrote only `/tmp/grin-t5-functions-lib-4409366`.

## What was executed

| Check | Host | Result |
|---|---|---|
| `functions/src/index.ts` seven-export + no stubs / no module-scope compose | source | **PASS** |
| `productionExports.ts` `onCall` / `request.auth.uid` / lazy compose / fail-closed config | source + INJECTED | **PASS** |
| Independent `tsc --outDir /tmp/grin-t5-functions-lib-4409366` then `require(index.js)` Module._load | tsc / Node load | **PASS** (exit 0). Load requires `productionExports`, not `productionCompose` |
| Server gate exactly `"true"`; isolated emulator entry is not deploy target | source | **PASS** |
| `eas.json` / `app.json` versionCode 23 / `featureFlag.ts` no installer APIs | source | **PASS** |
| Records hub + `GrinAdmittedSessionHost` + non-admitted list copy | source | **PASS** |
| Disk sha256 of live-compat + proposed-grin; `firebase.json` still repo-root | source | **PASS** (not a live GCP re-export) |
| `npx tsx tools/goods-evidence-emulator/production-exports.injected.unit.test.ts` | INJECTED | exit **0** |
| `npx tsx src/goodsEvidence/isolation.contract.test.ts` | source | exit **0** |
| `npx tsx src/goodsEvidence/featureFlag.test.ts` | INJECTED | exit **0** |
| `npx tsx src/services/savedRecords/grinHubEntry.test.ts` | INJECTED | exit **0** (not NATIVE_DEVICE) |
| `npm run test:live-rules-grin-merged` | EMULATOR | exit **0** (`LIVE_RULES_GRIN_MERGED PASS`). Not live Rules deploy |
| Live Firebase deploy / EAS build / Play / NATIVE_DEVICE | — | **not run** |

## Required checks

### 1. Production index seven-export — PASS

`functions/src/index.ts` re-exports **exactly** these seven names from
`./goodsEvidence/productionExports`, after identity/email/deletion/security/
billing:

`grinRegisterGoodsReceipt`, `grinReconcileCommand`, `grinMutateGoodsReceipt`,
`grinReadGoodsReceipt`, `grinReserveEvidence`, `grinBeginEvidenceUpload`,
`grinUploadEvidence`.

No `grinBeginEvidence`. No `createProductionGrinCallables()` at index module
scope (index does not mention `productionCompose`). No `handleGrin*` stubs as
the production backend (`callables.ts` stubs remain unexported). Compiled
`index.js` export keys are those seven names only (count 7).

### 2. Lazy productionExports + fail-closed Admin config — PASS

`productionExports.ts` uses `onCall({ region: "asia-south1" })`,
`request.auth?.uid` identity, and `import("./productionCompose")` only inside
`defaultLoadComposed`. Missing/malformed Admin config returns
`{ ok: false, code: "policy_denied", detail: "denied" }` via `GrinAdminConfigError`.
Executable `productionExports` (comments stripped) has no `FIREBASE_CONFIG`,
no `demo-vyaamikk-grin-t1`, and no `.appspot.com` guess.
`resolveGrinAdminBinding` still does not invent `${projectId}.appspot.com`.

Independent compile + Node `require("/tmp/.../index.js")` Module._load:
`productionExports` and `productionAdminConfig` load; **`productionCompose` does
not**. Gitignored worktree `functions/lib/index.js` matches the same
`require("./goodsEvidence/productionExports")` wiring.

INJECTED `production-exports.injected.unit.test.ts` exit 0, including
`GRIN_GOODS_EVIDENCE_FUNCTIONS=TRUE` still deny when compose is otherwise valid.

### 3. Server gate default-off; emulator entry not deploy — PASS

`grinFunctionsEnabled` is `env.GRIN_GOODS_EVIDENCE_FUNCTIONS === "true"`.
`"TRUE"` / `"1"` deny. `composed.ts` still consults that helper before G1/G2
adapters. Isolated emulator remains
`tools/goods-evidence-emulator/functions-entry` (codebase `grin-t1-isolated`,
README: do not deploy). Repo `firebase.json` functions source is `functions`
(codebase `default`).

### 4. EAS / versionCode / no Play-track APIs — PASS

| Profile | GRIN flags | Artifact |
|---|---|---|
| production / preview / development / development-production-otp | unset (GRIN-off) | production AAB; others APK |
| `internal-grin` | `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED=1` and `EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT=1`; `EXPO_PUBLIC_APP_MODE=production`; purchase-entry and quota-upsell `"0"` | app-bundle |

`app.json` `android.versionCode` is still **23**. `featureFlag.ts` has no
installer / Play-track APIs (`InstallReferrer` / `getInstallerPackageName` /
`getInstallReferrer` absent). Client flags are **not** backend admission.

### 5. Records hub + disabled routes — PASS

`app/(app)/(tabs)/saved-records.tsx` uses `shouldShowGrinRecordsHubEntry()`
(wraps `isGoodsEvidenceEnabled()`). No fake repository
(`GrinFixtureRepository` / `createUninjectedGrinServerPort` absent from the hub).

`GrinAdmittedSessionHost`: `intendedUid` is null unless admitted with an
`ownerUid`. Render calls `advanceGrinLiveToken(intendedUid)` only. Host source
does not call `beginOwnerSession`. `persistGrinOwnerSession` returns null and
skips sqlite begin when `liveToken` is null.

Non-admitted list: `grinFeatureNotAdmitted` is `actionable === "feature_not_admitted"`
(`policy_denied` maps to that in `classify.ts`). `GrinListScreen` then shows
`grin.unavailableTitle` / `grin.unavailableBody`. `GrinAdmissionGate`
`renderUnavailable` uses the same copy.

### 6. Additive Rules undeployed — PASS (disk + emulator; not live GCP)

Independent `shasum -a 256`:

| Artifact | sha256 |
|---|---|
| Live 2026-10-01 / `docs/release/rules-compat/proposed/firestore.rules` | `b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c` |
| Live 2026-10-01 / `proposed/storage.rules` | `1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5` |
| Merged `proposed-grin/firestore.rules` | `551203b8b11991fc1d49d42aa6a818fedeca8530654f7505de949b62a1ae298b` |
| Merged `proposed-grin/storage.rules` | `6b8959929b86ac2eab41fc591dc1fbf5bb03b80a226226d43bf4c8e72391c76b` |
| Repo-root `firestore.rules` (quota; not live merge base) | `233b05b7b810b484171257f4dafe78fd0fdea5762ed6848cf8b49cd327fd58cc` |
| Repo-root `storage.rules` | `19fcc761dc8d5a923efb45ed589a598690bd3bb2159fab827f3ce30c17a60452` |

`firebase.json` still points at repo-root rules. `proposed-grin/` is undeployed.
This session did **not** re-export live GCP. Emulator
`test:live-rules-grin-merged` exit 0: client cannot write admission/commands;
GRIN original create without reservation denied; diary/PDF paths still allowed
on the merged matchers. Emulator UIDs are synthetic, not live tester seeds.

### 7. Re-run tests — PASS

Exit codes recorded above. INJECTED / source / EMULATOR only. **Not
NATIVE_DEVICE.**

## Defects found

**None** on the seven required source-wiring checks at `4409366`.

## HOLDs still in force

- No live Functions/Rules/IAM/config write. Seven-export exists in source;
  it is not a live backend.
- No merge to `main` (`origin/main` remains `0da2f58970f23c7ce6cbefae6efffd49c731f44b`).
- No EAS/build. `internal-grin` is a profile only; versionCode 23 is **not**
  a Play reservation.
- Tester UIDs are not invented. Client flags are not admission documents.
- Packet D quota / retention / deletion policy unset.
  `functions/src/deletion` still has no `grinEvidence` / `goodsEvidence` purge.
- Encrypted PDF backup remains backlog.
- Confirmation-refresh at `dcc325a` not reopened.
- Canonical CI on `4409366` is absent until owner push; do not reuse
  `37337067895` or `37330701057`.

## Bounded verdict

**Source wiring for Internal GRIN at `4409366` is accepted at labelled
INJECTED / tsc / Rules-emulator hosts.** It is not a live deploy, not device
acceptance, not Wave 2, not G6, and not a main merge. Remaining owner
boundary: push this SHA, record **new** canonical CI, then separately
authorize Functions env, Rules merge after live re-export, tester seeding,
and an Internal `internal-grin` AAB.
