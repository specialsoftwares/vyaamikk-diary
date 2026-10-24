/** Pure CAS decision used inside the authoritative Firestore transaction. */
export type PurposeState = { revision: number; decision: 'grant' | 'withdraw' | null; receivedAt: number | null };
export function purposeTransition(current: PurposeState, input: {
  decision: 'grant' | 'withdraw'; expectedRevision: number; alreadyReceived: boolean;
}, now: number): { state: PurposeState; apply: boolean; conflict: boolean } {
  if (input.alreadyReceived) return { state: current, apply: false, conflict: false };
  if (input.decision === 'grant' && input.expectedRevision !== current.revision) {
    return { state: current, apply: false, conflict: true };
  }
  return { state: { revision: current.revision + 1, decision: input.decision, receivedAt: now }, apply: true, conflict: false };
}
