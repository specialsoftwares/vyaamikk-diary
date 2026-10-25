/**
 * Mutations of the pending-consent storage key.
 * Reads used to build a patch stay outside the queue. Conditional deletion
 * re-reads inside the same turn as the removal so a newer save cannot be
 * deleted by an older acknowledgement.
 */

import type { PendingLegalConsent } from "@/domain/legalConsent";
import { pendingConsentChoicesEqual } from "@/services/consent/pendingConsentReconcile";

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
    return JSON.parse(raw) as PendingLegalConsent;
  } catch {
    return null;
  }
}

export function loadPendingConsentValue(
  storage: PendingConsentStorage
): Promise<PendingLegalConsent | null> {
  return storage.getItem(PENDING_LEGAL_CONSENT_KEY).then(parsePending);
}

export function savePendingConsentValue(
  storage: PendingConsentStorage,
  value: string
): Promise<void> {
  return enqueue(() => storage.setItem(PENDING_LEGAL_CONSENT_KEY, value));
}

export function clearPendingConsentValue(storage: PendingConsentStorage): Promise<void> {
  return enqueue(() => storage.removeItem(PENDING_LEGAL_CONSENT_KEY));
}

export function clearPendingConsentIfUnchanged(
  storage: PendingConsentStorage,
  snapshot: PendingLegalConsent | null
): Promise<boolean> {
  if (!snapshot) return Promise.resolve(false);
  return enqueue(async () => {
    const current = parsePending(await storage.getItem(PENDING_LEGAL_CONSENT_KEY));
    if (!pendingConsentChoicesEqual(current, snapshot)) return false;
    await storage.removeItem(PENDING_LEGAL_CONSENT_KEY);
    return true;
  });
}
