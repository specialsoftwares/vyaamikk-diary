# Wave 2 evidence E1–E5 independent reproductions (Team 5)

AI QA role, not human certification. **Wave 2 is not accepted.** G6 / public release / billing / Play / NATIVE_DEVICE are not claimed. Forbidden matrix statuses remain unused: `complete` / `accepted` / `pass` / `done` / `approved`.

Independence: each finding was **executed** on production methods at combined HEAD `41670aa85c32cb174277930ca08eed3a5af93243` (contract revision `2026-10-02.wave2evidence`). Coordinator narrative and Team 1–4 summaries were not treated as evidence. Existing green product/interop tests were not used as closure.

No Team 1–4 production files were edited. Team 5 added only `docs/release/proposals/team5/**` and a pointer line in `GRIN_ACCEPTANCE_MATRIX.md`.

Worktree: `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa`. Branch: `team/grin-t5-qa`. `/Users/shivamsaurav/Vyaamikk Diary` was not edited. `NEVER reset`. `NEVER merge main`. This branch was not merged to combined or main. Functions export / EAS / Play / live flags / live Rules were not run.

## SHAs

| Role | Full SHA | Subject |
|---|---|---|
| Combined / this review HEAD | `41670aa85c32cb174277930ca08eed3a5af93243` | docs(grin): publish E1–E5 evidence-workflow contract |
| `origin/integration/grin-g1-g5-source` | `41670aa85c32cb174277930ca08eed3a5af93243` | same as HEAD |
| Contract `2026-10-02.wave2evidence` | `41670aa85c32cb174277930ca08eed3a5af93243` | same |
| Starting combined named in contract | `13f90ed33ce60a701eb2e3a73a1e279f2be1888f` | record exact-head local ci:verify on the typecheck SHA |
| Validated application named in contract | `99ee60ceba2f7f4adec01f4e3559c485608687ac` | close root typecheck on the combined application tree |
| G1 parent | `c9623ddb282ea3b1365f2bead9088b10a972a770` | fail closed on corrupt serials, unsafe line ids, and pre-commit logs |

`GRIN_CONTRACT_REVISION` in `src/goodsEvidence/ports.ts` is `2026-10-02.wave2evidence`. Application sources for E1–E5 match `99ee60c` on this tree (contract docs landed after).

## Hosts

| Label | What actually ran |
|---|---|
| SQLITE_HOST | Python stdlib sqlite3 bridge (`openHostSqlite`). Host reopen is not process-death. |
| INJECTED | `createFakeGrinServerPort` for register; `createFirebaseGrinEvidenceTransport` with injected `call` (not live Firebase). Custom `GrinEvidenceUploadPort` for E2/E3. |
| HOST_FILESYSTEM | darwin tmp dirs + `file://` URIs. Pinned `expo-image-picker@17.0.11` types read from `node_modules`. productionPick ran against Team 5 host stand-in (`wave2evidence-e4-fake-picker.mjs`). |
| STORAGE_EMULATOR | **not_run** |
| FIRESTORE_EMULATOR | **not_run** |
| NATIVE_DEVICE | **not_claimed** |
| LIVE_STORAGE | **not_claimed** (E2 is not a live Storage compromise demo) |

Node `v20.19.4`. Host sqlite library `3.50.4`. `node_modules` is a real directory.

## Verdict (8 executed cases)

| ID | Executed defect | Result |
|---|---|---|
| E1a | `persistGrinOwnerSession` `GrinOutbox` has `evidence=null`; `processAttachments` → `attachment_pending` | **reproduced** |
| E1b | Production evidence transport voids `localPath` (payload has no bytes/path) | **reproduced** |
| E2a | `originalIdentityMatches` accepts claimed A + echoed claimed A + actual B | **reproduced** |
| E2b | `originalIdentityMatches` accepts null local claim + null returned hashes when IDs match | **reproduced** |
| E3a | After fake verified upload, sqlite row has no actual hash/generation columns | **reproduced** |
| E3b | `exportPack` / `toPackOriginalInput` uses claimed hash, `generation="verified"`, `mimeFromPath` | **reproduced** |
| E4 | Picker images-only, quality 0.8, URI-only, `claimedSha256=null`, missing size → 0 | **reproduced** |
| E5 | WAVE1 omit stock/payment/gst/return; attach throws; pack policy still recognizes them | **reproduced** |

`wave2evidence-e1-e5-repro.ts` printed `REPRODUCED=` all eight, `NOT_REPRODUCED=none`, `NATIVE_DEVICE=not_claimed`. Mapping is not closure. Wave 2 remains in flight.

## Command

Working directory: `/Users/shivamsaurav/vyd-worktrees/grin-t5-qa`

