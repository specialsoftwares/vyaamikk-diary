# Letterhead repair — continuity & next-build packet

Updated: **2026-10-07** (PR #32 targeted closeout)

## Continuity snapshot

| Item | Value |
|---|---|
| Dirty main workspace | `draft/goods-evidence-domain-contract` — **not edited** |
| Reviewed / corrected branch | `fix/letterhead-repair-scan` |
| Prior reviewed HEAD | `7f8e464a6ebf0054eefb1d9929c8ab86d244cde7` (CI 37657944118 / verify 112920723927) |
| Closeout tip | **`6b9d5760314e4f1703e03ba68b6e183377b5c9aa`** (CI 37670254136 / verify 112959900623) |
| Application freeze (vc24 AAB) | `7c938f8` · EAS `c931da3d-…` · **unchanged** |
| Isolation | Worktree `/Users/shivamsaurav/vyd-worktrees/letterhead-repair` |

## Closeout items (this tip)

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Ownership through save | **Done** | uid+generation on repo/upload; recheck after awaits; stale UI/nav suppressed; clearRetiredEditorState; deferred A→B / A→logout→A tests. Does **not** claim issued remote writes can be cancelled. |
| 2 | File cleanup + format admission | **Done** | staging/final tracked; JPEG/PNG/WebP magic (RIFF≠WebP); picker MIME never admits; prior template preserved on ownership failure. |
| 3 | Preview / print geometry | **Done** | right = row-reverse + flex-start; `ImportedLetterheadImage` top-centred contain; production `composeLetterheadHtml` → HTML + Chromium/Chrome PDFs. Gallery appearance editing remains **incomplete**. |
| 4 | Upload boundary execution | **Done** | injected-port exec tests; Storage emulator owner allow / anon+cross-owner deny; no production URL under emulator host; attachments share helper. |

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

- `npm run test:letterhead-repair` — 53 node tests + PDF HTML/PDF inspection
- `npm run test:letterhead-storage-emulator` — Rules unit tests (also in `ci:verify`)

Device-pending (not replaced by host tests): native upload, scanner, Print acceptance.

PDF fixtures: `docs/release/packets/letterhead/pdf-fixtures/` (HTML + PDF; device Print still pending).

## Next-build packet (when separately authorized)

> OWNER APPROVAL — EAS Android profile `internal-grin` from letterhead-repair tip SHA only (after this closeout CI). Includes `@infinitered/react-native-mlkit-document-scanner@5.0.0`. Select a **new** versionCode after checking Play inventory — do **not** reuse vc24. No auto-submit; no Play upload from this packet alone.

Device checks after that build: gallery→preview→save; size below/above 256KiB; Android scan; TalkBack; Print PDF pages.
