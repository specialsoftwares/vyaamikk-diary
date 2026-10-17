# Wave 2 evidence E1–E5 PHASE 2 rereview (Team 5)

AI QA role, not human certification. **Wave 2 is not accepted.** G6 / public release / billing / Play / NATIVE_DEVICE are not claimed. Forbidden matrix statuses remain unused: `complete` / `accepted` / `pass` / `done` / `approved`.

Independence: this is PHASE 2 of the evidence-workflow assignment. PHASE 1 reproductions at combined `41670aa` / Team 5 `4711f7d` (`WAVE2EVIDENCE_E1_E5_REPRO.md`) mapped open defects. That mapping is **not** closure. This review executed production paths on the corrected combined tree `ae0339a`. Coordinator narrative and Team 1–4 summaries were not treated as evidence. Existing green product/interop tests were re-run as execution, not as rubber-stamp.

No Team 1–4 production files were edited. Team 5 added only `docs/release/proposals/team5/**` plus pointer lines in `GRIN_ACCEPTANCE_MATRIX.md`, `GRIN_TEAM_BOARD.md`, `UNSENT_JIRA_GRIN_G1.md`, and `GRIN_IMPLEMENTATION_REGISTER.md`.

Worktree: `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa`. Branch: `team/grin-t5-qa`. `/Users/shivamsaurav/Vyaamikk Diary` was not edited. `NEVER reset`. `NEVER merge main`. Functions export / EAS / Play / live flags / live Rules were not run. `versionCode` remains 23.

## SHAs

| Role | Full SHA | Subject |
|---|---|---|
| Reviewed / this HEAD | `ae0339a30edd92e92f4b05f734fddb4710aacaf4` | record the Functions-emulator round-trip and keep G1 typecheck off host sqlite |
| `origin/integration/grin-g1-g5-source` | `ae0339a30edd92e92f4b05f734fddb4710aacaf4` | same as this review HEAD |
| PHASE 1 mapping (not closure) | `4711f7d71060e61556e368137f81ab90babbe509` | Team 5 E1–E5 reproductions at `41670aa` |
| Contract `2026-10-02.wave2evidence` | `41670aa85c32cb174277930ca08eed3a5af93243` | publish E1–E5 evidence-workflow contract |
| Team 1 isolated Functions entry | `15bd2a6bd1bc04f0605112e095a1eb0c314be224` | isolated Functions evidence transport |
| Team 1 merge onto combined | `09e994784a468516a3d012e47ec8b280c0ae06ba` | merge Team 1 isolated Functions evidence transport |
| Team 2 stored-byte / E5 categories | `29c6d3fd85482f207299dc0195047f624170585b` | verify stored evidence bytes and share E5 upload categories |
| Team 3 admission + descriptors | `0d0dd841d4ec37e05313ce4070a86968fe6510b9` | verify retained original bytes before marking durable |
| Team 4 picker / pack / evidence factory | `83f10f871515eee192d9ebae6d277351d50577ae` | origin-bound original picker and pack coverage labels |
| Team 4 merge onto combined | `6bf577bc7421fab12943bca0004c5db942fde87f` | merge Team 4 picker, evidence-port wiring, and pack coverage labels |

`GRIN_CONTRACT_REVISION` in `src/goodsEvidence/ports.ts` is `2026-10-02.wave2evidence`. Node `v20.19.4`. Host sqlite library `3.50.4`. Pinned `expo-image-picker@17.0.11`. `node_modules` is a real directory. `functions/node_modules` (`firebase-admin@13.10.0`) exists; isolated Functions entry symlinks it at build time.

## HOLDs inspected on this SHA

