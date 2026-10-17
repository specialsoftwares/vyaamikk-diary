# Wave 2 evidence E1 joined persist→emulator PHASE 4 follow-up (Team 5)

AI QA role, not human certification. **Wave 2 is not accepted.** G6 / public release / billing / Play / NATIVE_DEVICE are not claimed. Forbidden matrix statuses remain unused: `complete` / `accepted` / `pass` / `done` / `approved`.

Independence: this is PHASE 4 of the evidence-workflow assignment. PHASE 3 at `d4b6e1f` (`d3d48fc`, `WAVE2EVIDENCE_E4_HASHER_FOLLOWUP.md`) left remaining source gap (1): joined `persistGrinOwnerSession` → `processAttachments` → JS `httpsCallable` → isolated Functions emulator was **not** executed (FAKE evidence for hasher durable; separate transport for emulator round-trip). This follow-up independently re-executed coordinator SHA `cd5b5f4` on that join. Coordinator narrative was not treated as evidence.

No Team 1–4 production files were edited. Team 5 added only `docs/release/proposals/team5/WAVE2EVIDENCE_E1_JOINED_FOLLOWUP.md`, `docs/release/proposals/team5/wave2evidence-e1-joined-followup.ts`, and a pointer line in `docs/release/proposals/team5/README.md`.

Worktree: `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa`. Branch: `team/grin-t5-qa`. `/Users/shivamsaurav/Vyaamikk Diary` was not edited. `NEVER reset`. `NEVER merge main`. Functions export / EAS / Play / live flags / live Rules were not run. `versionCode` remains 23. Combined was not pushed from this branch.

F1–F4 and W2-01…W2-05 remain preserved as previously recorded. They were not re-opened.

## SHAs

| Role | Full SHA | Subject |
|---|---|---|
| Reviewed combined / this inspection HEAD | `cd5b5f43702b65b7a06d50c56413d26369b6920e` | join persistGrinOwnerSession to Functions-emulator upload |
| Combined delta | none | `origin/integration/grin-g1-g5-source` was still `cd5b5f4` after fetch; no later combined head |
| Parent (Team 5 PHASE 3 docs) | `d3d48fc8138ee407784788acf1209d9dc4e8de45` | PHASE 3 E4/hasher follow-up of `d4b6e1f` |
| Grandparent (hasher/conversion) | `d4b6e1fa0a6adf8dff7dd4b774d05150474b9603` | persist conversion metadata and hash retained bytes through the app binding |
| PHASE 2 rereview (not closure) | `049e7e0f12bcd4ba75f57a68ddaf76c0be7222ea` | Team 5 PHASE 2 E1–E5 rereview of `ae0339a` |
| Contract `2026-10-02.wave2evidence` | `41670aa85c32cb174277930ca08eed3a5af93243` | publish E1–E5 evidence-workflow contract |
| This QA docs commit | `team/grin-t5-qa` after `cd5b5f4` (docs-only) | PHASE 4 joined persist-emulator follow-up |

`GRIN_CONTRACT_REVISION` in `src/goodsEvidence/ports.ts` is `2026-10-02.wave2evidence`. Node `v20.19.4`. Host sqlite library `3.50.4`. OpenJDK 17.0.16.

## HOLDs inspected on this SHA

| HOLD | Observation |
|---|---|
| GRIN default-off | `eas.json` does not set `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED=1`. Client gate remains `=== "1"`. Store/standalone runtime forces off even if the public env is `"1"`. |
| Purchase-entry flags | EAS **preview** and **production**: `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` `"0"` and `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` `"0"`. Development EAS profiles leave purchase-entry unset (still not `"1"`). |
| Version | `app.json` `expo.version` `1.0.0`; `android.versionCode` `23`. |
| Functions export | `functions/src/index.ts` (80 lines) has no GRIN / `goodsEvidence` / composed export. Isolated emulator entry is `tools/goods-evidence-emulator/functions-entry`, not production `index.ts`. |
| Live Rules | live `storage.rules` has no `grinEvidence`; live `firestore.rules` has no `goodsEvidence`. |
| EAS / Play / deploy | not run; not authorized. |
| NATIVE_DEVICE | not claimed. SQLITE_HOST reopen is not process-death. Injected HOST_FILESYSTEM is not Expo FileSystem on device. |

