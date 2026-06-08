# Offline-first architecture (Vyaamikk Diary)

## Boot order (actual)

1. Native splash (`preventAutoHideAsync` in `app/_layout.tsx`).
2. **SQLite** init (`LocalDbProvider` / `src/localDb/init.ts`). Failure → blocking error screen.
3. Theme (`vyd_theme_mode_v1`) and language (`vyd_lang_v1`) from AsyncStorage in parallel.
4. **Session** from SecureStore after DB ready — no cloud auth validation on cold start.
5. **Intro** (`VyaamikkIntroSplash`) once per install (`hasSeenIntroSplash` in AsyncStorage).
6. **Routing** (`resolveBootDestination` in `src/boot/resolveBootRoute.ts`):
   - login / UEID / complete-profile as needed
   - unfinished **composer** draft → `BootDraftContinuationSheet` (user chooses continue, dashboard, or delete)
   - else → You dashboard
7. **Sync** (`SyncProvider`) runs pull/flush only after `markBootNavigationSettled()` (`src/boot/bootGate.ts`).

## Draft resume scope

| Form | Boot continuation | Autosave store |
|------|-------------------|----------------|
| Composer (+ New Record types) | Yes — premium sheet | SQLite `form_drafts` |
| Letterhead | Deferred | Legacy / partial |
| Professional pack | Deferred | AsyncStorage drafts |
| Identity | Deferred | In-memory / profile draft utils |

## Layers (screens must use these — not raw storage)

| Layer | Path |
|-------|------|
| Local DB init | `src/localDb/init.ts` |
| Boot routing | `src/boot/resolveBootRoute.ts`, `app/index.tsx` |
| Draft continuation UI | `src/boot/BootDraftContinuationSheet.tsx` |
| Form drafts | `src/repositories/formDraftsRepository.ts` |
| Entry cache / pending | `src/repositories/localEntriesRepository.ts` |
| Sync queue | `src/repositories/syncQueueRepository.ts` |
| Sync engine | `src/sync/syncEngine.ts` |
| Session sync lock | `src/sync/sessionSyncGate.ts` |
| Local-first save | `src/services/diary/localFirst.ts` |
| Autosave hook | `src/hooks/useFormAutosave.ts` |
| UI status | `src/components/sync/SyncStatusBanner.tsx` |

## Autosave (implemented)

- **Composer** (`app/(app)/composer/[type].tsx`): debounced SQLite drafts + active route restore.

## Background sync

- **Expo Go**: sync on app foreground + network reconnect, after boot navigation settled.
- **Production / dev client**: can add `expo-task-manager` later.

## Session expiry

- Auth errors during sync → `sessionSyncGate.lock('session_expired')`.
- User keeps typing; banner offers re-auth.
- Hard logout only via Settings → Logout.

## Conflict handling (V1)

- `detectEntryConflict()` — local edits not silently overwritten.

## Manual test matrix

See HANDOVER.md boot section and product acceptance criteria; test airplane mode + draft sheet + dashboard choice.
