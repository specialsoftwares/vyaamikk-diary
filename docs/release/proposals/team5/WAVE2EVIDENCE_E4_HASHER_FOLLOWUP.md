# Wave 2 evidence E4 / hasher PHASE 3 follow-up (Team 5)

AI QA role, not human certification. **Wave 2 is not accepted.** G6 / public release / billing / Play / NATIVE_DEVICE are not claimed. Forbidden matrix statuses remain unused: `complete` / `accepted` / `pass` / `done` / `approved`.

Independence: this is PHASE 3 of the evidence-workflow assignment. PHASE 2 at `ae0339a` (`049e7e0`, `WAVE2EVIDENCE_E1_E5_REREVIEW.md`) found E4 fail (`assembleEvidencePackInputs` hardcodes `osConversionOccurred: false`) and `persistGrinOwnerSession` `hasher=null`. That mapping is **not** closure. This follow-up executed the production hasher, conversion-persist, and SHA-256 paths on coordinator source closeout `d4b6e1f`. Coordinator narrative was not treated as evidence.

No Team 1–4 production files were edited. Team 5 added only `docs/release/proposals/team5/WAVE2EVIDENCE_E4_HASHER_FOLLOWUP.md`, `docs/release/proposals/team5/wave2evidence-e4-hasher-followup.ts`, and a pointer line in `docs/release/proposals/team5/README.md`.

Worktree: `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa`. Branch: `team/grin-t5-qa`. `/Users/shivamsaurav/Vyaamikk Diary` was not edited. `NEVER reset`. `NEVER merge main`. Functions export / EAS / Play / live flags / live Rules were not run. `versionCode` remains 23.

## SHAs

| Role | Full SHA | Subject |
|---|---|---|
| Reviewed production closeout | `d4b6e1fa0a6adf8dff7dd4b774d05150474b9603` | persist conversion metadata and hash retained bytes through the app binding |
| This QA docs commit | `team/grin-t5-qa` after `d4b6e1f` (docs-only) | PHASE 3 E4/hasher follow-up |
| PHASE 2 rereview (not closure) | `049e7e0f12bcd4ba75f57a68ddaf76c0be7222ea` | Team 5 PHASE 2 E1–E5 rereview of `ae0339a` |
| PHASE 2 inspected tree | `ae0339a30edd92e92f4b05f734fddb4710aacaf4` | Functions-emulator round-trip; G1 typecheck off host sqlite |
| Contract `2026-10-02.wave2evidence` | `41670aa85c32cb174277930ca08eed3a5af93243` | publish E1–E5 evidence-workflow contract |

`GRIN_CONTRACT_REVISION` in `src/goodsEvidence/ports.ts` is `2026-10-02.wave2evidence`. Node `v20.19.4`. Host sqlite library `3.50.4`. OpenJDK 17.0.16.

## HOLDs inspected on this SHA

| HOLD | Observation |
|---|---|
| GRIN default-off | `eas.json` does not set `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED=1`. Client gate remains `=== "1"`. Store/standalone runtime forces off even if the public env is `"1"`. |
| Purchase-entry flags | EAS **preview** and **production**: `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` `"0"` and `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` `"0"`. Development EAS profile leaves purchase-entry unset (still not `"1"`). |
| Version | `app.json` `expo.version` `1.0.0`; `android.versionCode` `23`. |
| Functions export | `functions/src/index.ts` (80 lines) has no GRIN / `goodsEvidence` / composed export. Isolated emulator entry is `tools/goods-evidence-emulator/functions-entry`, not production `index.ts`. |
| Live Rules | live `storage.rules` has no `grinEvidence`; live `firestore.rules` has no `goodsEvidence`. |
| EAS / Play / deploy | not run; not authorized. |
| NATIVE_DEVICE | not claimed. SQLITE_HOST reopen is not process-death. Injected HOST_FILESYSTEM is not Expo FileSystem on device. |

## Verdict (independent execution at `d4b6e1f`)

Wave 2 **is not accepted.** Pass/fail below are QA observations at the labelled hosts, not matrix row statuses.

