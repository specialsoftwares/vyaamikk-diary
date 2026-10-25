/**
 * An older acknowledgement must not delete a newer pending-consent choice.
 * The storage remove waits so a concurrent save can land after the clear's read.
 */
import assert from "node:assert/strict";

import type { PendingLegalConsent } from "@/domain/legalConsent";
import {
  PENDING_LEGAL_CONSENT_KEY,
  clearPendingConsentIfUnchanged,
  clearPendingConsentValue,
  loadPendingConsentValue,
  savePendingConsentValue,
  type PendingConsentStorage,
} from "@/services/consent/pendingConsentKey";

function choice(acceptedAt: number): PendingLegalConsent {
  return {
    phoneE164: "+919999990001",
    record: {
      consentVersion: "1.0.0",
      termsVersion: "1.0.0",
      privacyVersion: "1.0.0",
      effectiveDate: "2026-07-27",
      acceptedAt,
      phoneE164: "+919999990001",
      appVersion: "1.0.0",
      platform: "android",
      sourceScreen: "auth_v2_phone_confirm",
    },
  };
}

function memoryStorage(initial: PendingLegalConsent | null): {
  storage: PendingConsentStorage;
  read: () => PendingLegalConsent | null;
  reads: () => number;
  removes: () => number;
  holdRemove: () => void;
  releaseRemove: () => void;
} {
  let stored = initial ? JSON.stringify(initial) : null;
  let releaseRemove: () => void = () => undefined;
  let removeHeld = false;
  let readCount = 0;
  let removeCount = 0;
  const storage: PendingConsentStorage = {
    async getItem(key) {
      assert.equal(key, PENDING_LEGAL_CONSENT_KEY);
      readCount += 1;
      return stored;
    },
    async setItem(key, value) {
      assert.equal(key, PENDING_LEGAL_CONSENT_KEY);
      stored = value;
    },
    async removeItem(key) {
      assert.equal(key, PENDING_LEGAL_CONSENT_KEY);
      removeCount += 1;
      if (removeHeld) {
        await new Promise<void>((resolve) => {
          releaseRemove = resolve;
        });
      }
      stored = null;
    },
  };
  return {
    storage,
    read: () => (stored ? (JSON.parse(stored) as PendingLegalConsent) : null),
    reads: () => readCount,
    removes: () => removeCount,
    holdRemove: () => {
      removeHeld = true;
    },
    releaseRemove: () => {
      removeHeld = false;
      releaseRemove();
    },
  };
}

async function flushUntil(ready: () => boolean): Promise<void> {
  for (let i = 0; i < 20 && !ready(); i += 1) {
    await Promise.resolve();
  }
  assert.equal(ready(), true);
}

async function main() {
  const older = choice(10);
  const newer = choice(30);
  const raced = memoryStorage(older);
  raced.holdRemove();
  const clearing = clearPendingConsentIfUnchanged(raced.storage, older);
  await flushUntil(() => raced.reads() >= 1);
  const saving = savePendingConsentValue(raced.storage, JSON.stringify(newer));
  await Promise.resolve();
  raced.releaseRemove();
  await clearing;
  await saving;
  assert.equal(raced.read()?.record.acceptedAt, newer.record.acceptedAt);

  const settled = memoryStorage(newer);
  const removed = await clearPendingConsentIfUnchanged(settled.storage, older);
  assert.equal(removed, false);
  assert.equal(settled.read()?.record.acceptedAt, newer.record.acceptedAt);

  const replaced = memoryStorage(older);
  replaced.holdRemove();
  const clearingAll = clearPendingConsentValue(replaced.storage);
  await flushUntil(() => replaced.removes() >= 1);
  const savingAfterClear = savePendingConsentValue(replaced.storage, JSON.stringify(newer));
  await Promise.resolve();
  replaced.releaseRemove();
  await clearingAll;
  await savingAfterClear;
  assert.equal(replaced.read()?.record.acceptedAt, newer.record.acceptedAt);

  const loaded = await loadPendingConsentValue(settled.storage);
  assert.equal(loaded?.record.acceptedAt, newer.record.acceptedAt);

  console.log("pendingConsentClearRace.test.ts: ok");
}

void main();
