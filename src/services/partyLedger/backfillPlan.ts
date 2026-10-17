/**
 * Written migration plan. Nothing here connects to production or writes live data.
 */

export const PARTY_LEDGER_BACKFILL_PLAN = {
  executed: false,
  serverProjectionEnabled: false,
  compositeIndexes: [] as const,
  oldClients:
    "Older installed clients keep writing diary entries. They do not read or write partyLedgerProjections, partyLedgerBuckets, or partyLedgerCheckpoints.",
  baseline:
    "When a reviewed deploy turns projection on, import each accepted historical record once as a labelled baseline. Do not invent edit history for past saves.",
  rollback:
    "Leave PARTY_LEDGER_SERVER_PROJECTION_ENABLED false and do not register the trigger. No live projection has been written, so there is nothing to undo.",
} as const;

/**
 * Document reads and one-owner subcollection reads do not need a composite index.
 * A future partyId + period query is not used.
 */
export const PARTY_LEDGER_INDEX_NOTE =
  "No composite index. Projection, bucket, command, and checkpoint documents are addressed by id.";
