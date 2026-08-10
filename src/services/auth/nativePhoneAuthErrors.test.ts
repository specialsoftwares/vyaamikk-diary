import assert from "node:assert/strict";

import { AppError } from "@/domain/errors";
import { toE164FromDraft } from "@/auth-v2/phoneValidation";
import { DEFAULT_AUTH_V2_COUNTRY_CODE } from "@/auth-v2/types";
import {
  extractFirebaseAuthCode,
  formatPhoneAuthCopyDiagnostics,
  formatPhoneAuthDisplayMessage,
  KNOWN_PHONE_AUTH_CODES,
  mapPhoneAuthFailure,
  phoneAuthDiagnosticId,
  phoneAuthFailureToAppError,
  redactPhoneAuthMessage,
} from "./nativePhoneAuthErrors";

function firebaseLike(code: string, message?: string) {
  return { code, message: message ?? `[${code}] native failure`, name: "FirebaseAuthError" };
}

function run() {
  // E.164 path used by Auth v2 for the reported beta number.
  assert.equal(
    toE164FromDraft(DEFAULT_AUTH_V2_COUNTRY_CODE, "8076861531"),
    "+918076861531"
  );

  for (const code of KNOWN_PHONE_AUTH_CODES) {
    const mapped = mapPhoneAuthFailure(firebaseLike(code), "send");
    assert.equal(mapped.firebaseAuthCode, code);
    assert.equal(mapped.knownCode, code);
    const appErr = phoneAuthFailureToAppError(firebaseLike(code), "send", {
      phoneE164Sent: "+918076861531",
    });
    assert.equal(appErr.details?.firebaseAuthCode, code);
    assert.equal(phoneAuthDiagnosticId(appErr), code);
    // Never collapse non-invalid-phone failures into invalid_phone.
    if (code !== "auth/invalid-phone-number") {
      assert.notEqual(appErr.code, "invalid_phone");
    }
  }

  assert.equal(
    mapPhoneAuthFailure(firebaseLike("auth/invalid-phone-number"), "send").appErrorCode,
    "invalid_phone"
  );
  assert.equal(
    mapPhoneAuthFailure(firebaseLike("auth/missing-client-identifier"), "send").appErrorCode,
    "otp_send_failed"
  );
  assert.equal(
    mapPhoneAuthFailure(firebaseLike("auth/too-many-requests"), "send").appErrorCode,
    "too_many_attempts"
  );
  assert.equal(
    mapPhoneAuthFailure(firebaseLike("auth/network-request-failed"), "send").appErrorCode,
    "network"
  );
  assert.equal(
    mapPhoneAuthFailure(firebaseLike("auth/operation-not-allowed"), "send").appErrorCode,
    "auth_not_configured"
  );

  // Message-embedded code extraction (RNFirebase often brackets codes).
  assert.equal(
    extractFirebaseAuthCode(new Error("[auth/app-not-authorized] App not authorized")),
    "auth/app-not-authorized"
  );
  assert.equal(
    extractFirebaseAuthCode({ nativeErrorCode: "missing-client-identifier" }),
    "auth/missing-client-identifier"
  );

  const redacted = redactPhoneAuthMessage(
    "token=eyJhbGciOiJIUzI1NiIsInR5pXVCJ9.aaa.bbb apiKey=AIzaSyDummyKey1234567890 otp=123456"
  );
  assert.ok(!/eyJ/.test(redacted));
  assert.ok(!/AIza/.test(redacted));
  assert.ok(!/123456/.test(redacted));
  assert.match(redacted, /\[redacted\]/);

  const display = formatPhoneAuthDisplayMessage(
    phoneAuthFailureToAppError(
      firebaseLike(
        "auth/missing-client-identifier",
        "[auth/missing-client-identifier] This app is not authorized"
      ),
      "send",
      { phoneE164Sent: "+918076861531", androidActivity: "unknown" }
    )
  );
  assert.match(display, /Diagnostic: auth\/missing-client-identifier/);
  assert.match(display, /Detail:/);
  assert.match(display, /Phone sent: \+918076861531/);
  assert.match(display, /Exception:/);
  assert.ok(!/AIza|Bearer|eyJ/.test(display));

  const copy = formatPhoneAuthCopyDiagnostics(
    phoneAuthFailureToAppError(
      firebaseLike(
        "auth/missing-client-identifier",
        "[auth/missing-client-identifier] This app is not authorized"
      ),
      "send",
      { phoneE164Sent: "+918076861531", androidActivity: "unknown" }
    )
  );
  assert.match(copy, /firebaseAuthCode=auth\/missing-client-identifier/);
  assert.match(copy, /exceptionName=FirebaseAuthError/);
  assert.match(copy, /redactedMessage=/);
  assert.match(copy, /phoneE164Sent=\+918076861531/);
  assert.ok(!/AIza|Bearer|eyJ/.test(copy));

  // Unknown codes preserve original string, not invalid_phone.
  const unknown = phoneAuthFailureToAppError(
    firebaseLike("auth/captcha-check-failed"),
    "send"
  );
  assert.equal(unknown.details?.firebaseAuthCode, "auth/captcha-check-failed");
  assert.equal(unknown.details?.knownPhoneAuthCode, "auth/unknown");
  assert.equal(unknown.code, "otp_send_failed");
  assert.notEqual(unknown.code, "invalid_phone");

  // AppError passthrough diagnostic
  assert.equal(
    phoneAuthDiagnosticId(new AppError("network", "offline")),
    null
  );

  console.log("nativePhoneAuthErrors.test.ts: ok");
}

run();
