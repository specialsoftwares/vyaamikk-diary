/**
 * Retained sessions survive a temporary key failure.
 * A stale attempt cannot publish or erase the session that replaced it.
 */
import assert from "node:assert/strict";

import {
  commitSessionAfterLocalReadiness,
  retainedSessionMayPublish,
} from "./sessionReadiness";

type StoredSession = { id: string; uid: string };

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function testUnavailableKeepsSessionAndLaterRestoreUsesIt() {
  const retained: StoredSession = { id: "session-a", uid: "uid-a" };
  const store: { session: StoredSession | null } = { session: retained };

  const withheld = await retainedSessionMayPublish({
    userId: retained.uid,
    prepare: async () => ({ state: "unavailable", reason: "secure_store_unavailable" }),
    stillCurrent: () => store.session?.id === "session-a",
  });
  assert.equal(withheld, false);
  assert.equal(store.session?.id, "session-a");

  const restored = await retainedSessionMayPublish({
    userId: "uid-a",
    prepare: async () => ({ state: "ready", key: new Uint8Array(32) }),
    stillCurrent: () => store.session?.id === "session-a",
  });
  assert.equal(restored, true);
  assert.equal(store.session?.id, retained.id);
  assert.equal(store.session?.uid, retained.uid);
}

async function testStalePreparationCannotPublishOrClearReplacement() {
  const store: { session: StoredSession | null } = {
    session: { id: "session-a", uid: "uid-a" },
  };
  let ownsA = true;
  const accountChange = deferred<{ state: "ready"; key: Uint8Array }>();
  const signOut = deferred<{ state: "unavailable"; reason: "secure_store_unavailable" }>();

  const changed = retainedSessionMayPublish({
    userId: "uid-a",
    prepare: () => accountChange.promise,
    stillCurrent: () => ownsA && store.session?.id === "session-a",
  });
  const signedOut = retainedSessionMayPublish({
    userId: "uid-a",
    prepare: () => signOut.promise,
    stillCurrent: () => ownsA && store.session?.uid === "uid-a",
  });

  store.session = { id: "session-b", uid: "uid-b" };
  ownsA = false;
  accountChange.resolve({ state: "ready", key: new Uint8Array(32) });
  signOut.resolve({ state: "unavailable", reason: "secure_store_unavailable" });

  assert.equal(await changed, false);
  assert.equal(await signedOut, false);
  assert.deepEqual(store.session, { id: "session-b", uid: "uid-b" });
}

async function testNewSessionWaitsForReadyPreparation() {
  const store: { session: StoredSession | null } = { session: null };
  let saves = 0;
  await assert.rejects(
    () =>
      commitSessionAfterLocalReadiness({
        userId: "uid-a",
        prepare: async () => ({ state: "unavailable", reason: "secure_random_unavailable" }),
        stillCurrent: () => true,
        save: async () => {
          saves += 1;
          store.session = { id: "session-a", uid: "uid-a" };
        },
      }),
    (error: unknown) => error instanceof Error && error.message === "secure_random_unavailable"
  );
  assert.equal(saves, 0);
  assert.equal(store.session === null, true);

  const order: string[] = [];
  await commitSessionAfterLocalReadiness({
    userId: "uid-a",
    prepare: async () => {
      order.push("prepare");
      return { state: "ready", key: new Uint8Array(32) };
    },
    stillCurrent: () => true,
    save: async () => {
      order.push("save");
      store.session = { id: "session-a", uid: "uid-a" };
    },
  });
  assert.deepEqual(order, ["prepare", "save"]);
  assert.equal(store.session?.id, "session-a");

  let ownsOld = true;
  const late = deferred<{ state: "ready"; key: Uint8Array }>();
  const stale = commitSessionAfterLocalReadiness({
    userId: "uid-a",
    prepare: () => late.promise,
    stillCurrent: () => ownsOld,
    save: async () => {
      store.session = { id: "session-a", uid: "uid-a" };
    },
  });
  ownsOld = false;
  store.session = { id: "session-c", uid: "uid-c" };
  late.resolve({ state: "ready", key: new Uint8Array(32) });
  await assert.rejects(stale, (error: unknown) => error instanceof Error && error.message === "session_changed");
  assert.deepEqual(store.session, { id: "session-c", uid: "uid-c" });
}

async function main(): Promise<void> {
  await testUnavailableKeepsSessionAndLaterRestoreUsesIt();
  await testStalePreparationCannotPublishOrClearReplacement();
  await testNewSessionWaitsForReadyPreparation();
  console.log("sessionReadiness.contract.test.ts: ok");
}

void main();
