/**
 * Mutations of the pending-consent storage key.
 * Reads used to build a patch stay outside the queue. Conditional deletion
 * re-reads inside the same turn as the removal so a newer save cannot be
 * deleted by an older acknowledgement.
 */

import type { PendingLegalConsent } from "@/domain/legalConsent";
import { pendingConsentChoicesEqual } from "@/services/consent/pendingConsentReconcile";
import { readNativeSecureRandom } from "@/services/accountDeletion/nativeSecureRandom";

export const PENDING_LEGAL_CONSENT_KEY = "vyd_pending_legal_consent_v1";

export type PendingConsentStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

let tail: Promise<void> = Promise.resolve();

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const run = tail.then(work, work);
  tail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function parsePending(raw: string | null): PendingLegalConsent | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    // Accept the previous main branch's numeric/string envelopes without
    // treating their generation as the identity of a new choice.
    const pending = value?.pending ?? value;
    if (typeof pending?.phoneE164 !== "string" || !pending.record ||
        typeof pending.record.consentVersion !== "string" ||
        !Number.isFinite(pending.record.acceptedAt)) return null;
    return pending as PendingLegalConsent;
  } catch {
    return null;
  }
}

function revision(): string {
  const random = readNativeSecureRandom(16);
  if (!random.ok) throw new Error("consent_choice_identity_unavailable");
  return Array.from(random.bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function loadPendingConsentValue(
  storage: PendingConsentStorage
): Promise<PendingLegalConsent | null> {
  return enqueue(async () => {
    const pending = parsePending(await storage.getItem(PENDING_LEGAL_CONSENT_KEY));
    if (!pending) return null;
    if (typeof pending.choiceRevision === "string" && /^[a-f0-9]{32}$/.test(pending.choiceRevision)) return pending;
    const upgraded = { ...pending, choiceRevision: revision() };
    await storage.setItem(PENDING_LEGAL_CONSENT_KEY, JSON.stringify(upgraded));
    return upgraded;
  });
}

export function savePendingConsentValue(
  storage: PendingConsentStorage,
  value: string
): Promise<PendingLegalConsent> {
  return enqueue(async () => {
    const pending = parsePending(value);
    if (!pending) throw new Error("invalid_pending_consent");
    const saved = { ...pending, choiceRevision: revision() };
    await storage.setItem(PENDING_LEGAL_CONSENT_KEY, JSON.stringify(saved));
    return saved;
  });
}

export function clearPendingConsentValue(storage: PendingConsentStorage): Promise<void> {
  return enqueue(() => storage.removeItem(PENDING_LEGAL_CONSENT_KEY));
}

export function clearPendingConsentIfUnchanged(
  storage: PendingConsentStorage,
  snapshot: PendingLegalConsent | null,
  owns: () => boolean = () => true
): Promise<boolean> {
  if (!snapshot) return Promise.resolve(false);
  return enqueue(async () => {
    const current = parsePending(await storage.getItem(PENDING_LEGAL_CONSENT_KEY));
    if (!owns() || !snapshot.choiceRevision || current?.choiceRevision !== snapshot.choiceRevision ||
        !pendingConsentChoicesEqual(current, snapshot)) return false;
    await storage.removeItem(PENDING_LEGAL_CONSENT_KEY);
    return true;
  });
}
