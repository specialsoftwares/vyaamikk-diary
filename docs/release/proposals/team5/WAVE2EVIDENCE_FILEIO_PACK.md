# Wave 2 evidence file-IO + complete-pack (Team 5)

AI QA role, not human certification. **Wave 2 is not accepted.** G6 / public release / billing / Play / NATIVE_DEVICE are not claimed. Forbidden matrix statuses remain unused: `complete` / `accepted` / `pass` / `done` / `approved`. Observations below are **pass-at-label** only.

Independence: coordinator narrative was not treated as evidence. Prior E1–E5 reviews (joined persist at `cd5b5f4`; hasher at `d4b6e1f`) were **not** treated as covering this file-IO / pack SHA. Source was inspected at `2cbacff` and the named tests were executed on `/Users/shivamsaurav/vyd-worktrees/grin-combined`.

No Team 1–4 production files were edited. Team 5 added only `docs/release/proposals/team5/WAVE2EVIDENCE_FILEIO_PACK.md`, `docs/release/proposals/team5/wave2evidence-fileio-pack.ts`, and a pointer line in `docs/release/proposals/team5/README.md`. Docs are left uncommitted in `grin-combined` for the coordinator.

Worktree: `/Users/shivamsaurav/vyd-worktrees/grin-combined`. Branch: `integration/grin-g1-g5-source`. Historical workspace `/Users/shivamsaurav/Vyaamikk Diary` was not edited. `NEVER reset`. `NEVER merge main`. Functions export / EAS / Play / live flags / live Rules were not run. `versionCode` remains 23. Combined was not pushed.

E1–E5 acceptance at its stated boundaries is preserved and was not reopened.

## SHAs

| Role | Full SHA | Subject |
|---|---|---|
| Reviewed combined / this inspection HEAD | `2cbacff6d21caae3d721127fb1a353e4c553be11` | bound production original reads and join complete-pack proof |
| Parent of this SHA | `23cc0001daa6c9970bf60ed771c87cc5742904ab` | record local ci:verify of PHASE 4 combined head |
| Prior local ci:verify docs (Team 5 PHASE 4) | `9050a1305fd4df2132db57f6494913b38d8e767d` | Team 5 PHASE 4 independent joined persist review |
| Prior independently reviewed joined persist (preserve) | `cd5b5f43702b65b7a06d50c56413d26369b6920e` | join persistGrinOwnerSession to Functions-emulator upload |
| Prior independently reviewed hasher (preserve) | `d4b6e1fa0a6adf8dff7dd4b774d05150474b9603` | persist conversion metadata and hash retained bytes through the app binding |

`git rev-parse HEAD` immediately before execution: `2cbacff6d21caae3d721127fb1a353e4c553be11`. Node `v20.19.4`. Host sqlite library `3.50.4`. OpenJDK 17.0.16. Installed `expo@54.0.36`, `expo-file-system@19.0.23`.

## Distinction of evidence kinds

| Kind | What it is | What it is not |
|---|---|---|
| Source inspection | Reading production `boundedRead.ts`, `grinOriginalRetention.ts`, `localOriginalHasher.ts`, `evidenceTransport.ts`, HOLDs, pack-complete vs repository unit | Device execution |
| Instrumented FileHandle platform-boundary tests | In-memory `readBytes`/`close` stand-in driving `iterateBoundedChunks` | Host `readChunks` replacement; Expo `FileHandle` on device; NATIVE_DEVICE |
| SQLITE_HOST unit | `GrinApplicationRepository.test.ts` still stamps verification columns via `markVerifiedDescriptor` | Joined persist / emulator / `writeEvidenceUpload` proof |
| EMULATOR round trip | Isolated Functions+Auth+Firestore+Storage `pack-complete.emulator.test.ts` | Live deploy; production `functions/src/index.ts` |
| HOST_FILESYSTEM | darwin tmp retention + Node `readFile` materialization for host `putObject` | Expo `File` Blob upload on device |
| NATIVE_DEVICE | **pending** | Not claimed from FileHandle unit tests or emulators |

