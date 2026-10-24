# Wave 2 evidence confirmation refresh (Team 5)

AI QA role, not human certification. **Wave 2 is not accepted.** G6 / public release / billing / Play / NATIVE_DEVICE are not claimed. Forbidden matrix statuses remain unused: `complete` / `accepted` / `pass` / `done` / `approved`. Observations below are **pass-at-label** only.

Independence: coordinator narrative was not treated as evidence. File-IO / pack closeout at `2cbacff` and prior E1 joined persist at `cd5b5f4` were **preserved and not reopened**. Source was inspected at `dcc325a` and the named tests were executed on `/Users/shivamsaurav/vyd-worktrees/grin-combined`.

No Team 1–4 production files were edited. Team 5 added only `docs/release/proposals/team5/WAVE2EVIDENCE_CONFIRMATION_REFRESH.md`, `docs/release/proposals/team5/wave2evidence-confirmation-refresh.ts`, and pointer rows in `docs/release/proposals/team5/README.md`. Docs are left uncommitted in `grin-combined` for the coordinator.

Worktree: `/Users/shivamsaurav/vyd-worktrees/grin-combined`. Branch: `integration/grin-g1-g5-source`. Historical workspace `/Users/shivamsaurav/Vyaamikk Diary` was not edited. `NEVER reset`. `NEVER merge main`. Functions export / EAS / Play / live flags / live Rules were not run. `versionCode` remains 23. Combined was not pushed.

## SHAs

| Role | Full SHA | Subject |
|---|---|---|
| Reviewed combined / this inspection HEAD | `dcc325a9fb0d0094ab8bc05cc7ea3d27a7e2ab7a` | refresh confirmed projection after evidence linkage |
| Parent of this SHA | `d55a53cb33b8a5e170986f8af9c1f2f6ebf5091e` | record file-IO pack closeout, Team 5 review, and local ci:verify |
| Prior independently reviewed file-IO / pack (preserve; do not reopen) | `2cbacff6d21caae3d721127fb1a353e4c553be11` | bound production original reads and join complete-pack proof |
| Prior independently reviewed joined persist (preserve; do not reopen) | `cd5b5f43702b65b7a06d50c56413d26369b6920e` | join persistGrinOwnerSession to Functions-emulator upload |

`git rev-parse HEAD` immediately before execution: `dcc325a9fb0d0094ab8bc05cc7ea3d27a7e2ab7a`. `git merge-base --is-ancestor` is true for both preserved SHAs. Node `v20.19.4`. Host sqlite library `3.50.4`. OpenJDK 17.0.16. Firebase CLI `14.20.0`. Installed `expo@54.0.36`, `expo-file-system@19.0.23`.

## Distinction of evidence kinds

| Kind | What it is | What it is not |
|---|---|---|
| Source inspection | Reading `processAttachments`, `readValidatedConfirmation`, `parseConfirmedProjection`, `upsertConfirmedProjection`, Packets A/B, HOLDs, pack-complete vs SQLITE_HOST unit | Device execution |
| SQLITE_HOST unit | `outbox.sqliteHost.test.ts` confirmation-refresh: failed read, session steal during read, monotonic upsert | Joined persist / emulator / stored-byte verify |
| EMULATOR round trip | Isolated Functions+Auth+Firestore+Storage `pack-complete.emulator.test.ts` with automatic confirmation persist and one interrupted post-upload read | Live deploy; production `functions/src/index.ts` |
| HOST_FILESYSTEM | darwin tmp retention + Node `readFile` materialization for host `putObject` | Expo `File` Blob upload on device |
| NATIVE_DEVICE | **pending** | Not claimed from SQLITE_HOST or emulators |

## Gap closed at this SHA (labelled hosts)

At `2cbacff`, `processAttachments` persisted durable originals and moved the command to `issued` without `readValidatedConfirmation`. `pack-complete.emulator.test.ts` compensated with `box.persistConfirmedProjection(...)`.

At `dcc325a`:

- After durable originals, `processAttachments` calls `readValidatedConfirmation` (same helper as register/mutate).
- `parseConfirmedProjection` copies `raw.eventVersion`; it does not increment or invent versions / original / events / effective.
- `writeCommandAndReceipt` passes `confirmed` into monotonic `upsertConfirmedProjection` (advance only when `eventVersion` is strictly greater; same version is a no-op).
- `skipStaleCompletion` runs before the read and after the await. A retired session during the inflight read does not persist the later cut.
- Failed / unparsed read: command stays `attachment_pending` with `lastErrorCode` `confirmation_refresh`; durable originals and the already-issued number remain; register is not retried (`serialsIssued` stays 1 on SQLITE_HOST).
- `pack-complete.emulator.test.ts` has **no** `persistConfirmedProjection`, **no** `markVerifiedDescriptor`, **no** `expectedVersion` rewrite. Success path is `dispatchDue` → `writeEvidenceUpload` → automatic confirmation persist. A later `object_generation = "verified"` SQL write is a **negative** completeness oracle, not a stamp-to-complete helper.

