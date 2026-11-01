/**
 * Public error catalogue. Fixed copy only.
 * Label: PURE_HELPER
 */
import assert from "node:assert/strict";

import { AppError, userFacingMessage } from "./errors";
import {
  PUBLIC_ERROR_CATALOGUE,
  PUBLIC_ERROR_COPY,
  PUBLIC_ERROR_MESSAGE_IDS,
  classifyPublicError,
  publicMessage,
  publicMessageId,
} from "./publicErrorCatalogue";

const EMAIL = "alice.reviewer@example.invalid";
const CALLABLE = "resolveOrCreateUserByPhone";
const PATH = "/Users/shivamsaurav/secret/firestore/users/abc";
const LEAK = `Firebase: callable ${CALLABLE} failed age_not_admitted ${EMAIL} ${PATH}`;

function assertNoLeak(value: string): void {
  assert.equal(value.includes("age_not_admitted"), false);
  assert.equal(value.includes(CALLABLE), false);
  assert.equal(value.includes(EMAIL), false);
  assert.equal(value.includes("/Users/"), false);
  assert.equal(value.includes("firestore"), false);
  assert.equal(value.includes("Firebase"), false);
  assert.equal(value.includes("functions/"), false);
  assert.equal(value.includes("AIza"), false);
  assert.equal(value.includes("Bearer"), false);
  assert.equal(value.includes("eyJ"), false);
}

{
  assert.equal(PUBLIC_ERROR_CATALOGUE.length, 7);
  for (const entry of PUBLIC_ERROR_CATALOGUE) {
    assert.equal(entry.messageId, PUBLIC_ERROR_MESSAGE_IDS[entry.code]);
    assert.equal(entry.message, PUBLIC_ERROR_COPY[entry.code]);
    assert.equal(entry.message.includes("age_not_admitted"), false);
  }
}

{
  assert.equal(publicMessage(new AppError("network", LEAK)), PUBLIC_ERROR_COPY.network);
  assert.equal(
    publicMessage({ code: "auth/network-request-failed", message: LEAK }),
    PUBLIC_ERROR_COPY.network
  );
  assert.equal(
    publicMessage(new AppError("invalid_otp", LEAK)),
    PUBLIC_ERROR_COPY.invalid_otp
  );
  assert.equal(
    publicMessage({ code: "auth/invalid-verification-code", message: LEAK }),
    PUBLIC_ERROR_COPY.invalid_otp
  );
  assert.equal(publicMessage(new AppError("otp_expired", LEAK)), PUBLIC_ERROR_COPY.otp_expired);
  assert.equal(
    publicMessage({ code: "auth/code-expired", message: LEAK }),
    PUBLIC_ERROR_COPY.otp_expired
  );
  assert.equal(
    publicMessage(new AppError("too_many_attempts", LEAK)),
    PUBLIC_ERROR_COPY.too_many_attempts
  );
  assert.equal(
    publicMessage({ code: "auth/too-many-requests", message: LEAK }),
    PUBLIC_ERROR_COPY.too_many_attempts
  );
  assert.equal(
    publicMessage(new AppError("session_expired", LEAK)),
    PUBLIC_ERROR_COPY.session_expired
  );
  assert.equal(
    publicMessage({ code: "functions/unauthenticated", message: LEAK }),
    PUBLIC_ERROR_COPY.session_expired
  );
}

{
  const age = new AppError("age_not_admitted", "age_not_admitted");
  assert.equal(age.code, "age_not_admitted");
  assert.equal(publicMessage(age), PUBLIC_ERROR_COPY.age_not_admitted);
  assert.equal(publicMessageId(age), "errors.ageNotAdmitted");
  assert.equal(classifyPublicError(age), "age_not_admitted");
  assertNoLeak(publicMessage(age));
  assert.equal(userFacingMessage(age), PUBLIC_ERROR_COPY.age_not_admitted);
  assertNoLeak(userFacingMessage(age));

  const wrapped = new Error(LEAK);
  assert.equal(publicMessage(wrapped), PUBLIC_ERROR_COPY.age_not_admitted);
  assertNoLeak(publicMessage(wrapped));

  const details = {
    code: "functions/failed-precondition",
    message: "INTERNAL",
    details: { code: "age_not_admitted" },
  };
  assert.equal(publicMessage(details), PUBLIC_ERROR_COPY.age_not_admitted);
  assertNoLeak(publicMessage(details));
}

{
  const unknown = new Error(`Firebase: callable ${CALLABLE} failed ${EMAIL} ${PATH}`);
  assert.equal(publicMessage(unknown), PUBLIC_ERROR_COPY.unknown);
  assert.equal(publicMessageId(unknown), "errors.unknown");
  assertNoLeak(publicMessage(unknown));
  assert.equal(
    publicMessage({ code: "functions/internal", message: `Firebase: callable ${CALLABLE} failed` }),
    PUBLIC_ERROR_COPY.unknown
  );
}

{
  const kept = new AppError(
    "otp_expired",
    "Verification session was lost after leaving the app. Please request a new code."
  );
  assert.match(userFacingMessage(kept), /session was lost/i);
  assert.equal(publicMessage(kept), PUBLIC_ERROR_COPY.otp_expired);
}

console.log("publicErrorCatalogue.test.ts: ok");
