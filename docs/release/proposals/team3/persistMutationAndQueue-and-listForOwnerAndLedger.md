# Team 3 proposal — persistMutationAndQueue and listForOwnerAndLedger

Team 4 owns `src/services/grin/repository/**`. This is a proposal only. Do not edit `src/services/grin/outbox/outbox.ts` from Team 4.

Combined HEAD inspected: `6b2690315ae746013a02a982f4c76a75d9ac3915`.

## Current surface

`GrinOutbox` has `persistDraftAndQueue` and `listForOwner`. `persistDraftAndQueue` is the register/draft path. Using it for `amendFields` / `recordQc` / `dispatchReturn` / `recordEwbObservation` against an existing receipt would rewrite `payload_json` and can `markConflicted` or throw `illegal_outbox_transition:issued->queued`.

`listForOwner` is owner-wide. Two ledgers with the same `receiptId` must stay distinct.

## Needed APIs

```ts
persistMutationAndQueue(session: GrinDispatchSession, input: {
  ledgerId: string;
  receiptId: string;
  commandType: Exclude<GrinCommandType, "registerGoodsReceipt">;
  body: unknown;
  commandId?: string;
}): GrinLocalReceiptView
```

Must:

- Call `assertSessionOwner` / `isSessionCurrent`. Stale sessions throw `session_retired` and write nothing.
- Insert a new `grin_outbox_commands` row. Do not replace the register receipt `payload_json`, `command_id`, or digest.
- Not invent `issuedNumber`.
- Not dispatch.

```ts
listForOwnerAndLedger(ownerUid: string, ledgerId: string): GrinLocalReceiptView[]
```

Must filter `(owner_uid, ledger_id)`. Team 4 currently filters `listForOwner` in the repository when this method is absent.

## Team 4 interim

`GrinApplicationRepository` duck-types both methods. If `persistMutationAndQueue` is missing, mutations throw `persist_mutation_and_queue_uninjected` and do not call `persistDraftAndQueue`. Screens show `grin.mutationUnavailable`.

## Not proposed

- Enabling GRIN, EAS, Play, flags, `versionCode`, live Rules
- Claiming `NATIVE_DEVICE`
