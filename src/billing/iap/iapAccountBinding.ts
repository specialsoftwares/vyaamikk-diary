/**
 * Server-issued store account binding checks. Pure — no Firebase.
 */

import { AppError } from "@/domain/errors";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidAppAccountToken(value: string): boolean {
  return UUID_RE.test(value);
}

export function assertServerObfuscatedAccountId(args: {
  obfuscatedAccountId: string;
  uid: string;
}): string {
  const id = args.obfuscatedAccountId.trim();
  if (!id) {
    throw new AppError("unknown", "Billing account is not ready.");
  }
  if (id === args.uid) {
    throw new AppError("unknown", "Billing account is not ready.");
  }
  if (id.includes("@") || /^\+?\d{10,15}$/.test(id)) {
    throw new AppError("unknown", "Billing account is not ready.");
  }
  return id;
}
