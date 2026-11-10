# Screen-state coverage

This matrix is what the UI pass actually wired. It is not a claim that every adapter, hook, or auth screen was audited.

Public errors live in `src/domain/publicErrors.ts` only. `presentPublicError` returns a catalogue sentence for a known code and the generic sentence otherwise. It does not return `Error.message`, a stack, or a `functions/` identifier. `auth/session-expired` stays the one-time-code recovery. Account session recovery uses `session_expired`, `functions/unauthenticated`, `unauthenticated`, `UNAUTHENTICATED`, and `auth/user-token-expired`. No timeout length is stated.

Shared decisions are in `src/components/screenState/`. Empty is only `listPhase` `"empty"`: an owned, finished, successful read with nothing in it. A signed-in request that has not settled stays `pending`, so the screen shows a skeleton. It does not show the signed-out sentence, and it does not treat an unsettled library as empty. Cached rows render only when the cache owner uid matches the signed-in uid. An unclaimed success is accepted only after that request has loaded or failed. Strings are English and Hindi in `screenStateCopy.ts`. Reduced motion uses the existing `AccessibilityInfo` API and turns off the skeleton pulse. No new animation library, route, permission request, progress percent, or lighter-content toggle was added.

| Area | Screen | Empty | Loading | Error | Offline | Slow | Search | Permission | Session | Validation | Success |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Diary history | `app/(app)/diary/index.tsx` | Wired | Wired | Wired | Wired | Wired | Absent | Absent | Absent | Absent | Absent |
| Search | `app/(app)/search.tsx` | Wired | Wired | Wired | Wired | Wired | Wired | Absent | Absent | Absent | Absent |
| Customer credit list | `app/(app)/customer-credit/index.tsx` | Wired | Wired | Wired | Wired | Wired | Absent | Absent | Absent | Absent | Absent |
| Saved records | `app/(app)/(tabs)/saved-records.tsx` | Absent | Wired | Wired | Wired | Wired | Absent | Absent | Absent | Absent | Absent |
| Calendar | `app/(app)/(tabs)/calendar.tsx` | Wired | Wired | Wired | Wired | Wired | Absent | Absent | Absent | Absent | Absent |
| Business insights | `app/(app)/settings/business-insights.tsx` | Absent | Wired | Wired | Wired | Wired | Absent | Absent | Absent | Absent | Absent |
| Drafts | `app/(app)/drafts/index.tsx` | Wired | Wired | Wired | Wired | Wired | Absent | Absent | Absent | Absent | Absent |
| Diary detail | `app/(app)/diary/[id].tsx` | Absent | Wired | Wired | Absent | Absent | Absent | Absent | Wired | Absent | Wired |
| Composer | `app/(app)/composer/[type].tsx` | Absent | Absent | Wired | Absent | Absent | Absent | Absent | Wired | Absent | Wired |
| Customer credit form | `app/(app)/customer-credit/form.tsx` | Absent | Absent | Wired | Absent | Absent | Absent | Wired | Wired | Absent | Absent |
| Purchase order form | `app/(app)/purchase-order/form.tsx` | Absent | Absent | Wired | Absent | Absent | Absent | Absent | Wired | Wired | Absent |
| Dashboard | `app/(app)/(tabs)/you.tsx` | Existing zero stats | Wired | Wired | Wired | Wired | Absent | Absent | Absent | Absent | Absent |
| Professional packs | `app/(app)/professional-pack/history.tsx` | Wired | Wired | Wired | Wired | Wired | Wired | Absent | Absent | Absent | Absent |
| Purchase orders | `app/(app)/purchase-order/index.tsx` | Wired | Wired | Wired | Wired | Wired | Absent | Absent | Absent | Absent | Absent |
| GRIN list and attachments | `src/screens/grin/GrinListScreen.tsx`, `GrinAttachmentsAdmittedBody.tsx` | Empty only after a ready local read | Local list, so no network skeleton | Public error and retry | Absent | Absent | Absent | Camera or library alternative, then recheck | Session-retired copy | Absent | Absent |
| Settings | `app/(app)/(tabs)/settings.tsx` | Absent | Existing settings skeleton | Absent | Absent | Wired | Absent | Absent | Sign-out busy flag is generation-fenced | Absent | Absent |
| Onboarding profile | `src/auth-v2/screens/BusinessIdentityScreen.tsx` | Not wired here | Not wired here | Not wired here | Not wired here | Not wired here | Not wired here | Not wired here | Not wired here | Owned by onboarding | Not wired here |

## What "wired" means on each screen

**Diary history.** Empty only after a successful owned read. The existing new-entry action is used, or the existing clear action when a search or type filter is active. The first read uses a content-shaped skeleton. Refresh keeps the rows. The error panel uses `presentPublicError` and `reload`. The header already has back, so the panel does not add another. Offline uses `useSync().status === "offline"`, keeps same-uid rows, and labels them saved on this device. With no rows it shows the offline sentence and invents nothing. Slow text appears while refresh is running and rows are already visible, after the existing skeleton threshold of 6500ms.

**Search.** No matches (a searchable query with zero hits) is a different panel from an empty recent list (no searchable query). Clear calls the existing `setQuery("")`. Empty-library back calls `router.back()`. Loading is a skeleton only when no same-uid rows are being kept. Failure keeps the query text and retries `reloadIndex`. Offline and slow follow the same rules as the diary list, at 6500ms. The failure sentence is the screen-state copy. The search hook swallows the exception and stores an i18n key, and that hook was not edited, so `presentPublicError` is not inside that catch.

