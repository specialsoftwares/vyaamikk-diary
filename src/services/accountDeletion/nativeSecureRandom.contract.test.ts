/**
 * Production account-key randomness.
 * The host hook is cleared before the expo-crypto path runs.
 */
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

import {
  createMemoryLocalKeyStore,
  resolveLocalDataKey,
} from "./localDataKey";
import {
  __setNativeSecureRandomForTests,
  readNativeSecureRandom,
} from "./nativeSecureRandom";
import {
  commitAfterLocalReadiness,
  openRetainedSession,
} from "./sessionLocalReadiness";

const dirname = fileURLToPath(new URL(".", import.meta.url));
const claim = { uid: "owner-new", generation: 1, epoch: 1 };

const source = fs.readFileSync(path.join(dirname, "nativeSecureRandom.ts"), "utf8");
const authSource = fs.readFileSync(
  path.join(dirname, "../../state/auth.tsx"),
  "utf8"
);

function testProductionSource() {
  assert.match(source, /require\("expo-crypto"\)/);
  assert.match(source, /getRandomValues/);
  const implementation = source.slice(source.indexOf("export function readNativeSecureRandom"));
  assert.doesNotMatch(implementation, /globalThis\.crypto/);
  assert.doesNotMatch(implementation, /getRandomBytes/);
  assert.doesNotMatch(implementation, /Math\.random/);
  const saveAt = authSource.indexOf("const saveSession");
  assert.match(authSource.slice(saveAt, saveAt + 3000), /commitAfterLocalReadiness/);
  const bootAt = authSource.indexOf("const session = await sessionStore.load()");
  const bootBody = authSource.slice(bootAt, bootAt + 1800);
  assert.match(bootBody, /openRetainedSession/);
  assert.match(bootBody, /if \(!bootStillCurrent\(\)\) return/);
  assert.doesNotMatch(bootBody, /clearRetainedSession|sessionStore\.clear\(\)/);
  assert.equal(bootBody.indexOf("openRetainedSession") < bootBody.indexOf('status: "signed_in"'), true);
}

async function testExistingKeyDoesNotNeedRandom() {
  const store = createMemoryLocalKeyStore();
  __setNativeSecureRandomForTests((length) => new Uint8Array(length).fill(7));
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
  __setNativeSecureRandomForTests(() => { throw new Error("random unavailable"); });
  const store = createMemoryLocalKeyStore();
  await assert.rejects(resolveLocalDataKey(store, "owner-new"), (error: unknown) =>
    error instanceof Error && (error as Error & { reason?: string }).reason === "secure_random_unavailable");
  const missing = { state: "unavailable", reason: "secure_random_unavailable" } as const;
  const retained = await resolveLocalDataKey(store, "owner-new", { retainedCiphertext: true });
  assert.equal(retained.state, "unavailable");
  if (retained.state === "unavailable") assert.equal(retained.reason, "key_missing");

  let saved = 0;
  await assert.rejects(
    () =>
      commitAfterLocalReadiness({
        claim, readLive: () => claim,
        prepare: async () => missing,
        save: async () => {
          saved += 1;
        },
      }),
    (error: unknown) => error instanceof Error && (error as Error & { reason?: string }).reason === "secure_random_unavailable"
  );
  assert.equal(saved, 0);

  const publish = await openRetainedSession({
    session: { user: { uid: claim.uid } }, liveUid: claim.uid,
    prepare: async () => missing,
  });
  assert.deepEqual(publish, { action: "hold", reason: "secure_random_unavailable" });
}

async function testReadySessionPublishesAfterPrepare() {
  const order: string[] = [];
  await commitAfterLocalReadiness({
    claim, readLive: () => claim,
    prepare: async () => {
      order.push("prepare");
      return { state: "ready", key: new Uint8Array(32) };
    },
    save: async () => {
      order.push("save");
    },
  });
  assert.deepEqual(order, ["prepare", "save"]);
  __setNativeSecureRandomForTests((length) => {
    const bytes = new Uint8Array(length);
    webcrypto.getRandomValues(bytes as unknown as Uint8Array<ArrayBuffer>);
    return bytes;
  });
  const bytes = readNativeSecureRandom(32);
  const other = readNativeSecureRandom(32);
  assert.equal(bytes.ok, true);
  assert.equal(other.ok, true);
  if (bytes.ok && other.ok) {
    assert.equal(bytes.bytes.length, 32);
    assert.equal(other.bytes.length, 32);
    assert.notEqual(Buffer.from(bytes.bytes).toString("hex"), Buffer.from(other.bytes).toString("hex"));
  }
  __setNativeSecureRandomForTests(null);
  // Host cannot load Expo's native module: fail closed rather than using host
  // WebCrypto as evidence of the Android production randomness path.
  assert.equal(readNativeSecureRandom(32).ok, false);
  assert.equal(readNativeSecureRandom(0).ok, false);
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
