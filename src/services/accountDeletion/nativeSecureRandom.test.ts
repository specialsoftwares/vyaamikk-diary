/**
 * Account keys and AES-GCM nonces come from the expo-crypto adapter.
 * Host global crypto is present and must not be the source.
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { randomFillSync } from "node:crypto";

import { toPublicError } from "@/domain/publicErrors";
import {
  LocalKeyUnavailable,
  createMemoryLocalKeyStore,
  openLocalTextSync,
  resolveLocalDataKey,
  sealLocalTextSync,
} from "@/services/accountDeletion/localDataKey";

const originalRequire = Module.prototype.require;

function installAdapter(getRandomValues: (bytes: Uint8Array) => Uint8Array): void {
  Module.prototype.require = function (this: unknown, id: string) {
    if (id === "expo-crypto") return { getRandomValues };
    return originalRequire.apply(this, [id]);
  } as typeof Module.prototype.require;
}

function restoreAdapter(): void {
  Module.prototype.require = originalRequire;
}

async function main(): Promise<void> {
  const host = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  let hostCalls = 0;
  let mathCalls = 0;
  const lengths: number[] = [];
  const originalMath = Math.random;
  globalThis.crypto.getRandomValues = ((bytes: Uint8Array) => {
    hostCalls += 1;
    return host(bytes);
  }) as typeof globalThis.crypto.getRandomValues;
  Math.random = () => {
    mathCalls += 1;
    return originalMath();
  };

  installAdapter((bytes) => {
    lengths.push(bytes.byteLength);
    randomFillSync(bytes);
    return bytes;
  });
  try {
    const store = createMemoryLocalKeyStore();
    const created = await resolveLocalDataKey(store, "owner-adapter");
    assert.equal(created.state, "ready");
    if (created.state !== "ready") throw new Error("key");
    assert.equal(created.key.byteLength, 32);
    const sealed = sealLocalTextSync(created.key, "site note");
    assert.equal(openLocalTextSync(created.key, sealed), "site note");
    const parsed = JSON.parse(sealed) as { v?: number; iv?: string; ciphertext?: string };
    assert.equal(parsed.v, 1);
    assert.equal(typeof parsed.iv, "string");
    assert.equal(typeof parsed.ciphertext, "string");
    assert.deepEqual(lengths, [32, 12]);
    assert.equal(hostCalls, 0);
    assert.equal(mathCalls, 0);

    installAdapter(() => {
      throw new Error("native module missing");
    });
    const blocked = createMemoryLocalKeyStore();
    await assert.rejects(resolveLocalDataKey(blocked, "owner-blocked"), (error: unknown) => {
      assert.ok(error instanceof LocalKeyUnavailable);
      assert.equal(error.reason, "secure_random_unavailable");
      assert.match(toPublicError(error).message, /secure storage/i);
      assert.equal(toPublicError(error).message.includes("secure_"), false);
      assert.equal(toPublicError(error).message.includes("native module"), false);
      return true;
    });
    const again = await blocked.get("owner-blocked");
    assert.equal(again, null);
    assert.equal(hostCalls, 0);
  } finally {
    restoreAdapter();
    globalThis.crypto.getRandomValues = host;
    Math.random = originalMath;
  }
  console.log("nativeSecureRandom.test.ts: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
