/**
 * Pure decisions for recoverable screen states.
 * No React, no network, and no invented records.
 */

import { currentSessionCommitEpoch } from "@/services/auth/authSessionFence";

export const SCREEN_SLOW_MS = 8000;

export type ListPhase = "loading" | "error" | "empty" | "ready" | "hidden";

export function listPhase(input: {
  loading: boolean;
  failed: boolean;
  count: number;
  /**
   * True when this viewer may see the current request's outcome.
   * False only when signed out, or the snapshot's uid, epoch, and generation
   * are not the current request. A failed first read of the current user is owned.
   */
  owned: boolean;
  /** Signed in, and this request has not settled yet. */
  pending?: boolean;
}): ListPhase {
  if (!input.owned) return "hidden";
  if (input.failed && input.count === 0) return "error";
  if ((input.loading || input.pending) && input.count === 0) return "loading";
  if (input.count === 0) return "empty";
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

/** Identity of one in-flight or settled read. */
export interface RequestClaim {
  uid: string;
  epoch: number;
  generation: number;
}

/** Stamp the live session epoch onto a request. Generation is the caller's counter. */
export function captureLoadClaim(uid: string, generation: number): RequestClaim {
  return { uid, epoch: currentSessionCommitEpoch(), generation };
}

export function requestClaimsMatch(
  live: RequestClaim | null | undefined,
  claim: RequestClaim | null | undefined
): boolean {
  if (!live || !claim) return false;
  return live.uid === claim.uid && live.epoch === claim.epoch && live.generation === claim.generation;
}

/** Same account session. A newer request generation still belongs to this session. */
export function requestSessionsMatch(
  live: { uid: string; epoch: number } | null | undefined,
  claim: { uid: string; epoch: number } | null | undefined
): boolean {
  if (!live || !claim) return false;
  return live.uid === claim.uid && live.epoch === claim.epoch;
}

export interface OwnedMemory<T> {
  uid: string | null;
  epoch: number | null;
  generation: number | null;
  value: T | null;
  /** Rows may be shown. False when the current request has not succeeded. */
  accepted: boolean;
  /**
   * The signed-in request may show its own outcome, including a failed first read.
   * False only when nobody is signed in.
   */
  current: boolean;
  /**
   * Signed in, and this request has not settled. The screen keeps a skeleton
   * instead of a signed-out line or an empty library.
   */
  pending: boolean;
  /**
   * This signed-in request has been seen loading or has already failed.
   * An unclaimed success is accepted only after that.
   */
  armed: boolean;
}

export function emptyOwned<T>(): OwnedMemory<T> {
  return {
    uid: null,
    epoch: null,
    generation: null,
    value: null,
    accepted: false,
    current: false,
    pending: false,
    armed: false,
  };
}

function sameRequestIdentity(
  prev: OwnedMemory<unknown>,
  uid: string,
  epoch: number | null
): boolean {
  if (prev.uid !== uid) return false;
  if (epoch == null || prev.epoch == null) return true;
  return prev.epoch === epoch;
}

/**
 * Accept rows only after this signed-in request has been seen loading, then ready.
 * A first failure stays current so the screen can show an error and retry.
 * A snapshot whose uid or epoch is not the current request is dropped.
 * An older generation is ignored once a newer one is in memory.
 */
export function nextOwnedSnapshot<T>(
  prev: OwnedMemory<T>,
  input: {
    signedInUid: string | null;
    epoch?: number | null;
    generation?: number | null;
    loading: boolean;
    failed: boolean;
    value: T;
    /** Provenance of `value`. A mismatch is never labeled as the current request. */
    valueClaim?: RequestClaim | null;
  }
): OwnedMemory<T> {
  const uid = input.signedInUid;
  if (!uid) return emptyOwned();
  const epoch = input.epoch ?? null;
  const generation = input.generation ?? null;
  const switched = !sameRequestIdentity(prev, uid, epoch);
  if (
    !switched &&
    prev.generation != null &&
    generation != null &&
    generation < prev.generation
  ) {
    return prev;
  }

  const claimMatches =
    input.valueClaim != null &&
    input.valueClaim.uid === uid &&
    (epoch == null || input.valueClaim.epoch === epoch) &&
    (generation == null || input.valueClaim.generation === generation);
  const foreignClaim = input.valueClaim != null && !claimMatches;
  const ownFailure = input.failed && !foreignClaim;
  const armed = !switched && prev.armed;

  if (input.loading) {
    const keep = armed && prev.accepted && !foreignClaim;
    return {
      uid,
      epoch,
      generation,
      value: keep ? prev.value : null,
      accepted: keep,
      current: true,
      pending: !keep,
      armed: true,
    };
  }

  if (ownFailure) {
    const keep = armed && prev.accepted;
    return {
      uid,
      epoch,
      generation,
      value: keep ? prev.value : null,
      accepted: keep,
      current: true,
      pending: false,
      armed: true,
    };
  }

  if (foreignClaim || (!armed && !claimMatches)) {
    return {
      uid,
      epoch,
      generation,
      value: null,
      accepted: false,
      current: true,
      pending: true,
      armed: false,
    };
  }

  return {
    uid,
    epoch,
    generation,
    value: input.value,
    accepted: true,
    current: true,
    pending: false,
    armed: true,
  };
}

export interface OwnedLoad<T> {
  /** Request that currently owns loading and error. */
  claim: RequestClaim | null;
  loading: boolean;
  error: string | null;
  value: T | null;
  /** Provenance of `value` after a successful read. */
  valueClaim: RequestClaim | null;
}

export function emptyOwnedLoad<T>(): OwnedLoad<T> {
  return { claim: null, loading: false, error: null, value: null, valueClaim: null };
}

export function beginOwnedLoad<T>(prev: OwnedLoad<T>, claim: RequestClaim): OwnedLoad<T> {
  const keep = prev.valueClaim != null && requestSessionsMatch(claim, prev.valueClaim);
  return {
    claim,
    loading: true,
    error: null,
    value: keep ? prev.value : null,
    valueClaim: keep ? prev.valueClaim : null,
  };
}

export function commitOwnedSuccess<T>(
  state: OwnedLoad<T>,
  claim: RequestClaim,
  value: T
): OwnedLoad<T> {
  if (!requestClaimsMatch(state.claim, claim)) return state;
  return { claim, loading: false, error: null, value, valueClaim: claim };
}

export function commitOwnedFailure<T>(
  state: OwnedLoad<T>,
  claim: RequestClaim,
  error: string
): OwnedLoad<T> {
  if (!requestClaimsMatch(state.claim, claim)) return state;
  const keep = state.valueClaim != null && requestSessionsMatch(claim, state.valueClaim);
  return {
    claim,
    loading: false,
    error,
    value: keep ? state.value : null,
    valueClaim: keep ? state.valueClaim : null,
  };
}

/**
 * Clears loading for this claim only. A newer claim, including the same uid
 * with a newer epoch or generation, keeps its loading flag.
 */
export function finishOwnedLoad<T>(state: OwnedLoad<T>, claim: RequestClaim): OwnedLoad<T> {
  if (!requestClaimsMatch(state.claim, claim)) return state;
  if (!state.loading) return state;
  return { ...state, loading: false };
}

/**
 * Production read fence. Success, failure, and finally all consult the latest
 * state, so a late account-A response cannot be stored as account B, and the
 * older finally cannot clear the newer request's loading flag.
 */
export async function runOwnedLoad<T>(input: {
  claim: RequestClaim;
  read: () => Promise<T>;
  readState: () => OwnedLoad<T>;
  writeState: (next: OwnedLoad<T>) => void;
  presentError: (error: unknown) => string;
}): Promise<OwnedLoad<T>> {
  let latest = beginOwnedLoad(input.readState(), input.claim);
  input.writeState(latest);
  try {
    const value = await input.read();
    latest = commitOwnedSuccess(input.readState(), input.claim, value);
    input.writeState(latest);
  } catch (error) {
    latest = commitOwnedFailure(input.readState(), input.claim, input.presentError(error));
    input.writeState(latest);
  } finally {
    latest = finishOwnedLoad(input.readState(), input.claim);
    input.writeState(latest);
  }
  return latest;
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
  if (input.failed) return "failure";
  if (input.loading) return "loading";
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
