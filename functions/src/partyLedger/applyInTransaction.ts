/**
 * DEPLOYMENT IS NOT AUTHORIZED.
 * Do not register this module from functions/src/index.ts. Do not add a trigger.
 * Do not deploy functions, rules, or indexes. Do not run a production backfill.
 * PARTY_LEDGER_SERVER_PROJECTION_ENABLED remains false. No live data is migrated.
 * Rollback: leave the flag false and do not deploy. There is no production projection to undo.
 *
 * Collections a future authorized transaction would use (not created by this file):
 *   users/{uid}/partyLedgerProjections/{sourceKey}
 *   users/{uid}/partyLedgerBuckets/{bucketId}
 *
 * Client writes must be denied. This change does not edit firestore.rules.
 * Existing matches do not grant these paths, so clients are already denied.
 * Install the following only in a reviewed rules deploy. Firestore ORs allow
 * rules, so this deny must be the only match for these paths:
 *
 *   match /users/{uid}/partyLedgerProjections/{projectionId} {
 *     allow read, write: if false;
 *   }
 *   match /users/{uid}/partyLedgerBuckets/{bucketId} {
 *     allow read, write: if false;
 *   }
 */

export const PARTY_LEDGER_PROJECTIONS_COLLECTION = "users/{uid}/partyLedgerProjections";
export const PARTY_LEDGER_BUCKETS_COLLECTION = "users/{uid}/partyLedgerBuckets";

export const PARTY_LEDGER_CLIENT_DENY_RULE = `
match /users/{uid}/partyLedgerProjections/{projectionId} {
  allow read, write: if false;
}
match /users/{uid}/partyLedgerBuckets/{bucketId} {
  allow read, write: if false;
}
`.trim();

export const PARTY_LEDGER_APPLY_ROLLBACK =
  "Leave PARTY_LEDGER_SERVER_PROJECTION_ENABLED false. Do not deploy functions, rules, or indexes, and do not run a production backfill. No live data is migrated, so rollback is to keep the flag off.";

export interface PartyLedgerTransactionStep {
  op: "read" | "write";
  path: string;
  purpose: "source" | "applied_projection" | "affected_summary" | "projection" | "bucket_delta";
}

export interface PartyLedgerApplyPlan {
  deploymentAuthorized: false;
  serverProjectionEnabled: false;
  liveDataMigrated: false;
  rollback: string;
  collections: {
    projections: typeof PARTY_LEDGER_PROJECTIONS_COLLECTION;
    buckets: typeof PARTY_LEDGER_BUCKETS_COLLECTION;
  };
  clientWrites: "deny";
  clientDenyRule: string;
  guards: string[];
  steps: PartyLedgerTransactionStep[];
}

export interface PartyLedgerApplyPlanInput {
  ownerUid: string;
  sourcePath: string;
  sourceKey: string;
  affectedBucketIds: readonly string[];
}

function assertPathSegment(value: string, label: string): void {
  if (!value || value.includes("/")) throw new Error(`party_ledger_plan_${label}`);
}

/**
 * Describes the transaction. It does not open Firestore and it is not a Cloud Function.
 * Steps: read source, read applied projection, read affected bucket summaries,
 * then write the projection and the bucket deltas.
 */
export function planApplyInTransaction(input: PartyLedgerApplyPlanInput): PartyLedgerApplyPlan {
  assertPathSegment(input.ownerUid, "owner");
  assertPathSegment(input.sourceKey, "source_key");
  if (!input.sourcePath || input.sourcePath.startsWith("/")) throw new Error("party_ledger_plan_source");
  const bucketIds = [...new Set(input.affectedBucketIds)].sort();
  for (const bucketId of bucketIds) assertPathSegment(bucketId, "bucket");

  const projectionPath = `users/${input.ownerUid}/partyLedgerProjections/${input.sourceKey}`;
  const bucketPath = (bucketId: string) => `users/${input.ownerUid}/partyLedgerBuckets/${bucketId}`;
  const steps: PartyLedgerTransactionStep[] = [
    { op: "read", path: input.sourcePath, purpose: "source" },
    { op: "read", path: projectionPath, purpose: "applied_projection" },
    ...bucketIds.map(
      (bucketId): PartyLedgerTransactionStep => ({
        op: "read",
        path: bucketPath(bucketId),
        purpose: "affected_summary",
      }),
    ),
    { op: "write", path: projectionPath, purpose: "projection" },
    ...bucketIds.map(
      (bucketId): PartyLedgerTransactionStep => ({
        op: "write",
        path: bucketPath(bucketId),
        purpose: "bucket_delta",
      }),
    ),
  ];

  return {
    deploymentAuthorized: false,
    serverProjectionEnabled: false,
    liveDataMigrated: false,
    rollback: PARTY_LEDGER_APPLY_ROLLBACK,
    collections: {
      projections: PARTY_LEDGER_PROJECTIONS_COLLECTION,
      buckets: PARTY_LEDGER_BUCKETS_COLLECTION,
    },
    clientWrites: "deny",
    clientDenyRule: PARTY_LEDGER_CLIENT_DENY_RULE,
    guards: [
      "If the stored epoch is newer than the incoming epoch, write nothing.",
      "If the command id is already bound to a different payload hash, write nothing and return conflict.",
      "If epoch, revision, projectorVersion, and contributionHash match, write nothing and return delta zero.",
    ],
    steps,
  };
}
