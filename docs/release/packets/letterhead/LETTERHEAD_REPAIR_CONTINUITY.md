# Letterhead repair — continuity & next-build packet

Updated: **2026-10-08** (PR #32 final targeted corrections)

## Continuity snapshot

| Item | Value |
|---|---|
| Dirty main workspace | `draft/goods-evidence-domain-contract` — **not edited** |
| Reviewed / corrected branch | `fix/letterhead-repair-scan` |
| Prior closeout HEAD | `6b9d5760314e4f1703e03ba68b6e183377b5c9aa` (CI 37670254136 / verify 112959900623) |
| Final corrections tip | **`ff8dd1782225ca5d68a4be9bb1e52cbbfac187a4`** (CI 37679423265 / verify 112991830178) |
| Application freeze (vc24 AAB) | `7c938f8` · EAS `c931da3d-…` · **unchanged** |
| Isolation | Worktree `/Users/shivamsaurav/vyd-worktrees/letterhead-repair` |

## Final corrections (this tip)

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Retired editor state | **Done** | Production `createLetterheadSetupEditorRuntime` binds editor/completions to uid+generation; clears all retired-owner template/signature/stamp/sender fields; A→B / A→logout→A / B-null-load via runtime + memory repo + mounted setup wiring. Does **not** claim issued remote writes can be cancelled. |
| 2 | Tall-image contain | **Done** | `computeImportedContainLayout` uses `min(frameW/imgW, frameH/imgH)`; 400×800 in 210×297 → 148.5×297; setup + document preview share geometry; tall fixture in PDF render. |
| 3 | Joined evidence | **Done** | Rules SDK labelled; media-REST joined emulator via production upload core + host transport; owner bytes / anon+cross-owner deny; fresh PDF gate under `pdf-fresh-*` (committed `pdf/` does not count); CI installs Chromium. |
| 4 | Prior accepted work | **Preserved** | Session/upload checks, MIME admission, cleanup, production HTML extraction. |

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
