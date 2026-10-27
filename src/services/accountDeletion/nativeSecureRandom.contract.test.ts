/**
 * Production account-key randomness.
 * The host hook is cleared before the expo-crypto path runs.
 */
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  createMemoryLocalKeyStore,
  resolveLocalDataKey,
} from "./localDataKey";
import {
  __setNativeSecureRandomForTests,
  readNativeSecureRandom,
} from "./nativeSecureRandom";
import {
  commitSessionAfterLocalReadiness,
  retainedSessionMayPublish,
} from "../auth/sessionReadiness";

const source = fs.readFileSync(path.join(import.meta.dirname, "nativeSecureRandom.ts"), "utf8");
const authSource = fs.readFileSync(
  path.join(import.meta.dirname, "../../state/auth.tsx"),
  "utf8"
);

function testProductionSource() {
  assert.match(source, /require\("expo-crypto"\)/);
  assert.match(source, /getRandomValues/);
  assert.match(source, /product === "ReactNative"/);
  assert.doesNotMatch(source, /getRandomBytes/);
  assert.doesNotMatch(source, /Math\.random/);
  const saveAt = authSource.indexOf("const saveSession");
  const saveBody = authSource.slice(saveAt, saveAt + 900);
  assert.match(saveBody, /commitSessionAfterLocalReadiness/);
  const bootAt = authSource.indexOf("const session = await sessionStore.load()");
  const bootBody = authSource.slice(bootAt, bootAt + 1800);
  assert.match(bootBody, /retainedSessionMayPublish/);
  assert.match(bootBody, /stillCurrent: bootStillCurrent/);
  assert.doesNotMatch(bootBody, /clearRetainedSession|sessionStore\.clear\(\)/);
  assert.equal(bootBody.indexOf("retainedSessionMayPublish") < bootBody.indexOf('status: "signed_in"'), true);
}

async function testExistingKeyDoesNotNeedRandom() {
  const store = createMemoryLocalKeyStore();
  __setNativeSecureRandomForTests((bytes) => {
    bytes.fill(7);
    return bytes;
  });
  const created = await resolveLocalDataKey(store, "owner-existing");
  assert.equal(created.state, "ready");
  __setNativeSecureRandomForTests(() => {
    throw new Error("random must not run");
  });
  const again = await resolveLocalDataKey(store, "owner-existing");
  assert.equal(again.state, "ready");
  if (created.state === "ready" && again.state === "ready") {
    assert.equal(Buffer.from(again.key).toString("hex"), Buffer.from(created.key).toString("hex"));
  }
}

async function testMissingRandomDoesNotMintOrPublish() {
  __setNativeSecureRandomForTests(() => null);
  const store = createMemoryLocalKeyStore();
  const missing = await resolveLocalDataKey(store, "owner-new");
  assert.equal(missing.state, "unavailable");
  if (missing.state === "unavailable") assert.equal(missing.reason, "secure_random_unavailable");
  const retained = await resolveLocalDataKey(store, "owner-new", { retainedCiphertext: true });
  assert.equal(retained.state, "unavailable");
  if (retained.state === "unavailable") assert.equal(retained.reason, "key_missing");

  let saved = 0;
  await assert.rejects(
    () =>
      commitSessionAfterLocalReadiness({
        userId: "owner-new",
        prepare: async () => missing,
        save: async () => {
          saved += 1;
        },
      }),
    (error: unknown) => error instanceof Error && error.message === "secure_random_unavailable"
  );
  assert.equal(saved, 0);

  const publish = await retainedSessionMayPublish({
    userId: "owner-new",
    prepare: async () => missing,
    stillCurrent: () => true,
  });
  assert.equal(publish, false);
}

async function testReadySessionPublishesAfterPrepare() {
  const order: string[] = [];
  await commitSessionAfterLocalReadiness({
    userId: "owner-ready",
    prepare: async () => {
      order.push("prepare");
      return { state: "ready", key: new Uint8Array(32) };
    },
    save: async () => {
      order.push("save");
    },
  });
  assert.deepEqual(order, ["prepare", "save"]);
  __setNativeSecureRandomForTests((bytes) => {
    webcrypto.getRandomValues(bytes as unknown as Uint8Array<ArrayBuffer>);
    return bytes;
  });
  const bytes = readNativeSecureRandom(32);
  const other = readNativeSecureRandom(32);
  assert.equal(bytes?.length, 32);
  assert.equal(other?.length, 32);
  assert.notEqual(Buffer.from(bytes!).toString("hex"), Buffer.from(other!).toString("hex"));
  __setNativeSecureRandomForTests(null);
  const host = readNativeSecureRandom(32);
  assert.equal(host?.length, 32);
  const previous = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { product: "ReactNative" },
  });
  try {
    assert.equal(readNativeSecureRandom(32), null);
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: previous,
    });
  }
  assert.equal(readNativeSecureRandom(0), null);
}

async function main(): Promise<void> {
  testProductionSource();
  try {
    await testExistingKeyDoesNotNeedRandom();
    await testMissingRandomDoesNotMintOrPublish();
    await testReadySessionPublishesAfterPrepare();
  } finally {
    __setNativeSecureRandomForTests(null);
  }
  console.log("nativeSecureRandom.contract.test.ts: ok");
}

void main();
