# Letterhead repair — continuity & next-build packet

Updated: **2026-10-08** (PR #32 runtime regression corrections)

## Continuity snapshot

| Item | Value |
|---|---|
| Dirty main workspace | `draft/goods-evidence-domain-contract` — **not edited** |
| Reviewed / corrected branch | `fix/letterhead-repair-scan` |
| Prior closeout HEAD | `ff8dd1782225ca5d68a4be9bb1e52cbbfac187a4` (CI 37679423265 / verify 112991830178) |
| Runtime regression tip | **`eccc783f624668b1a8c4382d6cb8f22bee3a449a`** (CI 37693886315 / verify 113040537404) |
| Application freeze (vc24 AAB) | `7c938f8` · EAS `c931da3d-…` · **unchanged** |
| Isolation | Worktree `/Users/shivamsaurav/vyd-worktrees/letterhead-repair` |
| Material Movement / unified GRIN | **Queued** — starts only after Letterhead is merged into `integration/grin-g1-g5-source` (do not merge main to satisfy) |

## Runtime regression corrections (this tip)

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Initial load vs concurrent edits | **Done** | Dirty-editor policy: delayed/retried `get` updates `existing` baseline only; never clears dirty candidate/signature/margins/sender. `load_failed` + screen retry. Prior A→B / A→logout→A kept. |
| 2 | Single-flight save | **Done** | Synchronous owner/attempt-bound flight before first await; old finally cannot unlock newer owner. |
| 3 | Upload evidence labelling | **Done** | `EMULATOR_MULTIPART_ADAPTER` labelled; production request-construction test for media endpoint/query/BINARY_CONTENT/Content-Type/Bearer presence (no credential print). Native Expo binary-media still device-pending. |
| 4 | Prior accepted work | **Preserved** | Ownership, MIME, cleanup, contain-geometry, fresh-PDF. |

## Prior final corrections (retained)

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Retired editor state | **Done** | uid+generation-bound runtime; clear retired-owner fields. |
| 2 | Tall-image contain | **Done** | `min(frameW/imgW, frameH/imgH)`; 400×800 → 148.5×297. |
| 3 | Joined evidence | **Done** | Rules SDK + media-REST emulator + fresh PDF gate. |

## Prior closeout items (retained)

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Ownership through save | **Done** | uid+generation on repo/upload; recheck after awaits; stale UI/nav suppressed. |
| 2 | File cleanup + format admission | **Done** | staging/final tracked; JPEG/PNG/WebP magic; picker MIME never admits. |
| 3 | Preview / print geometry | **Done** | right = row-reverse + flex-start; production `composeLetterheadHtml`. Gallery appearance editing remains **incomplete**. |
| 4 | Upload boundary execution | **Done** | injected-port exec; Storage emulator; no production URL under emulator host. |

## Finding status (retained)

| # | Finding | Status | Evidence boundary |
|---|---|---|---|
| 1 | Upload / Expo File / Blob | **Fixed** | media REST + `uploadAsync` BINARY_CONTENT; size via getMetadata. Owner gallery-time error remains **reported; exact device stack not captured**. |
| 2 | Restore generated on Edit | **Fixed** | |
| 3 | Preview ↔ PDF consistency | **Fixed** | |
| 4 | Session ownership | **Fixed** | through save/upload |
| 5 | File lifecycle / size limits | **Fixed** | |
| 6 | Writing-area UX | **Fixed** | |
| Gallery appearance editing | **Incomplete** | Do not call complete |
| Logo replace in generate | **Partial** | |
| Historical PDF snapshot | **Pre-existing** | live-template on regenerate |

## Native dependency change

**None.** Upload uses existing `expo-file-system/legacy` `uploadAsync` + Firebase Auth ID token.

## Tests

- `npm run test:letterhead-repair` — node contract/runtime/geometry + PDF HTML/fresh-PDF inspection
- `npm run test:letterhead-storage-emulator` — Rules SDK (`uploadBytes`) labelled; in `ci:verify`
- `npm run test:letterhead-media-rest-emulator` — production upload core + media-REST host adapter; in `ci:verify`

Device-pending (not replaced by host tests): native Expo upload, scanner, Print acceptance.

PDF fixtures: `docs/release/packets/letterhead/pdf-fixtures/` (HTML + optional committed PDF). Freshness gate writes under `pdf-fresh-*` and fails if Chromium/Chrome cannot freshly render required PDFs.

## Next-build packet (when separately authorized)

> OWNER APPROVAL — EAS Android profile `internal-grin` from letterhead-repair tip SHA only (after this closeout CI). Includes `@infinitered/react-native-mlkit-document-scanner@5.0.0`. Select a **new** versionCode after checking Play inventory — do **not** reuse vc24. No auto-submit; no Play upload from this packet alone.

Device checks after that build: gallery→preview→save; size below/above 256KiB; Android scan; TalkBack; Print PDF pages.