## Verdict (independent execution at `cd5b5f4`)

Wave 2 **is not accepted.** Pass/fail below are QA observations at the labelled hosts, not matrix row statuses. G6 / device / billing / public-release are not Done.

| ID | Stated boundary | Result at `cd5b5f4` |
|---|---|---|
| E1 joined | One object through `persistGrinOwnerSession` → `attachOriginal` → `dispatchDue` / `processAttachments` → real Firebase JS `httpsCallable` against isolated Functions emulator. Hasher factory not injected (`createAppLocalOriginalHasher` / `APP_FILESYSTEM`). Unset hosts fail, not pass. | **pass at EMULATOR / SQLITE_HOST / HOST_FILESYSTEM**. Not NATIVE_DEVICE. Not live deploy. |
| Hasher | `persistGrinOwnerSession` constructs `GrinOutbox` with `serverPortFactory()`, `evidencePortFactory()`, `hasherFactory()`. Joined test does not call `setGrinLocalOriginalHasherFactoryForTests`. | **pass at SQLITE_HOST / APP_FILESYSTEM label**. Chunks came from injected HOST_FILESYSTEM. |
| httpsCallable | Not mocked. `httpsCallable` imported from `firebase/functions` and invoked against emulator-connected Functions. | **pass at EMULATOR**. Isolated `functions-entry`, not production `functions/src/index.ts`. |
| Unset hosts | `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` / `FIREBASE_STORAGE_EMULATOR_HOST` emptied must fail. | **failure as required** (not counted as a pass, not a skip). |
| Export HOLD | `functions/src/index.ts` still has no GRIN export. | **HOLD still true** |

PHASE 3 remaining source gap (1) **did not reproduce** on this SHA at the labelled emulator/host boundary. That is not Wave 2 acceptance.

## Hosts actually used

| Label | What actually ran |
|---|---|
| SQLITE_HOST | Python stdlib sqlite3 bridge (`openHostSqlite`) injected via `setGrinApplicationDbFactoryForTests`. Host reopen is not process-death. |
| HOST_FILESYSTEM | darwin tmp dir injected via `setGrinOriginalRetentionFsForTests`. Hasher labelled `APP_FILESYSTEM` read chunks through this injection. Not Expo FileSystem. Not NATIVE_DEVICE. |
| APP_FILESYSTEM | Production persist hasher label (`createAppLocalOriginalHasher`). Factory was **not** replaced. |
| EMULATOR | Isolated Functions+Auth+Firestore+Storage, project `demo-vyaamikk-grin-t1`, region `asia-south1`. |
| FUNCTIONS_EMULATOR | `127.0.0.1:5002`. |
| FIRESTORE_EMULATOR | T1 Functions-entry `127.0.0.1:8090`. |
| AUTH_EMULATOR | `127.0.0.1:9100`. |
| STORAGE_EMULATOR | T1 Functions-entry `127.0.0.1:9201`. |
| INJECTED | Server and evidence **port factories** were injected with emulator-connected `createFirebaseGrinTransport` / `createFirebaseGrinEvidenceTransport` wrapping real `httpsCallable`. Node `readFile` supplied evidence bytes. `putReservedObjectWithJsStorage` wrote Storage. Admin SDK seeded user/ledger/admission and minted a custom token. |
| NATIVE_DEVICE | **not_claimed** |
| LIVE_STORAGE / live Functions | **not_claimed** |

## Production path review (source, not coordinator narrative)

`persistGrinOwnerSession` in `src/services/grin/repository/appBinding.ts` still constructs:

```
new GrinOutbox({
  db,
  server: serverPortFactory(),
  evidence: evidencePortFactory(),
  localOriginalHasher: hasherFactory(),
})
```

