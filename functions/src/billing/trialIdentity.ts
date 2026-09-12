/**
 * Vyaamikk Diary — durable trial-identity derivation (Phase A).
 *
 * Owner decision W-4: the one-trial-per-person ledger `_trialLedger/{id}` is
 * keyed by
 *
 *   HMAC-SHA256(TRIAL_IDENTITY_SECRET, normalizeE164(phone))
 *
 * NOT plain/unsalted SHA-256 and NOT SHA-256(publicSalt + phone): with a
 * keyed HMAC, possession of the ledger alone (or of the tiny E.164 keyspace)
 * is insufficient to link an entry back to a phone number without the secret.
 *
 * The ledger stores only the resulting HMAC identifier — never a raw phone.
 * Its purpose is prevention of repeat-trial abuse, and it deliberately
 * SURVIVES normal account deletion (deletion frees phoneIndex and mints a new
 * uid/UEID on re-signup; this identifier is the only durable key).
 *
 * Pure utility: the caller supplies the secret (Phase B binds the
 * TRIAL_IDENTITY_SECRET Secret Manager parameter; it is never committed).
 * This module never logs, and callers must never log, the raw or normalized
 * phone number alongside billing flows.
 */

import { createHmac } from "node:crypto";

import { normalizePhoneE164 } from "../identity/shared";

/** Minimum length guard so a misconfigured empty/short secret fails closed. */
export const TRIAL_IDENTITY_SECRET_MIN_LENGTH = 32;

/**
 * Derives the durable trial-identity id (lowercase hex, 64 chars) for a
 * phone number. Throws on a missing/short secret or unusable phone input —
 * never silently degrades to a weaker key.
 */
export function trialIdentityHmac(trialIdentitySecret: string, phone: string): string {
  if (
    typeof trialIdentitySecret !== "string" ||
    trialIdentitySecret.length < TRIAL_IDENTITY_SECRET_MIN_LENGTH
  ) {
    throw new Error(
      `TRIAL_IDENTITY_SECRET must be at least ${TRIAL_IDENTITY_SECRET_MIN_LENGTH} characters`
    );
  }
  const normalized = normalizePhoneE164(phone);
  return createHmac("sha256", trialIdentitySecret).update(normalized, "utf8").digest("hex");
}
