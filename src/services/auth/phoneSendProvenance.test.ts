/**
 * Phone-send provenance — UI confirm / challenge / Firebase send argument.
 */
import assert from "node:assert/strict";

import { AppError } from "@/domain/errors";
import { toE164FromDraft } from "@/auth-v2/phoneValidation";
import { ingestIndianMobileFieldInput } from "@/auth-v2/phoneValidation";
import {
  PHONE_SEND_TARGET_MISMATCH,
  assertPhoneSendProvenance,
  resolveFreshPhoneSendTarget,
  resolveResendPhoneSendTarget,
} from "./phoneSendProvenance";
import { phonesMatchE164 } from "./phoneChallengeAuthInvariant";

const A = "+919654604148";
const B = "+918287636153";

// A. profile/stale A, input B, confirm B → Firebase send B
{
  const draftLocal = "8287636153";
  const confirmed = toE164FromDraft("+91", draftLocal);
  const result = resolveFreshPhoneSendTarget({
    confirmedPhoneE164: confirmed,
    statePhoneE164: confirmed,
    profilePhoneE164: A,
    priorChallengePhoneE164: A,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.firebaseSendPhoneE164, B);
    assert.notEqual(result.firebaseSendPhoneE164, A);
  }
}

// B. previous challenge A, new challenge B → send B
{
  const result = resolveFreshPhoneSendTarget({
    confirmedPhoneE164: B,
    statePhoneE164: B,
    priorChallengePhoneE164: A,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.firebaseSendPhoneE164, B);
}

// C. rapid A → B before confirmation: confirm+send both B
{
  let draft = "9654604148";
  draft = "8287636153";
  const confirmed = toE164FromDraft("+91", draft);
  const result = resolveFreshPhoneSendTarget({
    confirmedPhoneE164: confirmed,
    statePhoneE164: confirmed,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.firebaseSendPhoneE164, B);
}

// D. Gboard formatted autofill B → canonical +91B
{
  const ingested = ingestIndianMobileFieldInput("+91 82876 36153");
  assert.equal(ingested.status, "complete");
  if (ingested.status === "complete") {
    assert.equal(ingested.e164, B);
    const result = resolveFreshPhoneSendTarget({
      confirmedPhoneE164: ingested.e164,
      statePhoneE164: ingested.e164,
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.firebaseSendPhoneE164, B);
  }
}

// E. navigate back: A challenge exists, enter B → B sent (prior A ignored)
{
  const result = resolveFreshPhoneSendTarget({
    confirmedPhoneE164: B,
    statePhoneE164: B,
    priorChallengePhoneE164: A,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.firebaseSendPhoneE164, B);
}

// F. resend active B → B
{
  const result = resolveResendPhoneSendTarget({
    activeChallengePhoneE164: B,
    statePhoneE164: B,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.firebaseSendPhoneE164, B);
}

// G. stale native/profile A must not win over confirmed B
{
  const result = resolveFreshPhoneSendTarget({
    confirmedPhoneE164: B,
    statePhoneE164: B,
    profilePhoneE164: A,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.firebaseSendPhoneE164, B);
}

// H. state/display mismatch → refuse send (never guess)
{
  const result = resolveFreshPhoneSendTarget({
    confirmedPhoneE164: B,
    statePhoneE164: A,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.diagnosticCode, PHONE_SEND_TARGET_MISMATCH);
  }
  assert.throws(
    () => assertPhoneSendProvenance(result),
    (e: unknown) =>
      e instanceof AppError &&
      e.details?.diagnosticCode === PHONE_SEND_TARGET_MISMATCH
  );
}

// Resend refuses when state diverges from active challenge
{
  const result = resolveResendPhoneSendTarget({
    activeChallengePhoneE164: B,
    statePhoneE164: A,
  });
  assert.equal(result.ok, false);
}

// Unrelated OTP phone A cannot satisfy challenge phone B (confirm-side equality)
assert.equal(phonesMatchE164(A, B), false);

console.log("phoneSendProvenance.test.ts: ok");