Default hasher factory is `createAppLocalOriginalHasher()` (`executionLabel=APP_FILESYSTEM`). `GrinOutbox.dispatchDue` calls `processAttachments` for `attachment_pending` rows. `processAttachments` calls `evidence.upload(...)` then `hashRetainedOriginalBytes` (persist hasher chunks + `createGrinSha256ChunkHasher`) before `originalIdentityMatches`.

The joined test:

- Calls `persistGrinOwnerSession()` after `advanceGrinLiveToken`.
- Does **not** import or call `setGrinLocalOriginalHasherFactoryForTests`.
- Does **not** mock `httpsCallable` (`jest.mock` / `vi.mock` / `mockHttpsCallable` absent). `realCall` is `httpsCallable(fns, name)` against the emulator-connected Functions instance.
- Injects SQLITE_HOST db, HOST_FILESYSTEM retention, and emulator-wired server/evidence ports (documented below).
- Asserts live outbox hasher `executionLabel === APP_FILESYSTEM`.
- `createQueued` → `attachOriginal` → `dispatchDue` (register → `attachment_pending`) → `dispatchDue` (`processAttachments` → `issued`).
- Reopens SQLITE_HOST and reads `original_durable=1` plus matching `actual_sha256`.

Proof 1 (direct `createFirebaseGrinEvidenceTransport.upload`) still runs first in the same process. Proof 2 is the joined persist path on a **second** receipt/evidence id (`receipt_e1_persist` / `evidence_e1_persist`).

## Remaining injected boundaries (not skips)

These were present in the passing joined run. They are labelled, not hidden:

1. **Emulator hosts** from `firebase emulators:exec` (Firestore 8090, Functions 5002, Storage 9201, Auth 9100). Unset hosts fail.
2. **`GRIN_GOODS_EVIDENCE_FUNCTIONS=true`** on the emulator process only.
3. **Auth emulator custom token** for seeded uid `owner_e1_roundtrip`.
4. **Admin seed** of user / ledger (`ledger_e1_roundtrip` and `GRIN_APPLICATION_LEDGER_ID`) / admission.
5. **SQLITE_HOST** db factory (`openHostSqlite`).
6. **HOST_FILESYSTEM** retention chunks for the persist hasher (`setGrinOriginalRetentionFsForTests`).
7. **Node `readFile`** for evidence-port `readLocalBytes` (production default is fetch / Expo FileSystem).
8. **JS Storage helper** `putReservedObjectWithJsStorage` on the emulator-connected Storage app (not production `getFirebaseStorage()`).
9. **Server/evidence port factories** injected so the JS client talks to the emulator-connected app rather than production `getFirebaseApp()` / `createFirebaseJsGrinTransport()` defaults.

Hasher factory was **not** among these injections.

## Commands and results

Working directory: `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa` at `cd5b5f43702b65b7a06d50c56413d26369b6920e`.

### Independent inspection (wiring, HOLDs, unset hosts)

```bash
npx --yes tsx docs/release/proposals/team5/wave2evidence-e1-joined-followup.ts
# HOLD functions/src/index.ts: no GRIN export
# version 1.0.0 / versionCode 23
# GRIN default-off; purchase-entry flags 0 on preview/production
# persistGrinOwnerSession source wires server+evidence+localOriginalHasher=hasherFactory()
# hasher factory remains createAppLocalOriginalHasher / APP_FILESYSTEM
# joined test: hasher factory not injected; httpsCallable not mocked
# injected boundaries present: emulator hosts, auth token, Admin seed, SQLITE_HOST, HOST_FILESYSTEM, node readFile
# live Rules: no grinEvidence / goodsEvidence
# unset emulator hosts: failure (not counted as pass)
# wave2evidence-e1-joined-followup.ts: ok (inspection; not Wave 2 acceptance)
```

Unset hosts exited non-zero with `required (firebase emulators:exec). Unset hosts are not a pass.` That failure was not counted as a pass and was not treated as a skip.