## HOLDs inspected on this SHA

| HOLD | Observation |
|---|---|
| GRIN default-off | `eas.json` does not set `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED`. Client gate remains `=== "1"`. |
| Store-runtime block | `isGoodsEvidenceBlockedByStoreRuntime()` returns true when `env.runtimeKind === "store-or-standalone"`; `isGoodsEvidenceEnabled()` returns false before the public env is read. Unchanged in this SHA. Play/standalone cannot enable GRIN via the public env. |
| Purchase-entry flags | EAS **preview** and **production**: `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` `"0"` and `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` `"0"`. Development EAS profiles leave purchase-entry unset (still not `"1"`). |
| Version | `app.json` `expo.version` `1.0.0`; `android.versionCode` `23`. |
| Functions export | `functions/src/index.ts` (80 lines) has no GRIN / `goodsEvidence` / composed export. Isolated emulator entry is `tools/goods-evidence-emulator/functions-entry`. |
| Live Rules | live `storage.rules` has no `grinEvidence`; live `firestore.rules` has no `goodsEvidence`. |
| Packet A names | Transport and Packet A use `grinBeginEvidenceUpload`. `grinBeginEvidence` is not the contract name. |
| Packet B artifact | Planned Play Internal Testing artifact is a **production-profile AAB** (`eas.json` `build.production.android.buildType` `app-bundle`). Preview/development **APK** is a separate device-test artifact. Packet B states there is **no trustworthy in-app Play-track signal**. |
| Legal date | `src/config/legal.ts` `LEGAL_EFFECTIVE_DATE` `2026-07-27`. |
| EAS / Play / deploy | not run; not authorized. |
| NATIVE_DEVICE | not claimed. |

## Verdict (independent execution at `dcc325a`)

Wave 2 **is not accepted.** Pass/fail below are QA observations at the labelled hosts, not matrix row statuses. G6 / device / billing / public-release are not Done.

| ID | Stated boundary | Result at `dcc325a` |
|---|---|---|
| Confirmation refresh after evidence linkage | `readValidatedConfirmation` after durable originals; `confirmed` to `writeCommandAndReceipt`; parse + monotonic upsert; no invented event versions | **pass-at-label** source + SQLITE_HOST + EMULATOR. Not NATIVE_DEVICE. |
| Recoverable failed read | Failed confirmation read keeps `attachment_pending` + `confirmation_refresh`; durable files and issued number kept; no reissue | **pass-at-label** SQLITE_HOST (`failNextRead`) and EMULATOR (`failConfirmAfterUploadOnce`). SQLITE_HOST asserts state/durability/serial; it does not assert the `last_error_code` string. |
| Session/lease after await | `skipStaleCompletion` after the confirmation read; retired session does not persist the later cut | **pass-at-label** SQLITE_HOST inflight `holdNextRead` + `endOwnerSession`. |
| Pack-complete compensation removed | No `persistConfirmedProjection` / verification-column stamp / `expectedVersion` rewrite on the success path | **pass-at-label** `rg` no matches for `persistConfirmedProjection`; source inspection. Joined drain persisted the evidence-bearing cut; later amend advanced `eventVersion` without rewriting original JSON. |
| Packets A/B | `grinBeginEvidenceUpload`; Internal Testing AAB vs separate APK; no in-app Play-track; store-runtime unchanged | **pass-at-label** source inspection. Not a Play upload. |
| Bounded-read production path | FileHandle chunks; production factory omits `readLocalBytes`; no `readAsStringAsync` / `atob` restored in `evidenceTransport.ts` | **pass-at-label** source inspection. Not device peak-memory proof. |
| Unset hosts | `FIRESTORE_EMULATOR_HOST` emptied must fail for pack-complete | **failure as required** (not counted as a pass, not a skip). Exit 1. |
| HOLDs | default-off, store-runtime, unexported functions, live Rules, versionCode 23, purchase-entry `"0"` | **HOLDs still true** |

Confirmation-refresh **source gap named for this SHA is closed at the labelled hosts above**. That is not Wave 2 acceptance, not G6, and not an OOM-free claim.

