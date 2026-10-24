/**
 * The protection requirement is not changed by the classification table.
 * Owner rules and device storage are recorded as what is implemented.
 */

import { INCLUDE_GRIN_IN_ACCOUNT_PURGE } from "../deletion/grinCleanupLists";
import { DELETION_GRACE_MS } from "../deletion/finalPurge";
import { DELETION_V2_ERASURE_DAYS, DELETION_V2_ERASURE_MS, LEGACY_MISSING_DEADLINE_MS } from "../deletion/deletionPolicy";
import { USER_SUBCOLLECTIONS } from "../deletion/firestorePurge";
import { boundaryFor } from "./privateFieldCoverage";

export function coverageEvidence() {
  return {
    grin: {
      requirement: "Receipt bodies and image bytes need application-level encryption before they count as sealed.",
      implemented: boundaryFor("grin_evidence").boundary,
      encryption: false,
      releaseReachable: false,
      deletion: INCLUDE_GRIN_IN_ACCOUNT_PURGE
        ? "flag_purges_legacy_and_new"
        : "legacy_jobs_retain_copies_version_2_jobs_already_purge",
      retainedCopies: "users/{uid} GRIN collections and users/{uid}/grinEvidence/ remain until a deletion job removes them",
    },
    partyLedger: {
      requirement: "Projection totals need application-level encryption before they count as sealed.",
      implemented: boundaryFor("party_ledger_projections").boundary,
      encryption: false,
      storedPlaintextProjection: false,
      clientRead: "denied",
      releaseReadPath: "recomputed_on_device",
      deletion: (USER_SUBCOLLECTIONS as readonly string[]).includes("partyLedgerProjections") ? "purged_with_the_account" : "missing_from_purge",
    },
    localQueue: {
      requirement: "A queued plaintext payload needs encryption, or proof that logout removes it.",
      implemented: boundaryFor("local_caches_and_outboxes").boundary,
      encryption: false,
      logoutCleanupProven: false,
      logoutRetainsUnsynced: true,
      accountIsolated: true,
      deletion: "owner_rows_removed_on_account_deletion",
    },
  } as const;
}

/** Legacy requests use the 45-day grace. A new version-2 request uses the 15-day erasure deadline. */
export function deletionDeadlinePopulations(): {
  legacyGraceMs: number;
  newRequestErasureMs: number;
  newRequestErasureDays: number;
  sameValue: boolean;
} {
  return {
    legacyGraceMs: DELETION_GRACE_MS,
    newRequestErasureMs: DELETION_V2_ERASURE_MS,
    newRequestErasureDays: DELETION_V2_ERASURE_DAYS,
    sameValue: DELETION_GRACE_MS === DELETION_V2_ERASURE_MS || DELETION_GRACE_MS !== LEGACY_MISSING_DEADLINE_MS,
  };
}
