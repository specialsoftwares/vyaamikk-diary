import assert from "node:assert/strict";

import {
  __setNativeAuthForTests,
  ensureNativeAuthReadyForCallables,
  retireNativeCallableAuthReady,
} from "./nativeCallableAuthGate";

async function main(): Promise<void> {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };
  process.on("unhandledRejection", onUnhandled);
  const failure = new Error("token unavailable");
  __setNativeAuthForTests(() => ({
    currentUser: {
      uid: "owner-a",
      getIdToken: async () => {
        throw failure;
      },
    },
    app: { name: "[DEFAULT]", options: { projectId: "test" } },
    onAuthStateChanged: () => () => undefined,
  }));

  const first = await ensureNativeAuthReadyForCallables().then(
    () => "resolved",
    (error: unknown) => error
  );
  assert.equal(first, failure);
  const second = await ensureNativeAuthReadyForCallables().then(
    () => "resolved",
    (error: unknown) => error
  );
  assert.equal(second, failure);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(unhandled.length, 0);

  process.off("unhandledRejection", onUnhandled);
  retireNativeCallableAuthReady();
  __setNativeAuthForTests(undefined);
  process.stdout.write("nativeCallableAuthGate.cleanup.test.ts: ok\n");
}

void main();
