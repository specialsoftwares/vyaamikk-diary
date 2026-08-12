import assert from "node:assert/strict";

import {
  authFlowDiagnosticCode,
  authFlowErrorTitle,
  canRetryAccountSetupWithoutSms,
  canonicalFunctionsRegion,
  resolveAuthFlowPhase,
} from "./authFlowErrorPresentation";
import { AppError } from "@/domain/errors";
import { formatPhoneAuthCopyDiagnostics } from "./nativePhoneAuthErrors";
import { __nativeCallableAuthReadyTimeoutMs } from "./nativeCallableAuthGate";

function run() {
  assert.equal(canonicalFunctionsRegion(null), "asia-south1");
  assert.ok(__nativeCallableAuthReadyTimeoutMs() >= 1000);

  const unauth = new AppError(
    "auth_failed",
    "Your sign-in was verified, but we couldn't finish setting up your account. Please try again.",
    undefined,
    {
      authPhase: "post_auth",
      failureDomain: "functions",
      functionsErrorCode: "functions/unauthenticated",
      callableName: "resolveOrCreateUserByPhone",
      functionsRegion: "asia-south1",
      diagnosticCode: "FN_UNAUTHENTICATED:asia-south1:resolveOrCreateUserByPhone",
      firebaseUserPresent: true,
      idTokenReady: true,
      retryAccountSetup: true,
      sameFirebaseApp: true,
      authAppName: "[DEFAULT]",
      functionsAppName: "[DEFAULT]",
    }
  );

  assert.equal(resolveAuthFlowPhase(unauth), "post_auth");
  assert.equal(authFlowErrorTitle(unauth), "Couldn't finish account setup");
  assert.ok(canRetryAccountSetupWithoutSms(unauth));
  assert.match(authFlowDiagnosticCode(unauth) ?? "", /FN_UNAUTHENTICATED/);
  assert.ok(!/Sign in again/i.test(unauth.message));

  const copied = formatPhoneAuthCopyDiagnostics(unauth);
  assert.match(copied, /failureDomain=functions/);
  assert.match(copied, /functionsCode=functions\/unauthenticated/);
  assert.ok(!/firebaseAuthCode=auth\/unknown/.test(copied));
  assert.match(copied, /firebaseUserPresent=true/);
  assert.match(copied, /idTokenReady=true/);
  assert.match(copied, /sameFirebaseApp=true/);

  const send = new AppError("otp_send_failed", "Could not send", undefined, {
    phoneAuthPhase: "send",
    firebaseAuthCode: "auth/too-many-requests",
  });
  assert.equal(authFlowErrorTitle(send), "Couldn't send verification code");
  assert.equal(canRetryAccountSetupWithoutSms(send), false);

  console.log("nativeCallableAuthGate.contract.test.ts: ok");
}

run();