| ID | Stated boundary | Result at `d4b6e1f` |
|---|---|---|
| Hasher | `persistGrinOwnerSession` constructs `GrinOutbox` with `server`, `evidence`, **and** `localOriginalHasher` (`createAppLocalOriginalHasher` / `APP_FILESYSTEM`). Hasher must not be null. SQLITE_HOST tests may inject retention fs; do not count that as NATIVE_DEVICE. | **pass at SQLITE_HOST** for construction (`hasher=APP_FILESYSTEM`, not null). Durable admit used injected HOST_FILESYSTEM chunks + FAKE evidence success; hasher still hashed retained bytes. Not NATIVE_DEVICE. |
| E4 conversion | `assembleEvidencePackInputs` must not hardcode `osConversionOccurred:false`. Persist `os_conversion_occurred` through sqlite attach; pack uses `normalizeOsConversionOccurred`. Older NULL rows stay unknown, not false. | **pass at SQLITE_HOST / pack assembly** |
| SHA-256 | `createGrinSha256ChunkHasher` must match independent node SHA-256 (empty, abc, >64KiB). FIPS K must be `0fc19dc6` not `0fc19cd6`. | **pass on host node** (not NATIVE_DEVICE) |
| SQLITE picker | SQLITE_HOST / HOST_FILESYSTEM: PDF attach stores unknown conversion + claimed mime; reopen; persist-hasher durable path through `startGrinOwnerSession` (not a pre-injected successful upload result into `originalIdentityMatches`). | **pass at SQLITE_HOST / HOST_FILESYSTEM**. FAKE evidence port supplied upload success; `originalIdentityMatches` still required `hashRetainedOriginalBytes` from the persist hasher. |
| Suites | Re-run `test:grin-outbox`, `test:grin-product`, `test:goods-evidence-g1-functions-emulator`. Unset hosts fail, not pass. | **pass at labelled hosts**. Unset Functions-emulator hosts exited non-zero. |
| Export HOLD | `functions/src/index.ts` still has no GRIN export. | **HOLD still true** |

PHASE 2 E4 fail (pack invents `false`) and PHASE 2 hasher=`null` **did not reproduce** on this SHA. That is not Wave 2 acceptance.

## Hosts actually used

| Label | What actually ran |
|---|---|
| SQLITE_HOST | Python stdlib sqlite3 bridge (`openHostSqlite`). Host reopen is not process-death. |
| HOST_FILESYSTEM | darwin tmp dirs. Retention fs injected for the persist-hasher durable path. Not Expo FileSystem. Not NATIVE_DEVICE. |
| APP_FILESYSTEM | Production persist hasher label. On this host it read chunks through the injected retention fs. |
| SQLITE_HOST hasher | `outbox.sqliteHost.test.ts` still injects `createSqliteHostLocalOriginalHasher()` (node crypto + node fs). That path was re-run as E2/E3 suite evidence. It is **not** the persistGrinOwnerSession hasher and is **not** NATIVE_DEVICE. |
| INJECTED | Production persist construction used JS httpsCallable ports labelled `not live deploy`. Durable hasher admit used FAKE server/evidence. Isolated Functions-emulator compose uses Admin adapters **inside** `tools/goods-evidence-emulator/functions-entry` only. |
| FUNCTIONS_EMULATOR | `127.0.0.1:5002` (`demo-vyaamikk-grin-t1`), region `asia-south1`. |
| FIRESTORE_EMULATOR | T1 Functions-entry `127.0.0.1:8090`. |
| AUTH_EMULATOR | `127.0.0.1:9100`. |
| STORAGE_EMULATOR | T1 Functions-entry `127.0.0.1:9201`. |
| NATIVE_DEVICE | **not_claimed** |
| LIVE_STORAGE / live Functions | **not_claimed** |

## Commands and results

Working directory: `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa`

### Independent inspection (hasher, conversion, SHA-256, unset hosts)

```bash
npx --yes tsx docs/release/proposals/team5/wave2evidence-e4-hasher-followup.ts
# HOLD functions/src/index.ts: no GRIN export
# persistGrinOwnerSession source wires server+evidence+localOriginalHasher=hasherFactory()
# SHA256 empty node=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 production=match
# SHA256 abc node=ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad production=match
# SHA256 pdf-prefix match; gt64KiB (65553 bytes) node=4de6ff0a51a4cd16f2bb867a3f3ff954ee6509504b64ba03c20eb4b34adf2b81 production=match
# pack normalizeOsConversionOccurred: omitted/null/unknown stay unknown; explicit false preserved
# SQLITE_EXECUTION=SQLITE_HOST
# HOST_FILESYSTEM=darwin …/retain
# NATIVE_DEVICE=not_claimed
# persistGrinOwnerSession hasher=APP_FILESYSTEM server=not live deploy evidence=not live deploy; fail-closed when unexported
# PDF attach stored unknown conversion + claimed mime
# legacy SQL NULL os_conversion_occurred maps to unknown, not false
# sqlite reopen retained unknown conversion + claimed mime
# persist-hasher durable path originalDurable=true actualSha256=e5c62df5dab5c87b6a015ef3d43597074d1eec433b15f51aec63b8582d0e4ab4 hasher=APP_FILESYSTEM
# unset emulator hosts: failure (not counted as pass)
# wave2evidence-e4-hasher-followup.ts: ok (inspection; not Wave 2 acceptance)
```