| HOLD | Observation |
|---|---|
| GRIN default-off | `eas.json` does not set `EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED=1`. Client gate remains `=== "1"`. Store/standalone runtime forces off even if the public env is `"1"` (`featureFlag.test.ts`). |
| Purchase-entry flags | EAS **preview** and **production**: `EXPO_PUBLIC_SUBSCRIPTION_PURCHASE_ENTRY_ENABLED` `"0"` and `EXPO_PUBLIC_QUOTA_UPSELL_ENABLED` `"0"`. Development EAS profiles leave purchase-entry unset (still not `"1"`). |
| Version | `app.json` `expo.version` `1.0.0`; `android.versionCode` `23`. |
| Functions export | `functions/src/index.ts` (80 lines) has no GRIN / `goodsEvidence` / composed export. Isolated emulator entry is `tools/goods-evidence-emulator/functions-entry/handlers.ts`, not production `index.ts`. |
| Live Rules | live `storage.rules` has no `grinEvidence`; live `firestore.rules` has no `goodsEvidence`. Isolated copies under `tools/goods-evidence-*` are not live. |
| EAS / Play / deploy | not run; not authorized. |
| NATIVE_DEVICE | not claimed. SQLITE_HOST reopen is not process-death. |

## Verdict (independent execution at `ae0339a`)

Wave 2 **is not accepted.** Pass/fail below are QA observations at the labelled hosts, not matrix row statuses.

| ID | Stated boundary | Result at `ae0339a` |
|---|---|---|
| E1 | `persistGrinOwnerSession` constructs `GrinOutbox` with `serverPortFactory` **and** `evidencePortFactory`; real `httpsCallable` Functions-emulator round-trip; unset hosts fail; `functions/src/index.ts` has no GRIN export | **pass at labelled hosts** |
| E2 | `originalIdentityMatches` requires SHA-256 of retained local bytes; SQLITE_HOST negatives + known-bytes positive | **pass at SQLITE_HOST** |
| E3 | `writeEvidenceUpload` persists descriptor columns; pack inputs use those fields; reopen; stale completion does not overwrite | **pass at SQLITE_HOST** |
| E4 | PDF/document + image + camera; durable app-owned copy; SQLITE_HOST / HOST_FILESYSTEM labels; quality 0.8 gone; `osConversionOccurred` not hardcoded `false` without evidence | **fail** |
| E5 | Attach categories include stock_accounting / payment / gst / return_document; pack A/B/C/D; ITC `not_determined`; policy v2 | **pass at SQLITE_HOST / INJECTED** |

Hash equality is integrity, not legal truth. Mapping is not G6.

## Hosts actually used

| Label | What actually ran |
|---|---|
| SQLITE_HOST | Python stdlib sqlite3 bridge (`openHostSqlite`). Host reopen is not process-death. |
| HOST_FILESYSTEM | darwin tmp dirs in Team 5 inspection (`wave2evidence-e1-e5-rereview.ts`). Production picker test uses host fs but logs `SQLITE_HOST` only (see E4). |
| INJECTED | FAKE server/evidence for SQLITE_HOST outbox and product tests. Isolated Functions-emulator compose uses Admin adapters **inside** `tools/goods-evidence-emulator/functions-entry` only. |
| FIRESTORE_EMULATOR | G1 `127.0.0.1:8088` (`demo-vyaamikk-grin-g1`). T1 Functions-entry Firestore `127.0.0.1:8090`. T2 `127.0.0.1:8091`. |
| FUNCTIONS_EMULATOR | `127.0.0.1:5002` (`demo-vyaamikk-grin-t1`), region `asia-south1`. |
| AUTH_EMULATOR | `127.0.0.1:9100`. |
| STORAGE_EMULATOR | T1 Functions-entry `127.0.0.1:9201`. T2 `127.0.0.1:9200`. |
| NATIVE_DEVICE | **not_claimed** |
| LIVE_STORAGE / live Functions | **not_claimed** |

G1 did not bind 8091/9200. T2 did not bind 8088/5002. No live Rules or Functions deploy.

## Commands and results

Working directory: `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa`

### E1 — production composition + real httpsCallable

