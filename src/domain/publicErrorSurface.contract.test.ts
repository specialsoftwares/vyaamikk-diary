/**
 * Public error surface contract.
 * Backend text, internal codes, contacts, and absolute paths stay off the UI
 * and out of the redacted diagnostic error.
 * Label: PURE_HELPER
 */
import assert from "node:assert/strict";

import { AppError } from "./errors";
import { PUBLIC_ERROR_COPY, publicMessage } from "./publicErrorCatalogue";
import { presentEmailOtpSendError } from "../services/auth/presentEmailOtpSendError";
import { formatPhoneAuthDisplayMessage } from "../services/auth/nativePhoneAuthErrors";
import { createSafeDiagnosticError } from "../utils/safeDiagnostics";

const EMAIL = "alice.reviewer@example.invalid";
const CALLABLE = "resolveOrCreateUserByPhone";
const PATH = "/Users/shivamsaurav/secret/firestore/users/abc";
const BACKEND = `Firebase: callable ${CALLABLE} failed age_not_admitted ${EMAIL} ${PATH} AIzaSyDummy Bearer eyJhbGci`;

function assertNoLeak(value: string): void {
  assert.equal(value.includes("age_not_admitted"), false, value);
  assert.equal(value.includes(CALLABLE), false, value);
  assert.equal(value.includes(EMAIL), false, value);
  assert.equal(value.includes("/Users/"), false, value);
  assert.equal(value.includes("firestore"), false, value);
  assert.equal(value.includes("Firebase"), false, value);
  assert.equal(value.includes("AIza"), false, value);
  assert.equal(value.includes("Bearer"), false, value);
  assert.equal(value.includes("eyJ"), false, value);
  assert.equal(value.includes("node_modules"), false, value);
}

function leakedError(): Error {
  const error = new Error(BACKEND);
  error.stack = [
    `Error: ${BACKEND}`,
    "    at submit (/Users/shivamsaurav/proj/src/auth/session.ts:12:3)",
    "    at leak (src/auth/leak.ts?email=alice.reviewer@example.invalid:1:1)",
    "    at pkg (/Users/shivamsaurav/proj/node_modules/firebase/index.js:2:2)",
    "    at hidden (/Users/shivamsaurav/secret/firestore/users/abc:1:1)",
  ].join("\n");
  return error;
}

{
  const error = leakedError();
  const shown = publicMessage(error);
  assert.equal(shown, PUBLIC_ERROR_COPY.age_not_admitted);
  assertNoLeak(shown);

  const diag = createSafeDiagnosticError(error, "auth/nativePhone", "corr-surface-1");
  const blob = `${diag.message}\n${diag.stack}`;
  assert.equal(diag.message, "diagnostic:unknown");
  assert.equal(diag.code, "unknown");
  assert.equal(diag.context, "auth/nativePhone");
  assert.equal(diag.correlationId, "corr-surface-1");
  assert.doesNotMatch(diag.message, /age_not_admitted|Firebase|callable|alice\.reviewer|\/Users\//);
  assert.match(diag.stack ?? "", /src\/auth\/session\.ts/);
  assert.doesNotMatch(blob, /node_modules/);
  assertNoLeak(blob);
  assert.match(blob, /code=unknown/);
  assert.match(blob, /context=auth\/nativePhone/);
  assert.match(blob, /correlation=corr-surface-1/);
}

{
  const age = new AppError("age_not_admitted", BACKEND);
  age.stack = "AppError: age_not_admitted\n    at call (node_modules/firebase/index.js:1:1)";
  assert.equal(age.code, "age_not_admitted");
  assertNoLeak(publicMessage(age));
  assert.equal(publicMessage(age), PUBLIC_ERROR_COPY.age_not_admitted);
  const diag = createSafeDiagnosticError(age, "save", "corr-surface-2");
  assert.equal(diag.code, "unknown");
  assertNoLeak(`${diag.message}\n${diag.stack}`);
  assert.match(diag.stack ?? "", /at unknown \(save\)/);
}

{
  const callable = Object.assign(new Error(`Firebase: callable ${CALLABLE} failed ${EMAIL} ${PATH}`), {
    code: "functions/internal",
  });
  callable.stack = [
    `Error: ${callable.message}`,
    "    at submit (src/auth/session.ts:4:1)",
    "    at pkg (node_modules/@firebase/functions/index.js:9:1)",
  ].join("\n");
  const shown = publicMessage(callable);
  assert.equal(shown, PUBLIC_ERROR_COPY.unknown);
  assertNoLeak(shown);
  const diag = createSafeDiagnosticError(callable, `ErrorBoundary ${EMAIL}`);
  const blob = `${diag.message}\n${diag.stack}`;
  assert.equal(diag.context, "app");
  assert.match(diag.stack ?? "", /src\/auth\/session\.ts/);
  assert.doesNotMatch(blob, /node_modules/);
  assert.doesNotMatch(blob, /@firebase/);
  assertNoLeak(blob);
}

{
  const emailUi = presentEmailOtpSendError(new AppError("unknown", BACKEND));
  assert.equal(emailUi, PUBLIC_ERROR_COPY.age_not_admitted);
  assertNoLeak(emailUi);

  const phoneUi = formatPhoneAuthDisplayMessage(
    new AppError("not_found", BACKEND, undefined, {
      callableName: CALLABLE,
      functionsRegion: "asia-south1",
    })
  );
  assert.equal(phoneUi, "We couldn't find that entry.");
  assertNoLeak(phoneUi);
  assert.equal(phoneUi.includes("asia-south1"), false);
}

console.log("publicErrorSurface.contract.test.ts: ok");
