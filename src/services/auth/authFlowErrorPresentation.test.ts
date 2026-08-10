import assert from "node:assert/strict";

import {
  authFlowDiagnosticCode,
  authFlowErrorTitle,
  canRetryAccountSetupWithoutSms,
  canonicalFunctionsRegion,
  resolveAuthFlowPhase,
} from "./authFlowErrorPresentation";
import { AppError } from "@/domain/errors";

function run() {
  assert.equal(canonicalFunctionsRegion(null), "asia-south1");
  assert.equal(canonicalFunctionsRegion(""), "asia-south1");
  assert.equal(canonicalFunctionsRegion("asia-south1"), "asia-south1");
  assert.equal(canonicalFunctionsRegion(" us-central1 "), "us-central1");

  const postAuth = new AppError(
    "not_found",
    "Couldn't finish account setup. Please try again.",
    undefined,
    {
      authPhase: "post_auth",
      functionsErrorCode: "functions/not-found",
      callableName: "resolveOrCreateUserByPhone",
      functionsRegion: "us-central1",
      diagnosticCode: "FN_NOT_FOUND:us-central1:resolveOrCreateUserByPhone",
    }
  );
  assert.equal(resolveAuthFlowPhase(postAuth), "post_auth");
  assert.equal(authFlowErrorTitle(postAuth), "Couldn't finish account setup");
  assert.equal(
    authFlowDiagnosticCode(postAuth),
    "FN_NOT_FOUND:us-central1:resolveOrCreateUserByPhone"
  );
  // Must never be mislabeled as OTP send failure.
  assert.notEqual(authFlowErrorTitle(postAuth), "OTP send failed");
  assert.notEqual(authFlowErrorTitle(postAuth), "Couldn't send verification code");

  const send = new AppError("otp_send_failed", "Could not send", undefined, {
    phoneAuthPhase: "send",
    firebaseAuthCode: "auth/too-many-requests",
  });
  assert.equal(resolveAuthFlowPhase(send), "send");
  assert.equal(authFlowErrorTitle(send), "Couldn't send verification code");

  const verify = new AppError("invalid_otp", "Incorrect verification code.", undefined, {
    phoneAuthPhase: "confirm",
    firebaseAuthCode: "auth/invalid-verification-code",
  });
  // confirm maps to verify presentation via invalid_otp code when authPhase absent
  assert.equal(resolveAuthFlowPhase(verify), "verify");
  assert.equal(authFlowErrorTitle(verify), "Couldn't verify code");

  assert.equal(canRetryAccountSetupWithoutSms(postAuth), false);

  console.log("authFlowErrorPresentation.test.ts: ok");
}

run();
