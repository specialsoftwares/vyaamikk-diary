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
      deletion: INCLUDE_GRIN_IN_ACCOUNT_PURGE ? "included" : "retained_while_flag_false",
      exception: "Encryption is not implemented. Owner rules are access control. Leaving the purge flag false is not a decision that the bytes are sealed.",
    },
    partyLedger: {
      requirement: "Projection totals need application-level encryption before they count as sealed.",
      implemented: boundaryFor("party_ledger_projections").boundary,
      encryption: false,
      deletion: (USER_SUBCOLLECTIONS as readonly string[]).includes("partyLedgerProjections") ? "purged_with_the_account" : "missing_from_purge",
      exception: "Owner rules stop other users reading the totals. They do not encrypt the totals.",
    },
    localQueue: {
      requirement: "A queued plaintext payload needs encryption, or proof that logout removes it.",
      implemented: boundaryFor("local_caches_and_outboxes").boundary,
      encryption: false,
      logoutCleanupProven: false,
      deletion: "not_a_cloud_collection",
      exception: "Device-local storage is a location. It is not evidence of encryption or of logout cleanup.",
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