### Joined emulator proof (requested command)

```bash
npm run test:goods-evidence-g1-functions-emulator
# Loaded: grinBeginEvidenceUpload, grinMutateGoodsReceipt, grinReadGoodsReceipt,
#         grinReconcileCommand, grinRegisterGoodsReceipt, grinReserveEvidence,
#         grinUploadEvidence
#
# Proof 1 — direct createFirebaseGrinEvidenceTransport (real httpsCallable, not mocked):
#   grinRegisterGoodsReceipt, grinReserveEvidence, grinBeginEvidenceUpload,
#   grinUploadEvidence, grinReadGoodsReceipt
#
# SQLITE_EXECUTION=SQLITE_HOST
# HOST_FILESYSTEM=darwin /var/folders/ph/rhhwq765259cd4hjk7kxg4vh0000gp/T/grin-e1-persist-sfrIuD/retain
# NATIVE_DEVICE=not_claimed (SQLITE_HOST tests are not NATIVE_DEVICE process-death proof.)
#
# Proof 2 — persistGrinOwnerSession → attachOriginal → dispatchDue/processAttachments
#           (real httpsCallable, not mocked):
#   grinRegisterGoodsReceipt, grinReadGoodsReceipt, grinReserveEvidence,
#   grinBeginEvidenceUpload, grinUploadEvidence, grinReadGoodsReceipt
#
# tools/goods-evidence-emulator/functions-roundtrip.emulator.test.ts: ok
#   (EMULATOR persistGrinOwnerSession httpsCallable / SQLITE_HOST / HOST_FILESYSTEM / not live deploy)
# Script exited successfully (code 0)
```

Labels recorded from this run: **EMULATOR**, **SQLITE_HOST**, **HOST_FILESYSTEM**, **not live deploy**, **not NATIVE_DEVICE**. Unset-host skips were not used.

## Remaining source gaps vs deployment / device / owner decisions

PHASE 3 gap (1) (joined persist → processAttachments → httpsCallable → isolated Functions emulator) is **closed at EMULATOR / SQLITE_HOST / HOST_FILESYSTEM**. Remaining:

1. **APP_FILESYSTEM on this host used injected HOST_FILESYSTEM chunks.** Production `createAppLocalOriginalHasher` reads Expo FileSystem when no injection is present. That native streaming path was not executed.
2. **Evidence bytes used node `readFile`, not production `defaultReadLocalBytes` (fetch / Expo FileSystem).** Storage put used the emulator-connected JS helper, not production `getFirebaseStorage()`.
3. **Server/evidence port factories were injected** to bind the JS client to the emulator app. Production `persistGrinOwnerSession` defaults (`createFirebaseJsGrinTransport` / `createFirebaseJsGrinEvidenceTransport` via `getFirebaseApp()`) were not the objects that issued the callables.
4. **`GrinOutbox` constructor still allows `localOriginalHasher` null.** Production `persistGrinOwnerSession` always passes `hasherFactory()`. Some SQLITE_HOST helpers still construct an outbox without a hasher; that is test composition, not the app binding.
5. **`outbox.sqliteHost.test.ts` still injects `createSqliteHostLocalOriginalHasher` (node crypto).** Valid SQLITE_HOST E2/E3 path; not persist hasher; not NATIVE_DEVICE.
6. Isolated Functions-emulator entry is not production `functions/src/index.ts`. Callables remain unexported / undeployed.
7. **`GrinFixtureRepository` still stamps `osConversionOccurred: false`.** Fixture, not `assembleEvidencePackInputs`. Do not treat fixture packs as production conversion evidence.
8. Application pack B completeness in product tests still uses `markVerifiedDescriptor`, not `writeEvidenceUpload`.
9. EAS development profiles do not explicitly set purchase-entry `"0"` (preview/production do).

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
- Expo FileSystem hasher on a device process
- Production default `getFirebaseApp()` ports against live or emulator (joined proof used injected emulator-connected ports)
