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
   * When no session has been begun (legacy tests / early boot), treat the
   * caller as the owner so existing auth-lock behaviour is unchanged.
   * Once a session exists, only that generation may mutate the gate / UI.
   */
  isActiveOwner(token: SyncSessionToken | null | undefined): boolean {
    if (!current) return true;
    return this.isCurrent(token);
  },

  resetForTests(): void {
    generationSeq = 0;
    current = null;
  },
};

export function sessionFlushKey(userId: string, token: SyncSessionToken | null): string {
  if (!token) return `${userId}#0`;
  return `${token.uid}#${token.generation}`;
}