```bash
npx --yes tsx docs/release/proposals/team5/wave2evidence-e1-e5-rereview.ts
# HOLD functions/src/index.ts: no GRIN export
# persistGrinOwnerSession wired server=not live deploy
# evidence=not live deploy; fail-closed when unexported hasher=null
# E1 unset emulator hosts: failure (not counted as pass)
# wave2evidence-e1-e5-rereview.ts: ok (inspection; not Wave 2 acceptance)

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

Executed `persistGrinOwnerSession` / `startGrinOwnerSession` on SQLITE_HOST **without** injecting server or evidence factories. Live `GrinOutbox` held:

- `server.portKind=INJECTED`, `transportKind=FIREBASE_JS_HTTPS_CALLABLE`, `compositionLabel="not live deploy"`
- `evidence.portKind=INJECTED`, `transportKind=FIREBASE_JS_HTTPS_CALLABLE`, `compositionLabel="not live deploy; fail-closed when unexported"`
- `localOriginalHasher=null` (remaining source gap; see below)

This inspection did **not** call `register` / `upload` on those production JS ports (that would be live Firebase). Durability of reserve → JS Storage put → stored-byte verify was the isolated Functions-emulator script, which uses `httpsCallable` from `firebase/functions` against emulator hosts. `httpsCallable` is not mocked.

Unset hosts: the same round-trip file, with `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` / `FIREBASE_STORAGE_EMULATOR_HOST` emptied, exited non-zero with `required (firebase emulators:exec). Unset hosts are not a pass.` That failure was not counted as a pass.

#### Remaining injected boundaries (E1 round-trip)

These are documented injections, not skips:

- Emulator hosts from `firebase emulators:exec` (Firestore 8090, Functions 5002, Storage 9201, Auth 9100). Unset hosts fail.
- `GRIN_GOODS_EVIDENCE_FUNCTIONS=true` on the emulator process only (npm script). Not an `EXPO_PUBLIC_*` client flag.
- Auth emulator custom token for the seeded uid.
- Admin seed of user / ledger / admission (`firebase-admin` in the **test** and isolated functions-entry compose, not in mobile `src/`).
- Node `readFile` of the retained local original in the round-trip test only. Production transport uses `fetch` / Expo FileSystem, not `node:fs`.
- Isolated `tools/goods-evidence-emulator/functions-entry` exports the GRIN callables. Production `functions/src/index.ts` still does not.

The round-trip constructs `createFirebaseGrinEvidenceTransport` with those test deps. It does **not** go through `persistGrinOwnerSession`. Construction wiring and callable round-trip were executed as two proofs, not one joined app-binding upload.

### E2 — SHA-256 of retained local bytes

```bash
npm run test:grin-outbox
# outbox.isolation.contract.test.ts: ok
# SQLITE_EXECUTION=SQLITE_HOST
# NATIVE_DEVICE=not_claimed (E2/E3 SQLITE_HOST chunk hasher)
# outbox.sqliteHost.test.ts: ok
# migrateGrin.v9Startup.sqliteHost.test.ts: ok
```

Drove production `GrinOutbox.processAttachments` → private `originalIdentityMatches` (not a copy). SQLITE_HOST injects `createSqliteHostLocalOriginalHasher()` at `HASH_CHUNK_BYTES`.

Negatives executed (file stays `originalDurable=false` / `attachment_pending`):

- echoed claimed hash A with `actualSha256` of different bytes
- null local claim + null returned hashes
- wrong owner / receipt / ledger / category / evidenceId
- invalid size
- `generation="verified"` and empty generation
- other-receipt identity patch
- session/lease fence: expired attempt skipped `lease_held`; winner marked durable

Positive known-bytes case: independent SHA-256 of a `HASH_CHUNK_BYTES+17` buffer; `originalDurable=true`; `actualSha256` equals the independent hash; sqlite reopen retains the descriptor.

Isolation contract: outbox source does not treat `uploaded.claimedSha256` as the admission predicate and does not write `generation: "verified"`.

### E3 — persisted descriptors and pack inputs

Same `outbox.sqliteHost.test.ts` plus `GrinApplicationRepository.test.ts`.

After the positive known-bytes upload, sqlite row (and reopen) held `actual_sha256`, `mime`, `size_bytes` (`verifiedSizeBytes`), `storage_path`, `object_generation`, `reservation_id`, `capture_provenance`. Stale completion with a different hash/generation did not overwrite the newer descriptor (`actualSha256` stayed the known hash; `objectGeneration` stayed `orig-gen-1`).

Production `toPackOriginalInput` maps `rawSha256` from `file.actualSha256`, `generation` from `file.objectGeneration` (rejects literal `"verified"`), `mime` from `file.mime` (no `mimeFromPath`). Pack C with `object_generation="verified"` stays incomplete.

### E4 — capture / select (fail)

```bash
npx --yes tsx src/screens/grin/grinOriginalPicker.sqliteHost.test.ts
# SQLITE_EXECUTION=SQLITE_HOST
# NATIVE_DEVICE=not_claimed
# grinOriginalPicker.sqliteHost.test.ts: ok
```

Executed production `pickGrinOriginal` with injected OS bridge + host fs (not `expo-document-picker` / camera launch):

- PDF import: durable copy path ≠ source URI; hash of retained bytes; `captureProvenance=imported_original`; `osConversionOccurred="unknown"`; inaccurate picker `size: 1` did not win over measured bytes
- JPEG import: `captureProvenance=os_conversion`; `osConversionOccurred` not hardcoded `false` in the picker
- Camera: injected JPEG bytes; `captureProvenance=camera_capture`; `osConversionOccurred="unknown"`
- Uncommitted temp discarded; committed PDF retained

Production picker source: `quality: 0.8` is absent (comment only). `launchCameraAsync` does not set `quality`. Library path is `expo-document-picker` with PDF + JPEG/PNG/WebP.

**Failed stated boundary:** `src/goodsEvidence/evidencePackInputs.ts` still hardcodes `osConversionOccurred: false` when assembling pack originals, with no evidence from the picker (`"unknown"` is discarded). `attachOriginal` accepts `osConversionOccurred` / `mime` but `outbox.attachLocalFile` does not persist conversion; mime is written later from a verified upload.

**Labelling:** picker tests log `SQLITE_HOST` and `NATIVE_DEVICE=not_claimed`. They do not print `HOST_FILESYSTEM` even though they use host tmp files. Team 5 inspection logged `HOST_FILESYSTEM=darwin …`.

### E5 — attach categories and pack A/B/C/D

```bash
npx --yes tsx src/services/grin/repository/GrinApplicationRepository.test.ts
# SQLITE_EXECUTION=SQLITE_HOST
# GrinApplicationRepository.test.ts: ok