**Customer credit list.** Empty uses the existing new-credit action. Skeleton on the first read. The load catch stores `presentPublicError` and does not clear rows already loaded. Retry calls the existing loader. Offline and slow use the existing refresh flag. Slow waits 8 seconds because this screen did not already use the 6500ms skeleton threshold. Header back already exists.

**Saved records.** Skeleton, error panel, same-uid gate, offline label, and slow text during refresh. A successful load always has hub tiles, including when counts are zero, so that is not an empty library. A signed-out or not-yet-accepted uid shows the signed-out line rather than another account's counts. The party-ledger pane was not changed.

**Calendar.** Empty only after a successful empty day. This screen had no create route, so no action was added. The existing day skeleton stays for the initial empty read. The error panel uses `displayStoredError` against the existing `calendarMaps.loadError` sentence, and retry calls `reload`. The hook's partial sentence "Some records unavailable" is not shown. Offline and slow (6500ms) apply when sections are already on screen.

**Business insights.** Skeleton when there is no dashboard yet. Data already on screen stays during reload, with slow text after 8 seconds. The error panel shows only when there is an error and no data. Offline is labeled when data is present. A successful dashboard of zeros is still the dashboard, so empty is absent. The hook clears its snapshot on failure and already hides another account; the hook was not edited, so a failed reload cannot keep the previous dashboard on the screen.

**Drafts.** Empty after a successful owned empty list. The action is the existing back control. Skeleton, `presentPublicError`, offline label, and slow text during refresh are wired. Drafts are device records, not a server confirmation.

**Diary detail.** Skeleton only while no entry is on screen. Load and action failures use `presentPublicError`. An entry already shown is kept. Delete, GPS removal, sync retry, and refresh-from-dispatch return before the write when the user is signed out or sync status is `session_expired`. The entry is not cleared and no duration is stated. The success line says confirmed by the server only when the sync badge is `synced`. GPS removal sets that badge from `remoteAccepted`. There is no list cache, offline snapshot, or slow threshold on this read.

**Composer.** Load, draft, and submit catches use `presentPublicError`. The existing "nothing to save" sentence, and the existing cash-photo size and owner sentences, stay. Record create and update return before the write when signed out or the sync status is `session_expired`. Form values are not cleared and drafts are not deleted. The success line is confirmed by the server only when `saveResult.cloudAccepted === true`. The draft-saved line is saved on this device. The initial edit read still uses the existing loader. This form was not the validation example.

**Customer credit form.** Camera or library denial from the existing `pickCustomerPhoto` opens the permission state. The purpose is the optional customer photo that stays on the device. Settings, the other existing source, and continue without a photo are offered. No new permission request was added, and the fields stay. Submit returns before the write on a signed-out or expired sync session. Load, save, and unexpected photo failures use `presentPublicError`. The existing too-large and unreadable-photo sentences stay. This save does not report remote acceptance, so there is no confirmed label.

**Purchase order form.** An empty vendor name sets the existing `purchaseOrder.errVendor` on that field and keeps the typed value. The field message clears when the trimmed name is non-empty. Submit returns before the write on a signed-out or expired sync session. Load and save failures use `presentPublicError`. This save does not report remote acceptance.

## Catch paths this pass changed

- `app/(app)/diary/index.tsx` shows the list error through `presentPublicError`. The list hook was not edited.
- `app/(app)/diary/[id].tsx` replaces the previous public-message calls on load, link refresh, GPS removal, delete, and sync retry.
- `app/(app)/customer-credit/index.tsx` load catch.
- `app/(app)/customer-credit/form.tsx` load, photo, and submit catches. Permission denial uses the permission state instead of a raw error.
- `app/(app)/purchase-order/form.tsx` load and submit catches.
- `app/(app)/composer/[type].tsx` load, draft, and submit catches.
- `app/(app)/drafts/index.tsx` load catch.
- `app/(app)/(tabs)/saved-records.tsx` load catch.
- `app/(app)/(tabs)/calendar.tsx` and `app/(app)/settings/business-insights.tsx` pass stored hook strings through `displayStoredError`. Those hooks were not edited.
- `app/(app)/search.tsx` does not receive the thrown value. See the search row above.

## Left on purpose

- No second catalogue. Main's message-text catalogue was not ported.
- No 30-minute session, and no copied product names or prices.
- `app/(auth)/**`, AuthFlowGate, phone auth, age eligibility, complete profile, business identity, telemetry, purpose consent, the crash-report settings row, rules, and GRIN sealing were not edited.
- `src/components/ui/EmptyState.tsx` already had the action props the screens use, so it was not changed.
- Hooks `useDiaryList`, `useGlobalSearch`, `useCalendarMapsData`, and `useBusinessInsightsDashboard` were not edited. Cross-account hiding on insights remains inside that hook.
- Search "no records" counts the recent list the screen already renders. A library that contains only PDF history can look empty until a query, because the existing recent-record helper skips that category.
- No screen already had a lighter path, such as a list without images, so none was added.
- Customer credit and purchase order saves are not labeled confirmed.
- The composer initial read keeps its existing loader rather than a new form-shaped skeleton.
- Calendar empty has no navigation action because the screen had none.
- Saved-records hub tiles and an insights dashboard of zeros are successful reads, not empty libraries.
- Dashboard, professional-pack history, GRIN, settings, and the onboarding profile screen were not wired in this pass. GRIN sealing code was left untouched.
