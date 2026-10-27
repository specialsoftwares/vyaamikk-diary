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
      encryption: true,
      receiptDocuments: "sealed_or_rejected",
      imageBytes: "sealed_stream_original_hash_distinct",
      fullFeatureProfile: "internal-grin",
      grinAdmission: "enabled",
      purchaseEntry: "enabled",
      quotaUpsell: "disabled",
      releaseReachable: true,
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
      encryption: true,
      logoutCleanupProven: false,
      logoutRetainsUnsynced: true,
      accountIsolated: true,
      keyStore: "os_secure_store",
      nativeDeviceVerified: false,
      sealedFields: [
        "form_drafts.payload_json",
        "form_drafts.title",
        "entries_local.payload_json",
        "entries_local.origin_payload_json",
        "sync_queue.payload_json",
        "active_route.params_json",
        "master_data_suggestions.value",
        "master_data_suggestions.display_value",
        "business_insights.display_label",
        "business_insights.metadata_json",
        "recent_searches",
        "grin_local_receipts.payload_json",
        "grin_local_receipts.confirmed_original_json",
        "grin_local_receipts.confirmed_events_json",
        "grin_local_receipts.confirmed_effective_json",
        "grin_outbox_commands.frozen_payload_json",
      ],
      insightJoinKeys: "account_bound_hmac",
      grinLocal: {
        storeRuntimeCanOpen: false,
        bodiesEncrypted: true,
        logoutRetains: true,
        accountDeletionRemovesOwnerRows: true,
      },
      mockDiary: {
        productionRepository: "firebase",
        silentFallback: false,
        retainedCopiesSealed: true,
        accountDeletionRemovesKeys: true,
      },
      unresolvedOwnerDecision: [] as string[],
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
