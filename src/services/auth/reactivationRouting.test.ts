import assert from "node:assert/strict";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { AppError, userFacingMessage } from "@/domain/errors";
import {
  deletionPendingToAppError,
  isDeletionPendingResponse,
  reactivationPublicMessageId,
  routeAccountSetupFailure,
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

  const pendingError = deletionPendingToAppError(pending);
  for (const source of ["initial_completion", "authenticated_retry"] as const) {
    const decision = routeAccountSetupFailure({
      error: pendingError,
      stillCurrent: true,
      fallbackPhoneE164: "+910000000000",
    });
    assert.equal(decision.kind, "reactivation", source);
    if (decision.kind === "reactivation") {
      assert.equal(decision.params.phoneE164, "+919876543210");
      assert.equal(decision.params.maskedEmail, "ab***@e***.com");
    }
  }

  const stale = routeAccountSetupFailure({
    error: pendingError,
    stillCurrent: false,
    fallbackPhoneE164: "+919876543210",
  });
  assert.equal(stale.kind, "stale");

  const displayed = routeAccountSetupFailure({
    error: new AppError("otp_send_failed", "Could not send the verification code. Try again."),
    stillCurrent: true,
    fallbackPhoneE164: "+919876543210",
  });
  assert.equal(displayed.kind, "display");
  assert.equal(userFacingMessage(displayed.kind === "display" ? new AppError("too_many_attempts", "auth/too-many-requests") : pendingError), "Too many attempts. Please wait a few minutes and try again.");
  assert.equal(reactivationPublicMessageId("expired"), "reactivateExpired");
  assert.equal(reactivationPublicMessageId("superseded"), "reactivateLatestCode");
  assert.equal(reactivationPublicMessageId("purge_underway"), "reactivateUnavailable");
  assert.equal(reactivationPublicMessageId("invalid"), null);
  assert.equal(userFacingMessage(new AppError("unknown", "Incorrect code. Please try again.")), "Incorrect code. Please try again.");

  const gate = readFileSync(resolve(process.cwd(), "src/auth-v2/AuthFlowGate.tsx"), "utf8");
  const verifyStart = gate.indexOf("const handleVerifyOtp");
  const retryStart = gate.indexOf("const handleRetryAccountSetup");
  const resendStart = gate.indexOf("const handleResend");
  const verifyBody = gate.slice(verifyStart, retryStart);
  const retryBody = gate.slice(retryStart, resendStart);
  assert.match(verifyBody, /routeAccountSetupFailure\(/);
  assert.match(retryBody, /routeAccountSetupFailure\(/);
  assert.match(retryBody, /pendingRoute\.kind === "reactivation"/);
  assert.equal(retryBody.includes("applyFlowError(e, \"phone_otp\")") || retryBody.includes("applyFlowError(e, 'phone_otp')"), true);

  console.log("reactivationRouting.test.ts: ok");
}

main();