```bash
npx --yes tsx docs/release/proposals/team5/wave2evidence-e1-e5-repro.ts
# SQLITE_EXECUTION=SQLITE_HOST
# NATIVE_DEVICE=not_claimed
# STORAGE_EMULATOR=not_run
# REPRODUCED=E1-appBinding-evidence-null-processAttachments,E1-evidenceTransport-voids-localPath,E2-echoed-claim-A-actual-B,E2-null-local-claim-null-returned-hashes,E3-sqlite-lacks-actual-hash-generation,E3-toPackOriginalInput-synthetic-generation,E4-picker-images-quality-uri-null-hash-size0,E5-wave1-omits-pack-policy-categories
# NOT_REPRODUCED=none
```

## What was NOT claimed

- NATIVE_DEVICE / TalkBack / Play-installed binary
- Live Firebase, live Storage, Functions export, EAS, Play Console, feature flags
- Isolated STORAGE_EMULATOR / FIRESTORE_EMULATOR (E1 connected emulator round-trip remains a later acceptance path)
- Live Storage compromise (E2 is identity-admission on SQLITE_HOST + INJECTED)
- Durable app-owned copy of picker bytes (E4 host `file://` URIs are not retention)
- Wave 2 / G6 / public release / billing admission

## E1 — App evidence port (Team 1 + Team 2; Team 4 wires `appBinding`)

**reproduced** — SQLITE_HOST + INJECTED

### E1a production composition — SQLITE_HOST

Executed `advanceGrinLiveToken` then **`persistGrinOwnerSession`** (also via `startGrinOwnerSession`) with SQLITE_HOST db factory and FAKE server factory. Inspected the live repository's production `GrinOutbox` instance: `evidence === null`. `setGrinEvidencePortFactoryForTests` is **absent** from `appBinding`.

Then production `GrinApplicationRepository.createQueued` + `attachOriginal` + `GrinOutbox.dispatchDue`:

- register completed with `localState=attachment_pending` (undurable original present)
- second `dispatchDue` entered **`processAttachments`**: no evidence port → `localState=attachment_pending`, `originalDurable=false`

Exact failure: attachments never leave `attachment_pending` on the default production composition because `new GrinOutbox({ db, server })` omits `evidence`, and `GrinOutbox` defaults `this.evidence = deps.evidence ?? null` (`outbox.ts:281`). `processAttachments` returns `attachment_pending` when `!this.evidence` (`outbox.ts:1326-1332`).

### E1b `localPath` voided — INJECTED (not live Firebase)

Executed production **`createFirebaseGrinEvidenceTransport.upload`** with injected `call` + `currentAuth`. Input `localPath` was a host path `…/must-not-leave-host.pdf`. Observed callable payload keys:

`ledgerId,receiptId,evidenceId,role,claimedSha256,category,sizeBytes`

`localPath` absent. Path string not in JSON. `createFirebaseJsGrinEvidenceTransport` exists (`compositionLabel` `not live deploy; fail-closed when unexported`) but **`persistGrinOwnerSession` did not construct it**. Default `call` (live `httpsCallable`) was not invoked.

This is not the connected emulator path required for E1 acceptance (reserve → JS Storage upload → stored-byte verify → link). It is the current default composition failing closed / dropping bytes.

## E2 — Verification admission (Team 2 + Team 3)

**reproduced** — SQLITE_HOST + INJECTED. **Not a live Storage compromise demo.**

Called the production private method **`originalIdentityMatches`** on a live `GrinOutbox` instance, then drove **`processAttachments` → `writeEvidenceUpload`**.

### (a) claimed hash A, returned claimed A, returned actual B

`originalIdentityMatches(...) = true`. After `dispatchDue`, sqlite-backed file `uploadState=verified`, `originalDurable=true`. Port returned `actualSha256=bbbbbbbb…` and `claimedSha256=aaaaaaaa…`.

Exact failure: `outbox.ts:1310-1311` accepts when `uploaded.claimedSha256 === expected` even if `uploaded.actualSha256` differs.

### (b) null local claim and null returned hashes, other IDs match

`originalIdentityMatches(...) = true`. `processAttachments` wrote `uploadState=verified`, `originalDurable=true`, local `claimedSha256=null`.

Exact failure: the hash check is skipped when `file.claimedSha256` is falsy (`outbox.ts:1309-1313`), then the method returns true if `ok && originalDurable` and IDs match.

`uploaded.ok && originalDurable` is treated as sufficient. Actual SHA-256 of retained local bytes is not required.

## E3 — Trusted verification metadata (Team 3 + Team 4)

**reproduced** — SQLITE_HOST

Drove production `GrinOutbox` with an injected evidence port that returned durable success: `actualSha256=HASH_B`, `generation="1700000000099"`, `claimedSha256=HASH_A`. `processAttachments` called **`writeEvidenceUpload(..., "verified", true)`**.