npx --yes tsx tools/goods-evidence-storage/pack.injected.test.ts
# E5 pack path A/B/C/D + policy v2 invoice reference
```

`WAVE1_ORIGINAL_CATEGORIES` / `GRIN_ATTACH_CATEGORIES` include `stock_accounting`, `payment`, `gst`, `return_document`. UI `GrinAttachmentsAdmittedBody` options are that full list; locale catalogs include those four keys. Inspection `attachOriginal` for all four succeeded; `originalDurable=false` with missing backend (not fabricated success).

Production `exportPack`:

- A: no verified originals → `completenessLabel=incomplete` with reasons (`commercial_document` / invoice reference / no verified originals); `invoiceReferenceIsNotRetainedInvoice=true`
- B: required coverage via verified descriptors → `coverage=complete`, `originalsBundled=false`, `exportKind=manifest_and_pdf_summary`, `itcDisposition=not_determined`, `supportPolicyVersion=2`, `mayMarkComplete=true` without forcing completeness
- C: `generation="verified"` → incomplete
- D: previously returned pack object's pinned cut is unchanged after later events; a new `exportPack` sees the later cut

App pack B stamps sqlite with test helper `markVerifiedDescriptor` (not `writeEvidenceUpload`). That is SQLITE_HOST injection, documented. G2 `pack.injected.test.ts` covers A/B/C/D with INJECTED retrieve/link (still not NATIVE_DEVICE).

### Item 6 — register → amend → QC → return → read-confirmed

```bash
npm run test:goods-evidence-g1-emulator
# composed.emulator.test.ts: ok (EMULATOR / not live deploy)
# events: receipt_registered, field_amended, qc_decision, return_dispatched
# original snapshot/hash unchanged on amend; ITC not claimed

npm run test:grin-interop
# FIRESTORE_EMULATOR_HOST=unset → EMULATOR_VARIANT=not_run (not counted as emulator pass)

firebase emulators:exec --only firestore --project demo-vyaamikk-grin-g1 \
  --config tools/goods-evidence-emulator/firebase.json \
  "npx --yes tsx tools/grin-interop/f2-register-amend-confirm.sqliteHost.test.ts"
