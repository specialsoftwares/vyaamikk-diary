import assert from "node:assert/strict";

import {
  deletionPendingToAppError,
  isDeletionPendingResponse,
  routeResolveByPhoneResponse,
  type DeletionPendingResponse,
  type ResolveByPhoneSuccessResponse,
} from "@/services/auth/reactivationRouting";

function deletionPendingSample(): DeletionPendingResponse {
  return {
    status: "deletion_pending",
    requiresReactivation: true,
    requiresEmailVerification: true,
    maskedEmail: "ab***@e***.com",
    deletionScheduledFor: 1_700_000_000_000,
    policyTextVersion: "2026-06",
    profile: {
      uid: "uid-1",
      status: "pending_deletion",
      phoneE164: "+919876543210",
      deletionScheduledFor: 1_700_000_000_000,
    },
    isNewUser: false,
  };
}

function successSample(): ResolveByPhoneSuccessResponse {
  return {
    profile: { uid: "uid-2", ueid: "VYD-2026-AAAAAA", phoneE164: "+919876543210" },
    isNewUser: false,
  };
}

function main() {
  const pending = deletionPendingSample();
  assert.equal(isDeletionPendingResponse(pending), true);
  assert.equal(isDeletionPendingResponse(successSample()), false);

  const err = deletionPendingToAppError(pending);
  assert.equal(err.code, "account_pending_deletion");
  assert.equal(err.details?.phoneE164, "+919876543210");
  assert.equal(err.details?.deletionScheduledFor, 1_700_000_000_000);
  assert.equal(err.details?.maskedEmail, "ab***@e***.com");
  assert.equal(err.details?.requiresReactivation, true);
  assert.equal(err.details?.policyTextVersion, "2026-06");

  assert.throws(() => routeResolveByPhoneResponse(pending), (e: unknown) => {
    assert.equal((e as { code?: string }).code, "account_pending_deletion");
    return true;
  });

  const routed = routeResolveByPhoneResponse(successSample());
  assert.equal(routed.profile.uid, "uid-2");
  assert.equal(routed.isNewUser, false);

  console.log("reactivationRouting.test.ts: ok");
}

main();
