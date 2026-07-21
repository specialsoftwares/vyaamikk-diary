import assert from "node:assert/strict";
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";

import {
  EMAIL_OTP_LOCK_MS,
  EMAIL_OTP_MAX_ATTEMPTS,
  EMAIL_OTP_RESEND_COOLDOWN_MS,
  EMAIL_OTP_TTL_MS,
} from "./emailOtpConstants";
import { hashEmail, isValidEmailSyntax, normalizeEmail } from "@/utils/emailHash";
import { sha256Hex } from "@/utils/sha256Hex";

assert.equal(EMAIL_OTP_TTL_MS, 15 * 60 * 1000);
assert.equal(EMAIL_OTP_RESEND_COOLDOWN_MS, 30_000);
assert.equal(EMAIL_OTP_MAX_ATTEMPTS, 3);
assert.equal(EMAIL_OTP_LOCK_MS, 60 * 60 * 1000);

assert.equal(normalizeEmail("  Foo.Bar+tag@Example.COM "), "foo.bar+tag@example.com");
assert.equal(isValidEmailSyntax("bad"), false);
assert.equal(isValidEmailSyntax("good@example.com"), true);

assert.equal(hashEmail("A@B.CO"), sha256Hex("a@b.co"));
assert.equal(createHash("sha256").update("a@b.co", "utf8").digest("hex"), sha256Hex("a@b.co"));

// Mirror server HMAC contract (must include challenge context — not unsalted code hash).
function digestEmailOtp(
  secret: string,
  code: string,
  ctx: { challengeId: string; uid: string; normalizedEmail: string; version: number }
): string {
  const payload = [ctx.challengeId, ctx.uid, ctx.normalizedEmail, String(ctx.version), code.trim()].join(
    "|"
  );
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

const secret = "test-secret-at-least-32-characters-long!!";
const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
const ctx = { challengeId: "c1", uid: "u1", normalizedEmail: "a@b.co", version: 2 };
const digest = digestEmailOtp(secret, code, ctx);
const actual = digestEmailOtp(secret, code, ctx);
assert.equal(timingSafeEqual(Buffer.from(digest), Buffer.from(actual)), true);
assert.notEqual(digest, digestEmailOtp(secret, code, { ...ctx, version: 1 }));
assert.notEqual(digest, createHmac("sha256", secret).update(code).digest("hex"));

console.log("emailOtpPolicy.crypto.test.ts: ok");
