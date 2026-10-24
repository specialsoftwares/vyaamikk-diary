# Team 1 proposal: `src/goodsEvidence/types.ts` event types

Coordinator-owned. No edit in this Team 1 commit.

`GrinEventType` already includes the mutation events this adapter persists:

- `field_amended`
- `qc_decision`
- `qc_reclassified`
- `return_dispatched`
- `return_received`
- `void_with_reason`
- `ewb_observation_recorded`
- `evidence_verified`

No new event-type strings are required for G4 durable mutations in this slice.

Optional comment-only clarification (not required for compile):

- `firestoreCommitTime` on `GrinEvent` is `string | null`. In G1/G4 emulator
  persistence it is **always `null`**. That null is a placeholder, not an actual
  Firestore commit timestamp. Hashing already excludes the field.
- Attempt acceptance time is `serverAcceptedAtUtc` / `serverRegisteredAtUtc`
  from `clock.nowMs()` on the successful attempt.
