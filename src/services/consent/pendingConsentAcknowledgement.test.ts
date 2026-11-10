import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { __setNativeSecureRandomForTests } from "@/services/accountDeletion/nativeSecureRandom";
import type { PendingLegalConsent } from "@/domain/legalConsent";
import { clearPendingConsentIfUnchanged, clearPendingConsentValue, loadPendingConsentValue, savePendingConsentValue, type PendingConsentStorage } from "./pendingConsentKey";
let storage: PendingConsentStorage;
const useStorage = (next: PendingConsentStorage) => { storage = next; };
const loadPendingConsent = () => loadPendingConsentValue(storage);
const clearPendingConsent = () => clearPendingConsentValue(storage);
const acknowledgePendingConsentPersisted = (snapshot: PendingLegalConsent, owns?: () => boolean) => clearPendingConsentIfUnchanged(storage, snapshot, owns);
const serializePendingConsentSave = (phoneE164: string, sourceScreen: string) => savePendingConsentValue(storage, JSON.stringify({ phoneE164, record: {
  consentVersion: "v1", termsVersion: "v1", privacyVersion: "v1", effectiveDate: "2026-01-01", acceptedAt: 1,
  appVersion: "1", platform: "android", sourceScreen,
} }));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function memoryKv() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key: string) => data.get(key) ?? null,
    setItem: async (key: string, value: string) => { data.set(key, value); },
    removeItem: async (key: string) => { data.delete(key); },
  };
}

async function main() {
  __setNativeSecureRandomForTests((length) => new Uint8Array(randomBytes(length)));
  const kv = memoryKv();
  useStorage(kv);
  const older = await serializePendingConsentSave("+910000000001", "first-choice");
  assert.equal(await acknowledgePendingConsentPersisted(older), true);
  const newer = await serializePendingConsentSave("+910000000002", "second-choice");
  assert.equal(await acknowledgePendingConsentPersisted(older), false,
    "a late acknowledgement after clear/save must not remove another owner's new choice");
  assert.equal((await loadPendingConsent())?.record.sourceScreen, "second-choice");
  assert.equal(await acknowledgePendingConsentPersisted(newer), true);

  const sameOwnerOlder = await serializePendingConsentSave("+910000000001", "same-choice");
  await clearPendingConsent();
  const sameOwnerNewer = await serializePendingConsentSave("+910000000001", "same-choice");
  assert.equal(await acknowledgePendingConsentPersisted(sameOwnerOlder), false);
  assert.ok(await loadPendingConsent());
  assert.equal(await acknowledgePendingConsentPersisted(sameOwnerNewer), true);

  // A process/storage reset does not give a later, otherwise identical choice
  // the identity of an acknowledgement still held by an earlier caller.
  const beforeReset = await serializePendingConsentSave("+910000000001", "same-choice");
  kv.data.clear();
  useStorage(kv);
  const afterReset = await serializePendingConsentSave("+910000000001", "same-choice");
  assert.equal(await acknowledgePendingConsentPersisted(beforeReset), false);
  assert.equal(await acknowledgePendingConsentPersisted(afterReset), true);

  // Owner and payload matching remain required even if a caller holds an ID.
  const exact = await serializePendingConsentSave("+910000000001", "bound-choice");
  assert.equal(await acknowledgePendingConsentPersisted({ ...exact, phoneE164: "+910000000002" }), false);
  assert.equal(await acknowledgePendingConsentPersisted({ ...exact, record: { ...exact.record, sourceScreen: "different-choice" } }), false);
  assert.equal(await acknowledgePendingConsentPersisted(exact), true);

  // All mutation entry points share one queue: a requested wipe must finish
  // after an already-issued save, rather than allowing that save to resurrect.
  const saveStarted = deferred();
  const releaseSave = deferred();
  useStorage({
    ...kv,
    setItem: async (key, value) => {
      saveStarted.resolve();
      await releaseSave.promise;
      await kv.setItem(key, value);
    },
  });
  const heldSave = serializePendingConsentSave("+910000000001", "held-save");
  await saveStarted.promise;
  const clearAfterSave = clearPendingConsent();
  releaseSave.resolve();
  await Promise.all([heldSave, clearAfterSave]);
  assert.equal(await loadPendingConsent(), null);

  useStorage(kv);
  const heldAck = await serializePendingConsentSave("+910000000001", "held-ack");
  const readStarted = deferred();
  const releaseRead = deferred();
  let currentSession = true;
  useStorage({
    ...kv,
    getItem: async (key) => {
      const captured = await kv.getItem(key);
      readStarted.resolve();
      await releaseRead.promise;
      return captured;
    },
  });
  const acknowledgement = acknowledgePendingConsentPersisted(heldAck, () => currentSession);
  await readStarted.promise;
  currentSession = false;
  releaseRead.resolve();
  assert.equal(await acknowledgement, false, "session replacement during queued read cannot clear consent");
  assert.ok(await loadPendingConsent());

  // Existing numeric/raw envelopes are upgraded in the same mutation queue.
  useStorage(kv);
  const stored = await loadPendingConsent();
  assert.ok(stored);
  await kv.setItem("vyd_pending_legal_consent_v1", JSON.stringify({ generation: 1, pending: stored }));
  const [legacyA, legacyB] = await Promise.all([loadPendingConsent(), loadPendingConsent()]);
  assert.ok(legacyA?.choiceRevision);
  assert.equal(legacyA.choiceRevision, legacyB?.choiceRevision);
  assert.equal(await acknowledgePendingConsentPersisted(legacyA), true);

  console.log("pendingConsentAcknowledgement.test.ts: ok");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