Executed `startGrinOwnerSession` / `persistGrinOwnerSession` on SQLITE_HOST **without** injecting the hasher factory. Live `GrinOutbox` held:

- `server.portKind=INJECTED`, `transportKind=FIREBASE_JS_HTTPS_CALLABLE`, `compositionLabel="not live deploy"`
- `evidence.portKind=INJECTED`, `transportKind=FIREBASE_JS_HTTPS_CALLABLE`, `compositionLabel="not live deploy; fail-closed when unexported"`
- `localOriginalHasher.executionLabel=APP_FILESYSTEM` (**not null**)

This inspection did **not** call `register` / `upload` on those production JS ports (that would be live Firebase).

Source: `src/screens/grin/grinOriginalHash.ts` contains FIPS K `0x0fc19dc6` and does not contain transposed `0x0fc19cd6`. Production hasher matched independent `node:crypto` SHA-256 for empty, `abc`, PDF prefix, and `HASH_CHUNK_BYTES+17` (64KiB+17).

Pack: stripped `evidencePackInputs.ts` has no `osConversionOccurred: false`. Runtime `assembleEvidencePackInputs` maps omitted / `undefined` / `"unknown"` to `"unknown"`. Explicit `false` stays `false` (known not converted). `normalizeOsConversionOccurred(null)` is `"unknown"`.

Sqlite attach: `attachOriginal` with `osConversionOccurred: "unknown"` and `mime: "application/pdf"` wrote `os_conversion_occurred=unknown` and `claimed_mime=application/pdf`. A raw SQL NULL `os_conversion_occurred` row mapped through `toEvidence` to `"unknown"`, not `false`. Reopen through `startGrinOwnerSession` retained both.

### Persist-hasher durable path (not originalIdentityMatches stub)

After construction proof, the same inspection injected **retention fs** (HOST_FILESYSTEM; allowed) and **FAKE** server/evidence. It did **not** inject `setGrinLocalOriginalHasherFactoryForTests`. `startGrinOwnerSession("owner_e4_hasher")` still bound `APP_FILESYSTEM` + `createGrinSha256ChunkHasher`.

FAKE `upload` returned `originalDurable: true` with `actualSha256` echoed from the claimed hash. That is not a stub of `originalIdentityMatches`. Production `processAttachments` still called `hashRetainedOriginalBytes` (persist hasher chunks + `createGrinSha256ChunkHasher`) and required `uploaded.actualSha256 === localHash.sha256`. Result: `originalDurable=true`, `osConversionOccurred="unknown"`, `actualSha256` equalled independent node SHA-256 of the retained PDF prefix bytes.

`outbox.sqliteHost.test.ts` still injects `createSqliteHostLocalOriginalHasher()` (`executionLabel=SQLITE_HOST`). That is a different path. It was re-run via `test:grin-outbox`. It is not counted as NATIVE_DEVICE and is not the persistGrinOwnerSession hasher.

### SQLITE_HOST picker (product suite)

```bash
npx --yes tsx src/screens/grin/grinOriginalPicker.sqliteHost.test.ts
# SQLITE_EXECUTION=SQLITE_HOST
# HOST_FILESYSTEM=darwin …/retain
# NATIVE_DEVICE=not_claimed
# grinOriginalPicker.sqliteHost.test.ts: ok
```

Executed as part of `npm run test:grin-product`. Production `pickGrinOriginal` with injected OS bridge + host fs (not `expo-document-picker` / camera launch):

- PDF import: durable copy path ≠ source URI; `osConversionOccurred="unknown"`; sqlite `claimed_mime=application/pdf`; inaccurate picker `size: 1` did not win
- Reopen retained unknown conversion + claimed mime
- Persist-hasher durable admit through `startGrinOwnerSession` with `APP_FILESYSTEM` hasher (picker test injects retention fs and node crypto only for **pick-time** hash; outbox hasher remains `createGrinSha256ChunkHasher`)

### Suites requested