## HOLDs inspected on this SHA

| HOLD | Observation |
|---|---|
| GRIN default-off | `eas.json` does not set `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED`. Client gate remains `=== "1"`. |
| Store-runtime block | `isGoodsEvidenceBlockedByStoreRuntime()` returns true when `env.runtimeKind === "store-or-standalone"`; `isGoodsEvidenceEnabled()` returns false before the public env is read. Store/standalone cannot enable GRIN via the public env. |
| Purchase-entry flags | EAS **preview** and **production**: `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` `"0"` and `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` `"0"`. Development EAS profiles leave purchase-entry unset (still not `"1"`). |
| Version | `app.json` `expo.version` `1.0.0`; `android.versionCode` `23`. |
| Functions export | `functions/src/index.ts` (80 lines) has no GRIN / `goodsEvidence` / composed export. Isolated emulator entry is `tools/goods-evidence-emulator/functions-entry`. |
| Live Rules | live `storage.rules` has no `grinEvidence`; live `firestore.rules` has no `goodsEvidence`. Emulator copies under `tools/` are not live Rules. |
| Legal date | `src/config/legal.ts` `LEGAL_EFFECTIVE_DATE` `2026-07-27`. |
| EAS / Play / deploy | not run; not authorized. |
| NATIVE_DEVICE | not claimed. |

## Verdict (independent execution at `2cbacff`)

Wave 2 **is not accepted.** Pass/fail below are QA observations at the labelled hosts, not matrix row statuses. G6 / device / billing / public-release are not Done.

| ID | Stated boundary | Result at `2cbacff` |
|---|---|---|
| File-IO hashing/copy | Production no `readAsStringAsync` / `atob` / full-file string reads for GRIN originals. `iterateBoundedChunks` uses `FileHandle.readBytes`, copies chunks, running `maxBytes`, closes in `finally`, advertised size is not the sole admission check. `retainPickedOriginal` size-checks before copy when size is available, hashes after copy, discards only uncommitted temps. | **pass-at-label** source inspection + instrumented FileHandle tests. Not NATIVE_DEVICE. Not Expo `FileHandle` on a device process. |
| Upload memory | Production `createFirebaseJsGrinEvidenceTransport` omits `readLocalBytes`; prefix 16 bytes + `File.size`; `putObject` uses Expo `File` Blob + `uploadBytesResumable`. Ceilings 15 MiB PDF / 10 MiB image / `MAX_CONCURRENT_UPLOADS_PER_OWNER=2`. | **pass-at-label** source inspection for removal of avoidable full-file JS string/base64 expansion. **`uploadBytesResumable` is not bounded JS/native peak-memory proof.** Host pack `putObject` still materializes — HOST_FILESYSTEM, not device. |
| Complete-pack joined | persist → attach synthetic originals → JS `httpsCallable` / Storage emulator → server stored-byte verify → `writeEvidenceUpload` (not replaced) → SQLite reopen → `exportPack`. | **pass-at-label** EMULATOR / SQLITE_HOST / HOST_FILESYSTEM. Not live deploy. Not NATIVE_DEVICE. |
| SQLITE_HOST unit stamp | `markVerifiedDescriptor` in `GrinApplicationRepository.test.ts` | Remains labelled SQLITE_HOST unit. Executed. Not treated as the joined proof. |
| Unset hosts | `FIRESTORE_EMULATOR_HOST` emptied must fail for pack-complete | **failure as required** (not counted as a pass, not a skip). |
| HOLDs | default-off, store-runtime, unexported functions, live Rules, versionCode 23, purchase-entry `"0"`, legal `2026-07-27` | **HOLDs still true** |

File-IO / pack **source gaps are closed at the labelled hosts above**. That is not Wave 2 acceptance, not G6, and not an OOM-free claim.

## Production path review (source, not coordinator narrative)

