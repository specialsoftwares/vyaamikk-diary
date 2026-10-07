# Letterhead repair — continuity & next-build packet

Updated: **2026-10-07** (PR #32 targeted corrections)

## Continuity snapshot

| Item | Value |
|---|---|
| Dirty main workspace | `draft/goods-evidence-domain-contract` — **not edited** |
| Reviewed / corrected branch | `fix/letterhead-repair-scan` |
| Frozen next-build SHA | **`b7fa4da7f1559b318d622946cb6beaa97a049605`** (this tip after CI) |
| Prior reviewed HEAD | `f59598629347383ac47f78da095122fd7db125ee` |
| Application freeze (vc24 AAB) | `7c938f8` · EAS `c931da3d-…` · **unchanged** |
| Isolation | Worktree `/Users/shivamsaurav/vyd-worktrees/letterhead-repair` |

## Finding status

| # | Finding | Status | Evidence boundary |
|---|---|---|---|
| 1 | Upload / Expo File / Blob | **Fixed** | Locked SDKs prove Expo File ≠ `instanceof Blob`; `File.slice` builds ArrayBufferView Blob; multipart ≤256KiB uses `FbsBlob.getBlob`. Upload now: Expo `uploadAsync` BINARY_CONTENT → Storage media REST + auth Bearer; size verified via `getMetadata`. Owner gallery-time error remains **reported gallery-time error; exact device stack not captured** — not attributed to Save. |
| 2 | Restore generated on Edit | **Fixed** | `generate.tsx` loads saved layout; profile only for new / explicit refresh. Durable logo = data:/https only. |
| 3 | Preview ↔ PDF consistency | **Fixed** | `letterheadVisualSpec`; right = row-reverse; imported contain + top center; mono = `grayscale(1) contrast(3)`. RN preview notes grayscale/mono as PDF-applied. |
| 4 | Session ownership | **Fixed** | `beginLetterheadCapture` / `assertCandidateOwner` use `SyncSessionToken`; fileGeneration is path-only. |
| 5 | File lifecycle / size limits | **Fixed** | candidateRef unmount cleanup; long-edge reject; MIME sniff; Image.getSize; asset size before base64. |
| 6 | Writing-area UX | **Fixed** | Validator on both paths + repo save; visual steppers + overlay. |
| Gallery appearance editing | **Incomplete** | Documented in UI (`incompleteGalleryAppearance`); scanner filters cover scan path. No native image-manipulator added. |
| Logo replace in generate | **Partial** | Retry logo from profile; no separate gallery logo pick yet. |
| Historical PDF snapshot | **Pre-existing** | Still live-template on regenerate; not claimed fixed. |

## Native dependency change

**None.** Upload uses existing `expo-file-system/legacy` `uploadAsync` + Firebase Auth ID token. No `@react-native-firebase/storage`, no `expo-blob` global patch.

Affected shared callers of `userStorage` (attachments / letterhead migration / letterhead save): all now go through media REST path.

## Tests

`npm run test:letterhead-repair` — discovered by `test:all` via package.json.

PDF fixtures: `docs/release/packets/letterhead/pdf-fixtures/` (HTML A4 inspection; not device Print).

## Next-build packet (when separately authorized)

> OWNER APPROVAL — EAS Android profile `internal-grin` from letterhead-repair SHA `b7fa4da7f1559b318d622946cb6beaa97a049605` only. Includes `@infinitered/react-native-mlkit-document-scanner@5.0.0` (already in source). Select a **new** versionCode after checking current Play inventory — do **not** reuse vc24. No auto-submit; no Play upload from this packet alone.

Device checks after that build: gallery→preview→save (Blob error gone); size below/above 256KiB; Android scan; TalkBack; PDF pages.
