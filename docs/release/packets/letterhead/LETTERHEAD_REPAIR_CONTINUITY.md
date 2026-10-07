# Letterhead repair — continuity & next-build packet

Updated: **2026-10-07**

## Continuity snapshot (before this work)

| Item | Value |
|---|---|
| Dirty main workspace | `draft/goods-evidence-domain-contract` @ `55f2df1` — **not edited** |
| GRIN integration tip | `integration/grin-g1-g5-source` @ `1f302b9` (docs tip after B2) |
| Application freeze (vc24 AAB) | `7c938f836891411752e6fa6af8879ddfe275ab60` |
| Latest EAS (finished) | `c931da3d-4dcb-472e-9c63-f72217c6d95c` · profile `internal-grin` · **vc24** · source `7c938f8` |
| Prior Internal (vc23) | EAS `8c789fa9-…` · source `540e07a` |
| Isolation branch / worktree | `fix/letterhead-repair-scan` · `/Users/shivamsaurav/vyd-worktrees/letterhead-repair` |
| Base | Branched from `1f302b9` (integration tip); **not** substituted into frozen vc24 AAB |

Expo SDK **54** / RN **0.81.5**. AGENTS.md points at Expo v56 docs — project runtime remains SDK 54; native changes follow installed SDK.

## Root cause (inspected code hazard)

Owner device message: `Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported`.

**Proven in source (matches Firebase JS SDK issue #8648 on RN ≥ 0.74):**

1. `uploadLetterheadImage` → `uploadString(..., "base64")`.
2. Firebase Storage multipart upload builds `new Blob([string, Uint8Array, string])`.
3. React Native `BlobManager` rejects ArrayBufferView parts with that exact string.

This fires on **save / Storage migration upload**, not on ImagePicker’s native base64 encode. Owner reported the error immediately after gallery selection without intentionally pressing Save — possible concurrent background migration (`runLetterheadStorageMigrationForUser`) or an accidental save gesture. **Device stack not captured this session**; treated as inspected code hazard + injected contracts, not PLAY_INSTALLED reproduction.

Secondary hazards fixed in the same pass:

- Template pick used `base64: true` and kept full-resolution data URIs in React state.
- Preview/`PDF` used `object-fit` / `resizeMode` stretch for imported pages.

## What this source changes

1. **Storage upload** — Expo `File` + `uploadBytesResumable` (no `uploadString`).
2. **File-based template candidate** — copy to app-private cache; preview via `file://`; upload from file.
3. **Entry UX** — “Your letterhead” + scan/upload vs create-with-logo.
4. **Generated layout model** — logo left/centre/right; snapshotted profile fields; PDF HTML header (text stays text).
5. **Android scanner boundary** — `@infinitered/react-native-mlkit-document-scanner@5.0.0` behind `documentScanner/` (JPEG, pageLimit 1, gallery import, `BASE_WITH_FILTER`). iOS returns explicit `unavailable` (no claimed support).

## Historical letter ↔ template semantics (isolated, unchanged)

Saved letters store `templateRefUpdatedAt` and input fields, **not** a copy of
template image/layout bytes. Re-exporting an old letter uses the **current**
`LetterheadConfig`. Already-shared PDF files on disk are unaffected; in-app
regenerate can diverge after a template edit. True per-letter snapshots are
out of scope for this repair (documented only).

## Explicitly not done / not authorized

- New paid EAS build, Play upload, Functions/Rules, billing, purge, main merge, public release.
- Device camera/scanner/TalkBack matrix (needs matching native build).
- iOS VisionKit scanner implementation.
- App-side appearance filters for gallery imports (scanner `BASE_WITH_FILTER` covers scan path; generated path has appearance).

## Next-build packet (when separately authorized)

Exact one-line request:

> OWNER APPROVAL — EAS Android `internal-grin` (or named profile) from letterhead-repair SHA `<fill after commit>`: native module `@infinitered/react-native-mlkit-document-scanner@5.0.0`; no auto-submit; no Play upload.

Device checks after that build: gallery pick → preview → save; Android scan cancel/success; Play upgrade over installed data; TalkBack on entry choices; PDF inspect for imported + generated.

## Focused tests run (this worktree)

```
npx tsx --test \
  src/services/storage/userStorage.uploadPath.contract.test.ts \
  src/services/letterhead/letterheadCandidateImage.test.ts \
  src/services/letterhead/letterheadSetupPick.contract.test.ts \
  src/services/letterhead/documentScanner/documentScanner.contract.test.ts \
  src/services/letterhead/letterheadGeneratedLayout.test.ts
```

Result: **14/14 pass** (source/injected). Not evidence of native scanning on device.
