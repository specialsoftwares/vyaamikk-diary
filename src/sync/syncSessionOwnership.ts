/**
 * Process-wide sync session identity: UID + generation.
 *
 * A new login session — including a new session for the same UID after
 * logout — must mint a new generation so delayed work from the previous
 * session cannot lock the gate, dispatch further writes, or publish UI.
 */

export type SyncSessionToken = {
  uid: string;
  generation: number;
};

let generationSeq = 0;
let current: SyncSessionToken | null = null;

export const syncSessionOwnership = {
  current(): SyncSessionToken | null {
    return current;
  },

  capture(): SyncSessionToken | null {
    return current ? { uid: current.uid, generation: current.generation } : null;
  },

  beginSession(uid: string): SyncSessionToken {
    generationSeq += 1;
    current = { uid, generation: generationSeq };
    return { uid: current.uid, generation: current.generation };
  },

  endSession(): void {
    generationSeq += 1;
    current = null;
  },

  isCurrent(token: SyncSessionToken | null | undefined): boolean {
    return (
      !!token &&
      !!current &&
      token.uid === current.uid &&
      token.generation === current.generation
    );
  },

  /**
   * Production ownership: only the live UID+generation may lock, publish, or
   * dispatch further remote work. A missing live session does not authorize
   * a retired operation.
   */
  isActiveOwner(token: SyncSessionToken | null | undefined): boolean {
    return this.isCurrent(token);
  },

  resetForTests(): void {
    generationSeq = 0;
    current = null;
  },
};

/** Capture at operation entry, before the first await. */
export function captureAdmissionToken(): SyncSessionToken | null {
  return syncSessionOwnership.capture();
}

/**
 * Whether this admission token may issue (further) remote work for `userId`.
 * Token UID must match the operation UID and the live generation.
 */
export function mayIssueRemoteWork(
  token: SyncSessionToken | null | undefined,
  userId: string
): boolean {
  if (!token) return false;
  if (token.uid !== userId) return false;
  return syncSessionOwnership.isCurrent(token);
}

export function sessionFlushKey(userId: string, token: SyncSessionToken | null): string {
  if (!token) return `${userId}#0`;
  return `${token.uid}#${token.generation}`;
}
