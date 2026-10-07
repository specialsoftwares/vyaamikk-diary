# E4 / E5 — Team 4 consumption (Team 2)

Do not edit Team 4 screens from this team. Live Rules and Functions exports stay unchanged.

## Shared upload categories (E5)

`WAVE1_ORIGINAL_CATEGORIES` === `UPLOAD_ORIGINAL_CATEGORIES`:

`invoice`, `ewb`, `lr_bilty`, `weighment`, `vehicle`, `unloading`, `qc`, `acknowledgement`, `stock_accounting`, `payment`, `gst`, `return_document`

`isWave1OriginalCategory` / `isUploadOriginalCategory` / `isEvidenceCategory` are the same set. Missing or unknown still fails; never coerce to `invoice`.

Picking those constants (already imported by `GrinAttachmentsAdmittedBody`) is enough for the declared picker set. Do not invent live GSTR-2B.

## Hashing retained files (E4)

Import from `src/goodsEvidence/evidence.ts` (also re-exported from `src/goodsEvidence/index.ts`):

- `hashBoundedChunks`
- `splitIntoHashChunks`
- `HASH_CHUNK_BYTES` (64 KiB)
- `isSha256Hex`
- `ChunkHasher` (inject a platform hasher; do not load the whole file as base64)

Team 2 does not stream Expo picker URIs. Copy into an app-owned file first, then hash chunks.

## Capture provenance (E4)

File-level type `OriginalCaptureProvenance`: `camera_capture` | `imported_original` | `os_conversion` | `derivative`.

This is **not** receipt `CaptureProvenance` (`online` | `offline` | `late_entry`). Do not hardcode `osConversionOccurred: false` without evidence from pinned `expo-image-picker` ~17.0.11.

## Pack payload vs coverage (E5)

`assembleEvidencePackInputs` returns `packPayloadKind: "manifest_and_hashes"` and `originalBytesBundled: false`. Coverage can be complete while original **bytes** are not bundled. `exportPack` must not claim bundled originals unless Team 4 retrieves and includes them. ITC stays `not_determined`. Invoice reference is not an invoice original.