Pinned APIs: Expo SDK 54 / `expo-file-system@~19.0.23`. Installed types declare `FileHandle.readBytes` / `writeBytes` / `close` / `size`. `boundedRead.ts` itself does not import `expo-file-system`; production adapters open Expo `File` handles.

### `src/goodsEvidence/boundedRead.ts`

- `iterateBoundedChunks` opens a platform handle, early-rejects only when advertised `size` is an integer already over `maxBytes`, then loops `handle.readBytes(chunkBytes)`.
- Each yielded buffer is a **copy** (`new Uint8Array` + `copy.set`).
- Running `total` rejects `too_large` if actual bytes exceed `maxBytes` even when advertised size is missing or understated.
- `closeOnce()` runs in `finally` (success, `too_large`, empty, abort). `readPrefixFromHandle` also closes in `finally`.
- No `readAsStringAsync`, `atob`, or `EncodingType`.

### `src/screens/grin/grinOriginalRetention.ts`

- Production `copyFile` streams source via `iterateBoundedChunks` into `destHandle.writeBytes`; dest handle closed on success and failure; failed dest deleted.
- `retainPickedOriginal` calls `fileSize` and rejects `too_large` **before** copy when size is available; then `copyFile`; then `hashRetainedOriginal` on the dest path.
- Temps are tracked in `uncommitted`. `discardUncommittedGrinOriginal` returns immediately if `committed.has(localPath)`.
- No `readAsStringAsync` / `atob` in `src/screens/grin/`. Unrelated diary photo/PDF services still use those APIs; they are outside GRIN originals.

### `src/services/grin/repository/localOriginalHasher.ts`

- `createAppLocalOriginalHasher` (`executionLabel=APP_FILESYSTEM`) yields `iterateBoundedChunks` when `openHandle` is present, else `limitChunks(readChunks)`.
- No `node:fs`. APP_FILESYSTEM is not NATIVE_DEVICE process-death proof.

### `src/services/grin/transport/evidenceTransport.ts`

Parent factory at `23cc0001` injected `readLocalBytes: defaultReadLocalBytes` (full-file `readAsStringAsync` + `atob`). This SHA's production factory is:

```
createFirebaseGrinEvidenceTransport({
  call, currentAuth, putObject: defaultPutObject,
  readPrefix: defaultReadPrefix, fileSize: defaultFileSize,
})
```

`readLocalBytes` remains an **optional test/host injection**. Production omits it. Default sniff is `readPrefixFromHandle` (`MIME_SNIFF_BYTES=16`). Default hash uses `iterateBoundedChunks`. Default `putObject` hands `new File(localPath)` (Blob) to `uploadBytesResumable` when `bytes` is absent.

Ceilings in `src/goodsEvidence/evidence.ts`: `MAX_PDF_ORIGINAL_BYTES = 15 MiB`, `MAX_IMAGE_ORIGINAL_BYTES = 10 MiB`, `MAX_CONCURRENT_UPLOADS_PER_OWNER = 2`, `HASH_CHUNK_BYTES = 64 KiB`.

**Remaining upload allocation (not OOM-free):** JS hasher peak is one copied 64 KiB chunk plus hasher state (source/design). Mime sniff is 16 bytes. Upload still hands an Expo `File` Blob to Firebase JS `uploadBytesResumable`; that API is not treated as bounded JS or native peak-memory proof. Device peak-memory remains G6 pending.

### Complete-pack vs SQLITE_HOST unit

- `tools/goods-evidence-emulator/pack-complete.emulator.test.ts` does **not** call `markVerifiedDescriptor`, does **not** inject the hasher factory, and does **not** pass `readLocalBytes`. Transport uses prefix + `fileSize`. Host `putObject` still `readFile`s the retained original up to 15 MiB for Firebase JS Storage on Node (**HOST_FILESYSTEM**, not device).
- `GrinApplicationRepository.test.ts` still has `markVerifiedDescriptor` labelled `SQLITE_HOST repository unit helper. Not writeEvidenceUpload. Not joined emulator acceptance.` Pack B in that file remains a unit stamp.

## Hosts actually used

