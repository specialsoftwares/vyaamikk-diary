# F3 evidence path — Team 2

Not a live callable. GRIN stays default-off. Live `storage.rules` / `firestore.rules` unchanged. `functions/src/index.ts` unchanged.

## What Team 2 added

- Upload hashes **stored** bytes at generation, verifies, and links. Durable `GrinEvidencePortResult` includes `ownerUid`, `mime`, `sizeBytes`, `storagePath`, `generation` (never the literal `"verified"`), `actualSha256` of stored bytes, `reservationId`. Echoed `claimedSha256` is never copied into `actualSha256`. Use `durableUploadIdentityError` (Team 3 `originalIdentityMatches` should not treat claim as actual).
- `UPLOAD_ORIGINAL_CATEGORIES` / `WAVE1_ORIGINAL_CATEGORIES` include `stock_accounting`, `payment`, `gst`, `return_document`. Missing/invalid still fails (never invoice). Policy v2 is unchanged.
- Extra methods on `createInjectedGrinEvidencePort`: `retrieveRetainedOriginal`, `listRetainedOriginals`, `linkVerified`. These hash stored bytes; they do not return a pre-injected success.
- Pack inputs distinguish **coverage** (`packPayloadKind: "manifest_and_hashes"`) from **bundled artifacts** (`originalBytesBundled: false`).
- `GoodsEvidenceStorageAdapter.retrieveOriginal` / `listReceiptEvidenceIds` read retained originals (`uploaded_unverified` / `verified` / `linked`) when `newCommands=deny`. Verify/link/reserve still require `newCommands=allow`. Overwrite/delete stay denied.
- Extra methods on `createInjectedGrinEvidencePort` (base `GrinEvidenceUploadPort.upload` unchanged): `retrieveRetainedOriginal`, `listRetainedOriginals`, `linkVerified`.
- `src/goodsEvidence/evidencePackInputs.ts` produces `verifiedOriginals` / `evidenceLinks` / `artifactHashes` for Team 4 `assembleManifest`. Completeness is not forced.

## Team 3 — do not edit outbox from this team

Optional additive methods on `GrinEvidenceUploadPort` (outbox already has `upload` + identity fields):

```
retrieveRetainedOriginal?(input: { uid, ledgerId, receiptId, evidenceId }): Promise<…>
listRetainedOriginals?(input: { uid, ledgerId, receiptId }): Promise<…>
linkVerified?(input: { uid, verified: VerifiedEvidenceResult }): Promise<GrinEvidenceUploadResult>
```

Until those land, Team 3/4 can call the extra methods on `GrinEvidencePort` from `tools/goods-evidence-storage/evidencePort.ts`.

**Local original retain/release:** Team 3 owns this. Do **not** delete or release the local original because a thumbnail/preview/OCR derivative succeeded. `originalDurable` is true only after the **original** is verified and linked. Derivative `role: "thumbnail" | "metadata"` returns `originalDurable: false`.

Do not add a full-file base64 upload path. SQLITE_HOST Node `readFile` on the injected port is not a native memory-safety claim. STORAGE_EMULATOR hashing uses chunked `open()`.

## Team 4 — screen / exportPack API (do not rewrite screens here)

`exportPack()` should stop hardcoding empty cuts and `missingOriginal: true`. Suggested production call:

```
const packInputs = assembleEvidencePackInputs({
  ownerUid, ledgerId, purchaseCaseId,
  confirmedCuts: [{ receiptId, events: confirmed.events, originalSnapshot: confirmed.original,
                    eventVersion: confirmed.eventVersion, headHash: confirmed.headHash }],
  originals: retainedFromG2, // retrieveRetainedOriginal / listRetainedOriginals
  notApplicable: operatorOrPolicyNa, // do not invent NA to pass
});
const manifest = assembleManifest({ exportId, ownerUid, ledgerId, purchaseCaseId, ...packInputs, templateVersion });
missingOriginal: packInputs.verifiedOriginals.length === 0
completenessLabel from mayMarkComplete(manifest) — never force complete
itcDisposition remains not_determined
```

Import `assembleEvidencePackInputs` from `src/goodsEvidence/evidencePackInputs.ts` (coordinator may export it from `index.ts`). Capture/select and Wave1 category remain Team 4; origin bind is F1.

Invoice reference on the snapshot is not an invoice original. Challan is not an invoice.

## Tests

- INJECTED: `tools/goods-evidence-storage/injected.unit.test.ts`, `pack.injected.test.ts`
- PURE_DOMAIN: `domain.unit.test.ts`
- STORAGE_EMULATOR: `storage.emulator.test.ts`, `rules.emulator.test.ts` (Firestore 8091, Storage 9200)

Coordinator: add `pack.injected.test.ts` to `test:goods-evidence-g2-unit` (see `scripts.md`).
