/**
 * Same-UID replacement and account switching during preparation must not
 * issue the Firestore write. A missing live uid is not an account switch.
 */
import assert from "node:assert/strict";

import { issueProfileDocumentIfOwned, type ProfileWriteLive } from "@/services/auth/profileWriteOwnership";

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const claim = { uid: "uid-a", generation: 4 };

async function expectUnissued(
  duringPrepare: (live: { current: ProfileWriteLive }) => void
): Promise<void> {
  const live = { current: { uid: "uid-a", generation: 4 } as ProfileWriteLive };
  const pause = deferred();
  let writes = 0;
  const pending = issueProfileDocumentIfOwned({
    claim,
    readLive: () => live.current,
    prepare: () => pause.promise,
    setDoc: async () => {
      writes += 1;
    },
  });
  duringPrepare(live);
  pause.resolve();
  await assert.rejects(pending, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "session_changed");
    return true;
  });
  assert.equal(writes, 0);
}

async function main() {
  await expectUnissued((live) => {
    live.current = { uid: "uid-a", generation: 5 };
  });
  await expectUnissued((live) => {
    live.current = { uid: "uid-b", generation: 4 };
  });
  await expectUnissued((live) => {
    live.current = { uid: "uid-b", generation: 9 };
  });

  const live: ProfileWriteLive = { uid: null, generation: 4 };
  let writes = 0;
  await issueProfileDocumentIfOwned({
    claim,
    readLive: () => live,
    prepare: async () => undefined,
    setDoc: async () => {
      writes += 1;
    },
  });
  assert.equal(writes, 1);

  console.log("profileWriteOwnership.test.ts: ok");
}

void main();