| Label | What actually ran |
|---|---|
| Instrumented FileHandle | In-memory stand-in in `boundedRead.test.ts`. Requested lengths and `close()` recorded. Not Expo FileSystem. |
| SQLITE_HOST | Python stdlib sqlite3 bridge (`openHostSqlite`) for pack-complete and repository unit. Host reopen is not process-death. |
| HOST_FILESYSTEM | darwin tmp dir injected via `setGrinOriginalRetentionFsForTests`. Host `putObject` used Node `readFile`. |
| APP_FILESYSTEM | Production persist hasher label. Factory was **not** replaced in pack-complete. Chunks came from injected HOST_FILESYSTEM `openHandle`. |
| EMULATOR | Isolated Functions+Auth+Firestore+Storage, project `demo-vyaamikk-grin-t1`, region `asia-south1`. |
| FUNCTIONS_EMULATOR | `127.0.0.1:5002`. Isolated `functions-entry`, not production `index.ts`. |
| FIRESTORE_EMULATOR | `127.0.0.1:8090`. |
| AUTH_EMULATOR | `127.0.0.1:9100`. |
| STORAGE_EMULATOR | `127.0.0.1:9201`. |
| INJECTED | Server/evidence **port factories** bound to the emulator-connected JS app. Admin SDK seeded user/ledger/admission and minted a custom token. |
| NATIVE_DEVICE | **not_claimed** |
| LIVE_STORAGE / live Functions | **not_claimed** |

## Negative cases actually seen (pack-complete emulator)

Synthetic labelled PDFs (`SYNTHETIC_*_NOT_LEGAL_TRUTH`). Not legal truth, OCR, GST, or 2B evidence.

| Case | Observation on this run |
|---|---|
| Happy path `receipt_pack_complete` | Five required originals server-verified; SQLITE_HOST reopen `exportPack` coverage/completenessLabel `complete`; `mayMarkComplete` true; `itcDisposition` `not_determined`; originals not bundled. Later amend did not rewrite the earlier pinned cut. |
| `object_generation = "verified"` stamp after reopen | `exportPack` completenessLabel `incomplete`; `mayMarkComplete` false. |
| Session retired | `exportPack` throws `GRIN_SESSION_RETIRED`. |
| Interrupt / retry | One invoice attached, first dispatch left runnable, retire, `advanceGrinLiveToken`, persist again, drain → `originalDurable` true and hash matched. |
| Missing GST | Four of five categories uploaded; pack `incomplete`; incompleteReasons included gst. |
| Corrupt bytes after attach | GST local file overwritten before drain; that row stayed `originalDurable` false; pack `incomplete`. |
| Wrong receipt | Originals attached to `receipt_pack_other`; wanted receipt `missingOriginal` / `incomplete`; other pack completenessLabel `complete`. |
| Unset `FIRESTORE_EMULATOR_HOST` | Non-zero exit: `FIRESTORE_EMULATOR_HOST required (firebase emulators:exec). Unset hosts are not a pass.` Not counted as a pass. |

## Commands and results

Working directory: `/Users/shivamsaurav/vyd-worktrees/grin-combined` at `2cbacff6d21caae3d721127fb1a353e4c553be11`.