# F2_CONFIRMED_EVENT_VERSION=6
# SQLITE_HOST+INJECTED: ok
# EMULATOR_VARIANT=ran
```

`composed.emulator.test.ts` uses `GoodsEvidenceRegisterAdapter` (Firestore adapter) through `createComposedGrinCallables`, not register+confirm only. Original remarks stay `not_supplied` after amend. F2 leftover `expectedVersion===0` shim is absent (`tools/grin-interop/isolation.contract.test.ts` asserts `rec.expectedVersion === 0` is gone). Production `clientExpectedVersion` throws `GRIN_NO_CONFIRMED_VERSION` when confirmed `eventVersion < 1`.

### Item 7 — mounted production screen bodies

```bash
npx --yes tsx src/screens/grin/grinScreens.origin.bind.test.ts
# SQLITE_HOST; NATIVE_DEVICE=not_claimed
# grinScreens.origin.bind.test.ts: ok
```

Mounted production admitted bodies with inert native surfaces: Amend / QC / Return / Create / **EWB** / **attachments (picker)** / **pack share**. Captured A's callback after `startGrinOwnerSession(B)` did not dispatch B. Retirement is checked before dispatch and after awaits (picker hold, PDF generate hold). Pack share catch does not claim cancellation of an OS share already launched.

`grinScreens.react.mount.test.ts` remains an inert-child mount of the admission host. It is not the origin-bind proof.

### Item 8 — fabricated success / shims / skip-as-pass

Executed isolation contracts (`outbox`, `goodsEvidence`, `grin-interop`, `transport`, G1 packaging, G2 storage). Unset Functions-emulator hosts **fail**. F2 without `FIRESTORE_EMULATOR_HOST` logs `EMULATOR_VARIANT=not_run` and still requires the SQLITE_HOST assertions; that skip was not treated as emulator execution. FAKE ports stay labelled `FAKE`. `markVerifiedDescriptor` is an explicit test stamp. Production `persistGrinOwnerSession` does not invent durable originals when the hasher is missing (`hasher=null` → fail closed).

### F1–F4 and W2-01…W2-05 (preserved, not re-opened)

```bash
npm run test:grin-product          # F1 origin.bind, F3 pack, E4 picker, E5 attach
npm run test:grin-outbox           # W2-01, W2-02, W2-05, E2/E3
npm run test:goods-evidence-g1-unit
npm run test:goods-evidence-g2-unit   # W2-03, F3/E5 pack injected
npm run test:goods-evidence-g2-emulator  # W2-04 isolated Rules; live Rules unchanged
npx --yes tsx src/goodsEvidence/featureFlag.test.ts
npx --yes tsx src/billing/quotaUpsell/quotaUpsell.contract.test.ts
```

All of the above exited 0. Live `storage.rules` / `firestore.rules` still have no GRIN paths.

## Remaining source gaps vs deployment / device / owner decisions

Source gaps (not closed by this rereview):

1. **`persistGrinOwnerSession` does not pass `localOriginalHasher`.** Production `originalIdentityMatches` fail-closes without a hasher, so the wired evidence port still cannot mark originals durable through the app binding. SQLITE_HOST tests inject a host hasher. There is no Expo FileSystem hasher on the production constructor. Joined proof (`persistGrinOwnerSession` → `processAttachments` → JS transport → Functions emulator) was **not** executed.
2. **`assembleEvidencePackInputs` hardcodes `osConversionOccurred: false`.** Picker correctly records `"unknown"`. Pack assembler discards that. This is the E4 fail.
3. **`attachOriginal` drops `mime` / `osConversionOccurred` at sqlite insert.** Mime arrives later from verified upload descriptors.
4. Application pack B completeness used `markVerifiedDescriptor`, not `writeEvidenceUpload`.
5. Isolated Functions-emulator entry is not production `functions/src/index.ts`. Callables remain unexported / undeployed.
6. EAS development profiles do not explicitly set purchase-entry `"0"` (preview/production do).

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
- Cancellation of an OS share already launched
- Joined persistGrinOwnerSession + Functions-emulator upload on one object