## Production path review (source, not coordinator narrative)

### `src/services/grin/outbox/outbox.ts` `processAttachments` end

After the upload loop, `hasUndurableOriginals` is checked. If originals are durable and `this.server.readReceipt` is a function, the outbox awaits `readValidatedConfirmation`, then `skipStaleCompletion`. `confirmationPending` is true only when durables exist, a read port exists, and the parsed projection is null. `writeCommandAndReceipt` then either:

- `issued` with `confirmed` (upsert monotonic), or
- `attachment_pending` with `lastErrorCode` `attachment_retry` (undurable originals) or `confirmation_refresh` (read failed).

`confirmed == null` does not call `upsertConfirmedProjection`, so a failed refresh does not wipe the register-time cut.

`readValidatedConfirmation` does not itself check session; the caller rechecks after the await. Invalid server shapes return null via `parseConfirmedProjection`.

If `readReceipt` is absent on an INJECTED port, this SHA still moves to `issued` without a post-evidence refresh. Production `createFirebaseGrinTransport` always implements `readReceipt`.

### `parseConfirmedProjection` / `upsertConfirmedProjection`

Parser comment: do not invent original / events / effective. `eventVersion` must be a positive integer from the server payload. Upsert returns without writing when current version is greater than or equal to the incoming version (same-version different hash is a silent no-op, not a thrown refuse).

### Packets A / B

Packet A lists `grinBeginEvidenceUpload` and explicitly rejects `grinBeginEvidence`. Packet B keeps the store-runtime block, distinguishes production-profile AAB (Internal Testing upload) from preview/development APK, and states there is no trustworthy in-app Play-track signal.

### `src/services/grin/transport/evidenceTransport.ts`

`createFirebaseJsGrinEvidenceTransport()` still passes `readPrefix` / `fileSize` / `putObject` and **omits** `readLocalBytes`. Default prefix is `readPrefixFromHandle` (`FileHandle`, 16 bytes). Default hash is `iterateBoundedChunks`. Default `putObject` hands Expo `File` to `uploadBytesResumable`. No `readAsStringAsync` / `atob` / `EncodingType` in this file. Host pack `putObject` still `readFile`s for Node Storage SDK (**HOST_FILESYSTEM**).

## Hosts actually used

| Label | What actually ran |
|---|---|
| SQLITE_HOST | Python stdlib sqlite3 bridge for `outbox.sqliteHost.test.ts`. Host reopen is not process-death. |
| EMULATOR | Isolated Functions+Auth+Firestore+Storage, project `demo-vyaamikk-grin-t1`, region `asia-south1`. Loaded: `grinBeginEvidenceUpload`, `grinMutateGoodsReceipt`, `grinReadGoodsReceipt`, `grinReconcileCommand`, `grinRegisterGoodsReceipt`, `grinReserveEvidence`, `grinUploadEvidence`. |
| HOST_FILESYSTEM | darwin tmp dir injected via `setGrinOriginalRetentionFsForTests`. Host `putObject` used Node `readFile`. |
| INJECTED | Server/evidence **port factories** bound to the emulator-connected JS app. |
| NATIVE_DEVICE | **not_claimed** |
| LIVE_STORAGE / live Functions | **not_claimed** |

## Commands and results

Working directory: `/Users/shivamsaurav/vyd-worktrees/grin-combined` at `dcc325a9fb0d0094ab8bc05cc7ea3d27a7e2ab7a`.