```bash
npx --yes tsx src/goodsEvidence/boundedRead.test.ts
# goodsEvidence/boundedRead.test.ts: ok (instrumented FileHandle / not NATIVE_DEVICE)
# EXIT:0
# Label: instrumented FileHandle platform boundary; NOT host readChunks replacement; NOT NATIVE_DEVICE.

npx --yes tsx src/goodsEvidence/isolation.contract.test.ts
# goodsEvidence/isolation.contract.test.ts: ok
# EXIT:0

npx --yes tsx src/services/grin/transport/isolation.contract.test.ts
# src/services/grin/transport/isolation.contract.test.ts: ok
# EXIT:0

npx --yes tsx src/services/grin/repository/GrinApplicationRepository.test.ts
# SQLITE_EXECUTION=SQLITE_HOST
# NATIVE_DEVICE=not_claimed (SQLITE_HOST tests are not NATIVE_DEVICE process-death proof.)
# GrinApplicationRepository.test.ts: ok
# EXIT:0
# Label: SQLITE_HOST unit; markVerifiedDescriptor remains labelled; not joined proof.

npx --yes tsx docs/release/proposals/team5/wave2evidence-fileio-pack.ts
# HOLD functions/src/index.ts: no GRIN export
# version 1.0.0 / versionCode 23
# GRIN default-off; purchase-entry flags 0 on preview/production
# store-runtime block remains
# legal date 2026-07-27
# Expo SDK 54 / expo-file-system ~19.0.23
# live Rules: no grinEvidence / goodsEvidence
# boundedRead / retention / hasher / transport / pack-complete / unit stamp inspected
# unset FIRESTORE_EMULATOR_HOST: failure (not counted as pass)
# wave2evidence-fileio-pack.ts: ok (inspection; not Wave 2 acceptance)
# EXIT:0

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

Labels recorded from the joined run: **EMULATOR**, **SQLITE_HOST**, **HOST_FILESYSTEM**, **not live deploy**, **not NATIVE_DEVICE**. `test:all`, billing emulators, G1 firestore-only register, G2, docker, and `ci:verify` were not run.

## Remaining source gaps vs deployment / device / owner decisions

File-IO/pack production-path gaps named for this SHA (full-file string reads on GRIN originals; advertised size as sole admission; unclosed handles; production `readLocalBytes` injection; pack completeness only via SQLITE_HOST stamp) **did not remain** at the labelled hosts. Remaining:

1. **NATIVE_DEVICE pending.** Instrumented FileHandle tests are an in-memory stand-in. Expo `FileHandle.readBytes` was not executed on a device process.
2. **`uploadBytesResumable` + Expo `File` Blob is not peak-memory proof.** Avoidable full-file base64/`atob` expansion is removed from the production GRIN transport. JS/native peak during upload remains unmeasured. Do not invent OOM-free claims.
3. **Host pack `putObject` materializes** the retained file with Node `readFile` up to 15 MiB for Firebase JS Storage on Node. Label HOST_FILESYSTEM. Production mobile path uses Expo `File` Blob instead; that path was not executed here.
4. **APP_FILESYSTEM on this host used injected HOST_FILESYSTEM `openHandle`.** Production hasher/copy without injection uses Expo FileSystem.
5. **Server/evidence port factories were injected** so the JS client talks to the emulator-connected app. Production `getFirebaseApp()` defaults were not the objects that issued the callables.
6. Isolated Functions-emulator entry is not production `functions/src/index.ts`. Callables remain unexported / undeployed.
7. `readLocalBytes` remains available as a test/host injection (used by preserved E1 round-trip). Production factory omits it.
8. `GrinApplicationRepository.test.ts` still stamps pack B via `markVerifiedDescriptor` (labelled SQLITE_HOST unit by design).
9. EAS development profiles do not explicitly set purchase-entry `"0"` (preview/production do).

Deployment / device / owner decisions (out of this programme, still open):

- Lift Functions export HOLD / live deploy
- Live Storage + Firestore Rules for `grinEvidence` / `goodsEvidence`
- NATIVE_DEVICE / TalkBack / Play-installed binary / device peak-memory
- Store-runtime block remains: Play/standalone cannot enable GRIN via the public env
- Pricing / quota unresolved
- Billing / public release / versionCode bump — not authorized; `versionCode` stays 23

## What was NOT claimed

- Wave 2 / G6 / public release / billing admission
- NATIVE_DEVICE / TalkBack / Play-installed binary
- Live Firebase, live Storage, Functions export, EAS, Play Console, feature flags
- Legal truth of hashes or ITC (synthetic labelled PDFs only)
- OOM-free hashing or upload on device
- `uploadBytesResumable` as bounded JS/native peak-memory proof
- Expo FileSystem hasher/copy/upload on a device process