### Sqlite row after fake verified upload

`PRAGMA table_info(grin_local_evidence_files)`:

`id,owner_uid,ledger_id,receipt_id,evidence_id,role,local_path,claimed_sha256,byte_size,category,upload_state,original_durable,retain_local,created_at,updated_at`

Missing: `actual_sha256`, `generation`, `mime`, `storage_path`, `storage_object_generation`.

Row: `upload_state=verified`, `original_durable=1`, `claimed_sha256=aaaaaaaa…`. No actual hash or object generation persisted. `writeEvidenceUpload` updates only `upload_state`, `original_durable`, `retain_local`, `updated_at` (`outbox.ts:1425-1428`).

### Pack input uses synthetic generation

Executed production **`GrinApplicationRepository.exportPack`**, which calls `assembleEvidencePackInputs` with `toPackOriginalInput`. `toPackOriginalInput` is module-private; the production source on this SHA still maps `rawSha256: file.claimedSha256`, `generation: verified ? "verified" : null`, `mime: mimeFromPath(file.localPath)`. Applied that mapping to the sqlite-backed `GrinLocalEvidenceFile` after the fake verified upload:

- `generation=verified` (literal, not `"1700000000099"`)
- `rawSha256=HASH_A` (claimed, not actual B)
- `mime=image/jpeg` from `.jpg` path (attach `mime: "image/png"` was never stored)

`exportPack` completenessLabel=`incomplete` (no confirmed cut). The mapping defect is independent of pack completeness.

## E4 — Original capture and PDF selection (Team 2 + Team 4)

**reproduced** — HOST_FILESYSTEM + SQLITE_HOST. **NATIVE_DEVICE not claimed.**

Pinned package: `expo-image-picker@17.0.11` (Expo SDK 54, `package.json` `~17.0.11`). Types in `node_modules/expo-image-picker/build/ImagePicker.types.d.ts`:

- `quality?: number` **@default 1.0**. Docs: `0` compresses for size, `1` maximum quality. Android GIF: original GIF only if `quality` is explicitly `1.0` and `allowsEditing` is false.
- `mediaTypes?: MediaType | MediaType[] | MediaTypeOptions` with `MediaType = 'images' | 'videos' | 'livePhotos'` — **no PDF**.
- `fileSize?: number` optional on `ImagePickerAsset`.
- `ImagePickerAsset.uri` is the selected resource; this is URI-only, not retained app-owned bytes.

Executed:

1. **Injected test picker** (`setGrinOriginalPickerForTests`): returned URI-only, `claimedSha256=null`, `byteSize=0`.
2. **`productionPick` path** (`injectedPicker=null`): `pickGrinOriginal` imported `expo-image-picker` (host stand-in). Captured launch options: `quality=0.8`, `mediaTypes=["images"]`, `base64=false`, `allowsEditing=false`. Returned `file:///tmp/grin-t5-e4-library.jpg`, `claimedSha256=null`, `byteSize=0` (asset had no `fileSize`). Camera path same quality/mediaTypes. Denied camera permission threw `permission`.
3. Production **`attachOriginal`** of that pick: sqlite `byte_size=0`, `claimed_sha256=null`.

`ALLOWED_ORIGINAL_MIME` includes `application/pdf`, but launch options never mention PDF. Host `file://` URI is not an app-owned durable copy. `quality: 0.8` is below the pinned default `1.0` and is not byte-identity with the OS source.

## E5 — Pack coverage reachable and precise (Team 2 + Team 4)

**reproduced** — SQLITE_HOST

`WAVE1_ORIGINAL_CATEGORIES` = `invoice,ewb,lr_bilty,weighment,vehicle,unloading,qc,acknowledgement`.

Omitted: `stock_accounting`, `payment`, `gst`, `return_document`. None pass `isWave1OriginalCategory`.

Executed production **`GrinApplicationRepository.attachOriginal`** for each omitted category → `invalid_evidence_category`. Invoice attach succeeded.

`GrinAttachmentsAdmittedBody` builds `categoryOptions` from `WAVE1_ORIGINAL_CATEGORIES` only.

Executed **`assembleEvidencePackInputs`** with verified originals in those four categories (bypass attach). Pack policy **accepts** them as evidence categories (`return_document` is not reported as unknown). **`originalSupportsItem`**: `stock_accounting` and `payment` satisfy `accounting_payment_evidence`; `gst` satisfies `gst_evidence`.

Executed **`exportPack`** after only a WAVE1 invoice attach through the repository: `completenessLabel=incomplete`, `missingOriginal=true`. The app attach path cannot supply the policy categories.

## Remaining gates

E1 connected JS Storage + unexported-callable emulator round-trip is still required for acceptance and was **not** run here. F1–F4 and W2-01…W2-05 were not re-litigated. Production admission stays default-off.