```bash
npm run test:grin-outbox
# outbox.isolation.contract.test.ts: ok
# SQLITE_EXECUTION=SQLITE_HOST
# NATIVE_DEVICE=not_claimed (E2/E3 SQLITE_HOST chunk hasher)
# outbox.sqliteHost.test.ts: ok
# migrateGrin.v9Startup.sqliteHost.test.ts: ok

npm run test:grin-product
# GrinFixtureRepository.test.ts: ok
# GrinApplicationRepository.test.ts: ok
# appBinding.defaultServerPort.unit.test.ts: ok
# grinScreens.react.mount.test.ts: ok
# grinScreens.origin.bind.test.ts: ok
# grinOriginalHash.test.ts: ok
# grinOriginalPicker.sqliteHost.test.ts: ok
# grinPdfAdapter.test.ts: ok
# grinLocaleKeys.test.ts: 268 grin keys × 5 locales ok

npm run test:goods-evidence-g1-functions-emulator
# Loaded: grinBeginEvidenceUpload, grinMutateGoodsReceipt, grinReadGoodsReceipt,
#         grinReconcileCommand, grinRegisterGoodsReceipt, grinReserveEvidence,
#         grinUploadEvidence
# Executed (real httpsCallable, not mocked):
#   grinRegisterGoodsReceipt, grinReserveEvidence, grinBeginEvidenceUpload,
#   grinUploadEvidence, grinReadGoodsReceipt
# tools/goods-evidence-emulator/functions-roundtrip.emulator.test.ts: ok
#   (EMULATOR httpsCallable / not live deploy)
```

Unset hosts: the round-trip file, with `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` / `FIREBASE_STORAGE_EMULATOR_HOST` emptied, exited non-zero with `required (firebase emulators:exec). Unset hosts are not a pass.` That failure was not counted as a pass.

The Functions-emulator round-trip still does **not** go through `persistGrinOwnerSession`. Construction wiring, persist-hasher durable admit on FAKE evidence, and callable round-trip were executed as **three** proofs, not one joined app-binding upload.

## Remaining source gaps vs deployment / device / owner decisions

Source gaps (not closed by this follow-up):

1. **Joined persistGrinOwnerSession → processAttachments → JS httpsCallable → Functions emulator was not executed.** Durable hasher admit used a FAKE evidence port. Isolated emulator round-trip uses a separately constructed transport.
2. **APP_FILESYSTEM on this host used injected HOST_FILESYSTEM chunks.** Production `createAppLocalOriginalHasher` reads Expo FileSystem when no injection is present. That native streaming path was not executed.
3. **`GrinOutbox` constructor still allows `localOriginalHasher` null.** Production `persistGrinOwnerSession` always passes `hasherFactory()`. Some SQLITE_HOST helpers (`repoFor` in `GrinApplicationRepository.test.ts`) still construct an outbox without a hasher; that is test composition, not the app binding.
4. **`outbox.sqliteHost.test.ts` injects `createSqliteHostLocalOriginalHasher` (node crypto).** Valid SQLITE_HOST E2/E3 path; not persist hasher; not NATIVE_DEVICE.
5. Isolated Functions-emulator entry is not production `functions/src/index.ts`. Callables remain unexported / undeployed.
6. **`GrinFixtureRepository` still stamps `osConversionOccurred: false`.** Fixture, not `assembleEvidencePackInputs`. Do not treat fixture packs as production conversion evidence.
7. Application pack B completeness in product tests still uses `markVerifiedDescriptor`, not `writeEvidenceUpload`.
8. EAS development profiles do not explicitly set purchase-entry `"0"` (preview/production do).

Deployment / device / owner decisions (out of this programme, still open):

- Lift Functions export HOLD / live deploy
- Live Storage + Firestore Rules for `grinEvidence` / `goodsEvidence`
- NATIVE_DEVICE / TalkBack / Play-installed binary
- Store-runtime block remains: Play/standalone cannot enable GRIN via the public env
- Pricing / quota unresolved (`GRIN_PRICING_QUOTA_UNRESOLVED`)
- Billing / public release / versionCode bump — not authorized; `versionCode` stays 23

## What was NOT claimed

- Wave 2 / G6 / public release / billing admission
- NATIVE_DEVICE / TalkBack / Play-installed binary
- Live Firebase, live Storage, Functions export, EAS, Play Console, feature flags
- Legal truth of hashes or ITC
- Joined persistGrinOwnerSession + Functions-emulator upload on one object
- Expo FileSystem hasher on a device process
