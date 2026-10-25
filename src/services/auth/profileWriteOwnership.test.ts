/**
 * Same-UID replacement, account switching, and a disappeared identity during
 * preparation must not issue the Firestore write. A matching live UID and
 * generation still issues it.
 */
import assert from "node:assert/strict";

import {
  authoritativeProfileWriteUid,
  issueProfileDocumentIfOwned,
  type ProfileWriteLive,
} from "@/services/auth/profileWriteOwnership";

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
  await expectUnissued((live) => {
    live.current = { uid: null, generation: 4 };
  });

  const live: ProfileWriteLive = { uid: "uid-a", generation: 4 };
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

  assert.equal(
    authoritativeProfileWriteUid({ platform: "ios", nativeUid: null, jsUid: "uid-js" }),
    null
  );
  assert.equal(
    authoritativeProfileWriteUid({ platform: "web", nativeUid: null, jsUid: "uid-js" }),
    "uid-js"
  );
  assert.equal(
    authoritativeProfileWriteUid({ platform: null, nativeUid: "uid-a", jsUid: "uid-js" }),
    null
  );

  console.log("profileWriteOwnership.test.ts: ok");
}

void main();