# Team 3 — F1 session authority (in-memory token vs sqlite)

Label: **SQLITE_HOST**. Not NATIVE_DEVICE.

Team 4 must not call `beginOwnerSession` / `endOwnerSession` inside a React render. Those methods write sqlite. An effect that persists after paint leaves a window where A's captured callback talks to B.

## Split API (`src/services/grin/outbox/sessionAuthority.ts` + `GrinOutbox`)

| Method | When | Writes sqlite? |
|---|---|---|
| `claimOwnerSession(ownerUid)` / `advanceLiveToken(ownerUid)` | Admitted owner changes (A→B or login) | **No**. Sets the process-local live token immediately. `generation = max(persisted, memory)+1`. |
| `persistBeginOwnerSession(session)` | After claim, outside render | Yes. `session_active=1` at that generation. No-ops if the in-memory token has already moved. |
| `persistEndOwnerSession(session)` | Logout / A retired, outside render | Yes. Deactivates that owner in sqlite and bumps generation. If the live token still matches this session, it is inactivated in memory first. |
| `beginOwnerSession` / `endOwnerSession` | Tests and non-render lifecycle | Claim+persistBegin / persistEnd (or sqlite-only end when this owner is not the live token). |
| `isSessionCurrent(session)` | Before every dispatch and after every await | **In-memory first.** If a live token exists, sqlite is ignored. After process restart the token is null and sqlite is the fallback. |

Making B current (`claimOwnerSession(B)`) makes `isSessionCurrent(A)` false **immediately**, even if `persistEndOwnerSession(A)` has not run. A→logout→A mints a new generation; the previous generation's worker cannot complete (`session_retired`).

## Team 4 usage

1. On admitted-owner change: `claimOwnerSession(nextUid)` (or `advanceLiveToken`) synchronously, then bind `{ ownerUid, dispatchGeneration }` into screens.
2. Defer `persistEndOwnerSession(previous)` and `persistBeginOwnerSession(next)` outside render.
3. Keep checking `outbox.isSessionCurrent(origin)` plus the in-memory binding (`isBindingLive`).

Do not recapture live authority with `requireLiveGrinApplicationRepository` from a stale callback.

## Unresolved (do not invent)

- GRIN pricing / ordinary-record quota
- Retention/deletion of GRIN after `pending_deletion` / `retireIdentity`
- Production admission / Functions export / live Rules
