import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { AUTH_USER_FACING_COPY } from "./authUserFacingCopy";
import { formatPhoneAuthDisplayMessage, phoneAuthFailureToAppError } from "./nativePhoneAuthErrors";
import { shouldShowAuthDiagnosticsInUi } from "./authDiagnosticsGate";
import { AppError } from "@/domain/errors";

const prevMode = process.env.EXPO_PUBLIC_APP_MODE;
const prevDiag = process.env.EXPO_PUBLIC_INTERNAL_AUTH_DIAGNOSTICS;
process.env.EXPO_PUBLIC_APP_MODE = "production";
delete process.env.EXPO_PUBLIC_INTERNAL_AUTH_DIAGNOSTICS;

assert.equal(shouldShowAuthDiagnosticsInUi(), false, "production mode hides diagnostics");

const invalid = phoneAuthFailureToAppError(
  { code: "auth/invalid-verification-code", message: "bad", name: "Error" },
  "confirm"
);
const shown = formatPhoneAuthDisplayMessage(invalid);
assert.equal(shown, AUTH_USER_FACING_COPY.invalidOtp);
assert.equal(shown.includes("auth/invalid-verification-code"), false);
assert.equal(shown.includes("asia-south1"), false);
assert.equal(shown.includes("resolveOrCreateUserByPhone"), false);
assert.equal(shown.includes("Copy diagnostics"), false);
assert.equal(shown.includes("Android activity"), false);
assert.equal(shown.includes("+91"), false);

const postAuth = new AppError(
  "not_found",
  "Couldn't finish account setup. Please try again.",
  undefined,
  {
    callableName: "resolveOrCreateUserByPhone",
    functionsRegion: "asia-south1",
    diagnosticCode: "failed-precondition:asia-south1:resolveOrCreateUserByPhone",
  }
);
assert.equal(formatPhoneAuthDisplayMessage(postAuth).includes("asia-south1"), false);
assert.equal(formatPhoneAuthDisplayMessage(postAuth).includes("resolveOrCreateUserByPhone"), false);

const panel = readFileSync(
  join(__dirname, "../../auth-v2/components/PhoneAuthErrorPanel.tsx"),
  "utf8"
);
assert.match(panel, /shouldShowAuthDiagnosticsInUi/);
assert.match(panel, /Copy diagnostics/);

const gate = readFileSync(join(__dirname, "../../auth-v2/AuthFlowGate.tsx"), "utf8");
assert.match(gate, /errorVisibleOnSurface/);
assert.match(gate, /emailScreenError/);
assert.equal(gate.includes("goBackFromEmail"), false);
assert.match(gate, /Sign out and start again/);
assert.match(gate, /onVerifyStart/);
assert.match(gate, /hidden_stay|emailBackPolicy/);

if (prevMode == null) delete process.env.EXPO_PUBLIC_APP_MODE;
else process.env.EXPO_PUBLIC_APP_MODE = prevMode;
if (prevDiag == null) delete process.env.EXPO_PUBLIC_INTERNAL_AUTH_DIAGNOSTICS;
else process.env.EXPO_PUBLIC_INTERNAL_AUTH_DIAGNOSTICS = prevDiag;

console.log("authProductionPresentation.test.ts: ok");
