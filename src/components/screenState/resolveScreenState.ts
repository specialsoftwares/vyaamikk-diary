/**
 * Pure decisions for recoverable screen states.
 * No React, no network, and no invented records.
 */

export const SCREEN_SLOW_MS = 8000;

export type ListPhase = "loading" | "error" | "empty" | "ready" | "hidden";

export function listPhase(input: {
  loading: boolean;
  failed: boolean;
  count: number;
  owned: boolean;
}): ListPhase {
  if (!input.owned) return input.loading ? "loading" : "hidden";
  if (input.loading && input.count === 0) return "loading";
  if (input.failed && input.count === 0) return "error";
  if (!input.loading && !input.failed && input.count === 0) return "empty";
  return "ready";
}

/** Empty is only a successful owned read with nothing in it. */
export function showsEmpty(phase: ListPhase): boolean {
  return phase === "empty";
}

export function visibleCachedRows<T>(input: {
  rows: readonly T[];
  cacheOwnerUid: string | null;
  signedInUid: string | null;
}): readonly T[] {
  if (!input.signedInUid || !input.cacheOwnerUid) return [];
  if (input.cacheOwnerUid !== input.signedInUid) return [];
  return input.rows;
}

export function renderOfflineCache<T>(input: {
  offline: boolean;
  rows: readonly T[];
  cacheOwnerUid: string | null;
  signedInUid: string | null;
}): { rows: readonly T[]; savedOnDevice: boolean } {
  const rows = visibleCachedRows(input);
  return {
    rows,
    savedOnDevice:
      input.offline && rows.length > 0 && input.cacheOwnerUid === input.signedInUid,
  };
}

export interface OwnedMemory<T> {
  uid: string | null;
  value: T | null;
  accepted: boolean;
  sawLoadingForUid: boolean;
}

export function emptyOwned<T>(): OwnedMemory<T> {
  return { uid: null, value: null, accepted: false, sawLoadingForUid: false };
}

/**
 * Accept rows only after this signed-in uid has been seen loading, then ready.
 * A snapshot from another uid is dropped, including a stale frame that still
 * holds the previous account's rows while loading has not started.
 */
export function nextOwnedSnapshot<T>(
  prev: OwnedMemory<T>,
  input: {
    signedInUid: string | null;
    loading: boolean;
    failed: boolean;
    value: T;
  }
): OwnedMemory<T> {
  const uid = input.signedInUid;
  if (!uid) return emptyOwned();
  const switched = prev.uid !== uid;
  if (switched && !input.loading) {
    return { uid, value: null, accepted: false, sawLoadingForUid: false };
  }
  const sawLoading = switched ? input.loading : prev.sawLoadingForUid || input.loading;
  if (input.loading) {
    return {
      uid,
      value: !switched && prev.accepted ? prev.value : null,
      accepted: !switched && prev.accepted,
      sawLoadingForUid: true,
    };
  }
  if (!sawLoading) {
    return { uid, value: null, accepted: false, sawLoadingForUid: false };
  }
  if (input.failed) {
    return {
      uid,
      value: !switched && prev.accepted ? prev.value : null,
      accepted: !switched && prev.accepted,
      sawLoadingForUid: true,
    };
  }
  return { uid, value: input.value, accepted: true, sawLoadingForUid: true };
}

export type SearchPresentation =
  | "loading"
  | "failure"
  | "no_match"
  | "empty_library"
  | "results"
  | "idle";

export function resolveSearchPresentation(input: {
  query: string;
  queryActive: boolean;
  matchCount: number;
  libraryCount: number;
  loading: boolean;
  failed: boolean;
}): SearchPresentation {
  if (input.loading) return "loading";
  if (input.failed) return "failure";
  if (input.queryActive && input.matchCount === 0) return "no_match";
  if (!input.queryActive && input.query.trim().length === 0 && input.libraryCount === 0) {
    return "empty_library";
  }
  if (input.queryActive && input.matchCount > 0) return "results";
  return "idle";
}

/** Stop a write when the account is signed out or the existing sync lock says the session ended. */
export function sessionBlocksWrite(input: {
  signedIn: boolean;
  syncStatus: string | null;
}): boolean {
  if (!input.signedIn) return true;
  return input.syncStatus === "session_expired";
}