```bash
git rev-parse HEAD
# dcc325a9fb0d0094ab8bc05cc7ea3d27a7e2ab7a
# EXIT:0

rg persistConfirmedProjection tools/goods-evidence-emulator/pack-complete.emulator.test.ts
# (no output)
# EXIT:1
# Required: no matches. This is not a test failure.

npx --yes tsx src/services/grin/outbox/outbox.sqliteHost.test.ts
# SQLITE_EXECUTION=SQLITE_HOST
# NATIVE_DEVICE=not_claimed (SQLITE_HOST tests are not NATIVE_DEVICE process-death proof.)
# outbox.sqliteHost.test.ts: ok
# EXIT:0
# Label: SQLITE_HOST unit including confirmation-refresh / session steal / monotonic upsert.

npx --yes tsx docs/release/proposals/team5/wave2evidence-confirmation-refresh.ts
# HOLD functions/src/index.ts: no GRIN export
# version 1.0.0 / versionCode 23
# GRIN default-off; purchase-entry flags 0 on preview/production
# store-runtime block remains
# Packets A/B inspected
# processAttachments confirmation-refresh wiring inspected
# unset FIRESTORE_EMULATOR_HOST: failure (not counted as pass)
# wave2evidence-confirmation-refresh.ts: ok (inspection; not Wave 2 acceptance)
# EXIT:0

FIRESTORE_EMULATOR_HOST= FIREBASE_AUTH_EMULATOR_HOST= FIREBASE_STORAGE_EMULATOR_HOST= \
  FIREBASE_FUNCTIONS_EMULATOR_HOST= FUNCTIONS_EMULATOR_HOST= \
  npx --yes tsx tools/goods-evidence-emulator/pack-complete.emulator.test.ts
# Error: FIRESTORE_EMULATOR_HOST required (firebase emulators:exec). Unset hosts are not a pass.
# EXIT:1
# Required failure. Not counted as a pass. Not a skip.

node tools/goods-evidence-emulator/functions-entry/build.mjs && \
  GRIN_GOODS_EVIDENCE_FUNCTIONS=true firebase emulators:exec \
  --only auth,functions,firestore,storage \
  --project demo-vyaamikk-grin-t1 \
  --config tools/goods-evidence-emulator/functions-entry/firebase.json \
  "npx --yes tsx tools/goods-evidence-emulator/pack-complete.emulator.test.ts"
# Loaded: grinBeginEvidenceUpload, grinMutateGoodsReceipt, grinReadGoodsReceipt,
#         grinReconcileCommand, grinRegisterGoodsReceipt, grinReserveEvidence,
#         grinUploadEvidence
# tools/goods-evidence-emulator/pack-complete.emulator.test.ts: ok
#   (EMULATOR persistGrinOwnerSession writeEvidenceUpload exportPack / SQLITE_HOST / HOST_FILESYSTEM /
#    SQLITE_HOST tests are not NATIVE_DEVICE process-death proof.)
# Script exited successfully (code 0)
# EXIT:0
```

Labels recorded from the joined run: **EMULATOR**, **SQLITE_HOST**, **HOST_FILESYSTEM**, **not live deploy**, **not NATIVE_DEVICE**. `test:all`, billing emulators, docker, and `ci:verify` were not run. Coordinator runs `ci:verify` separately.

## Remaining gaps (device / memory / policy)

Confirmation-refresh production-path gap named for this SHA **did not remain** at the labelled hosts. Remaining:

1. **NATIVE_DEVICE pending.** SQLITE_HOST and Functions-emulator are not a device process.
2. **`uploadBytesResumable` + Expo `File` Blob is not peak-memory proof.** Avoidable full-file base64/`atob` expansion remains absent from the production GRIN transport. Do not invent OOM-free claims.
3. **Host pack `putObject` materializes** the retained file with Node `readFile` up to 15 MiB. Label HOST_FILESYSTEM.
4. Isolated Functions-emulator entry is not production `functions/src/index.ts`. Callables remain unexported / undeployed.
5. INJECTED ports without `readReceipt` still skip post-evidence refresh (`canRefresh` false → `issued`). Production JS transport implements `readReceipt`.
6. Client marks `issued` on any parseable confirmation after durables; it does not require `evidence_verified` events in that cut. Joined emulator observed the evidence-bearing read; a stale-but-parseable server cut would still issue.
7. SQLITE_HOST confirmation-refresh does not assert `last_error_code === "confirmation_refresh"` (production sets it; test asserts `attachment_pending` + durable + no reissue).
8. EAS development profiles do not explicitly set purchase-entry `"0"` (preview/production do).

Deployment / device / owner decisions (out of this programme, still open):

- Lift Functions export HOLD / live deploy
- Live Storage + Firestore Rules for `grinEvidence` / `goodsEvidence`
- NATIVE_DEVICE / TalkBack / Play-installed binary / device peak-memory
- Store-runtime block remains: Play/standalone cannot enable GRIN via the public env
- Packet B Internal Testing AAB is not this assignment; APK is not the Play Internal Testing artifact
- Pricing / quota unresolved
- Billing / public release / versionCode bump — not authorized; `versionCode` stays 23

## What was NOT claimed

- Wave 2 / G6 / public release / billing admission
- NATIVE_DEVICE / TalkBack / Play-installed binary
- Live Firebase, live Storage, Functions export, EAS, Play Console, feature flags
- Legal truth of hashes or ITC (synthetic labelled PDFs only)
- OOM-free hashing or upload on device
- Matrix `complete` / `accepted` / `pass` / `done` / `approved` as Wave 2 closure
