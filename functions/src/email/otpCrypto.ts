import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { EMAIL_OTP_LENGTH } from "./otpPolicy";

export interface OtpDigestContext {
  challengeId: string;
  uid: string;
  normalizedEmail: string;
  version: number;
}

/** Cryptographically secure 6-digit OTP (000000–999999). */
export function generateEmailOtpCode(): string {
  const n = randomInt(0, 1_000_000);
  return n.toString().padStart(EMAIL_OTP_LENGTH, "0");
}

export function digestEmailOtp(
  secret: string,
  code: string,
  ctx: OtpDigestContext
): string {
  const payload = [
    ctx.challengeId,
    ctx.uid,
    ctx.normalizedEmail,
    String(ctx.version),
    code.trim(),
  ].join("|");
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function verifyEmailOtpDigest(
  secret: string,
  code: string,
  ctx: OtpDigestContext,
  expectedDigest: string
): boolean {
  const actual = digestEmailOtp(secret, code, ctx);
  const a = Buffer.from(actual, "utf8");
  const b = Buffer.from(expectedDigest, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
