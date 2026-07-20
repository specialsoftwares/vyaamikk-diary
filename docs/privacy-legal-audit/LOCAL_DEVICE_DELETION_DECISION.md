# LOCAL DEVICE DELETION DECISION RECORD

**Date:** 2026-07-21 · **Tip before change:** `f1019b6`  
**Status:** Engineering default implemented — owner/counsel may revise.

## Problem

Cloud Functions cannot remotely erase SQLite, AsyncStorage, SecureStore, or cached files on a device that is offline, uninstalled, or never relaunched.

## Options considered

| Option | Pros | Cons |
|--------|------|------|
| A. Immediate local purge on deletion request | Maximises local erase | Destroys unsynced drafts during 15-day grace; hurts reactivation UX |
| B. Purge after grace on next authoritative detection | Preserves grace/reactivation; cleans up when deleted is known | Residual local data during grace and if device never opens again |
| C. Encrypt local data + destroy key on finalisation | Strong erase semantics | Large redesign; not in scope |
| D. User-directed wipe only | Explicit consent | Easy to leave orphan data forever |

## Decision (implemented)

**Option B** with these rules:

1. Deletion **request** signs the user out and clears the SecureStore session; **does not** wipe SQLite during grace (`requestAccountDeletion` → `localPurged: false`).
2. While `pending_deletion`, local business data is **retained** for reactivation.
3. When session revalidation sees `deleted` or a missing/blocked-deleted account, the app **purges user-scoped** local data for that uid only (`applyLocalDeletionPolicy`).
4. Policies must continue to disclose device residual risk if the app is never opened after finalisation.

## Non-goals

- Remote wipe push messages
- Cross-user local deletes
- Claiming cloud deletion erases the phone automatically
