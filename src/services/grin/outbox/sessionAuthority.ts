/**
 * In-memory live session token, separate from sqlite begin/end.
 *
 * Team 4 flips uid+generation synchronously (claimOwnerSession) without
 * calling beginOwnerSession inside a React render, and without an effect
 * window where A's callback talks to B. Sqlite persist may be deferred.
 */
import type { GrinDispatchSession } from "./types";

export type LiveSessionToken = {
  ownerUid: string;
  dispatchGeneration: number;
  active: boolean;
};

export function nextDispatchGeneration(persisted: number, memory: number): number {
  const persistedGen = Number.isFinite(persisted) ? persisted : 0;
  const memoryGen = Number.isFinite(memory) ? memory : 0;
  return Math.max(persistedGen, memoryGen) + 1;
}

/**
 * null → caller must fall back to sqlite.
 * boolean → in-memory token already decided current/retired.
 */
export function liveTokenCurrent(
  token: LiveSessionToken | null,
  session: GrinDispatchSession
): boolean | null {
  if (!token) return null;
  return (
    token.active &&
    token.ownerUid === session.ownerUid &&
    token.dispatchGeneration === session.dispatchGeneration
  );
}

export function memoryGenerationForOwner(token: LiveSessionToken | null, ownerUid: string): number {
  if (!token || token.ownerUid !== ownerUid) return 0;
  return token.dispatchGeneration;
}
