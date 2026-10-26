import assert from "node:assert/strict";

import { continueAfterPhoneProfileTransition } from "@/auth-v2/phoneProfileContinuation";
import {
  __resetAuthSessionFenceForTests,
  beginSessionCommit,
  currentAuthMutationGeneration,
  currentSessionCommitEpoch,
  noteNativeAuthIdentity,
  retireJsAuthBridge,
} from "@/services/auth/authSessionFence";
import { afterPhoneIdentityResolved } from "@/services/auth/phoneOtpEmailTransition";
import {
  commitAfterLocalReadiness,
  openRetainedSession,
  sessionStillOwned,
  type SessionClaim,
  type SessionLive,
} from "@/services/accountDeletion/sessionLocalReadiness";
import { sessionPublicationLive } from "@/services/accountDeletion/sessionPublication";

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function live(nativeUid: string | null, platform = "android"): SessionLive {
  return sessionPublicationLive({
    platform,
    nativeUid: platform === "web" ? null : nativeUid,
    jsUid: platform === "web" ? nativeUid : null,
    generation: currentAuthMutationGeneration(),
    epoch: currentSessionCommitEpoch(),
  });
}

function claimFor(uid: string): SessionClaim {
  return {
    uid,
    generation: currentAuthMutationGeneration(),
    epoch: currentSessionCommitEpoch(),
  };
}

async function main(): Promise<void> {
  const key = new Uint8Array(32);
  key[0] = 9;
  let saved = 0;
  const save = async () => {
    saved += 1;
  };

  __resetAuthSessionFenceForTests();
  noteNativeAuthIdentity("uid-a");
  beginSessionCommit();
  const missingUid = claimFor("uid-a");
  await assert.rejects(
    commitAfterLocalReadiness({
      claim: missingUid,
      readLive: () => live(null),
      prepare: async () => ({ state: "ready", key }),
      save,
    })
  );
  assert.equal(saved, 0);
  assert.equal(sessionStillOwned(missingUid, live(null)), false);

  __resetAuthSessionFenceForTests();
  noteNativeAuthIdentity("uid-a");
  beginSessionCommit();
  const signedOut = claimFor("uid-a");
  await assert.rejects(
    commitAfterLocalReadiness({
      claim: signedOut,
      readLive: () => live("uid-a"),
      prepare: async () => {
        retireJsAuthBridge();
        return { state: "ready", key };
      },
      save,
    })
  );
  assert.equal(saved, 0);

  __resetAuthSessionFenceForTests();
  noteNativeAuthIdentity("uid-a");
  beginSessionCommit();
  const replacedAccount = claimFor("uid-a");
  let nativeUid: string | null = "uid-a";
  await assert.rejects(
    commitAfterLocalReadiness({
      claim: replacedAccount,
      readLive: () => live(nativeUid),
      prepare: async () => {
        nativeUid = "uid-b";
        noteNativeAuthIdentity("uid-b");
        return { state: "ready", key };
      },
      save,
    })
  );
  assert.equal(saved, 0);

  __resetAuthSessionFenceForTests();
  noteNativeAuthIdentity("uid-a");
  beginSessionCommit();
  const sameUid = claimFor("uid-a");
  const generationBefore = currentAuthMutationGeneration();
  await assert.rejects(
    commitAfterLocalReadiness({
      claim: sameUid,
      readLive: () => live("uid-a"),
      prepare: async () => {
        beginSessionCommit();
        return { state: "ready", key };
      },
      save,
    })
  );
  assert.equal(saved, 0);
  assert.equal(currentAuthMutationGeneration(), generationBefore);

  __resetAuthSessionFenceForTests();
  noteNativeAuthIdentity("uid-a");
  beginSessionCommit();
  const readyClaim = claimFor("uid-a");
  await commitAfterLocalReadiness({
    claim: readyClaim,
    readLive: () => live("uid-a"),
    prepare: async () => ({ state: "ready", key }),
    save,
  });
  assert.equal(saved, 1);
  assert.equal(sessionStillOwned(readyClaim, live("uid-a")), true);
  assert.equal(
    sessionPublicationLive({
      platform: "android",
      nativeUid: null,
      jsUid: "uid-a",
      generation: readyClaim.generation,
      epoch: readyClaim.epoch,
    }).uid,
    null
  );
  assert.equal(
    sessionPublicationLive({
      platform: "web",
      nativeUid: null,
      jsUid: "uid-a",
      generation: readyClaim.generation,
      epoch: readyClaim.epoch,
    }).uid,
    "uid-a"
  );

  const stored = { user: { uid: "uid-a" } };
  const retained = ["sealed-row"];
  const held = await openRetainedSession({
    session: stored,
    liveUid: null,
    prepare: async () => ({ state: "unavailable", reason: "key_missing" }),
  });
  assert.equal(held.action, "hold");
  if (held.action === "hold") assert.equal(held.reason, "key_missing");
  assert.deepEqual(retained, ["sealed-row"]);
  const otherAccount = await openRetainedSession({
    session: stored,
    liveUid: "uid-b",
    prepare: async () => {
      throw new Error("must not prepare another account");
    },
  });
  assert.equal(otherAccount.action, "hold");
  const recovered = await openRetainedSession({
    session: stored,
    liveUid: "uid-a",
    prepare: async () => ({ state: "ready", key }),
  });
  assert.equal(recovered.action, "publish");
  assert.deepEqual(retained, ["sealed-row"]);

  __resetAuthSessionFenceForTests();
  noteNativeAuthIdentity("uid-a");
  beginSessionCommit();
  const bridge = deferred<boolean>();
  let bridgeSettled = false;
  void bridge.promise.then(() => {
    bridgeSettled = true;
  });
  const profile = await afterPhoneIdentityResolved({
    resolveAccount: async () => ({ uid: "uid-a" }),
    beginBridge: () => bridge.promise,
  });
  let emailShown = false;
  await continueAfterPhoneProfileTransition({
    route: "email",
    startDeferredConsent: () => new Promise(() => undefined),
    onDeferredConsentRejected: () => undefined,
    markPhoneProven: () => undefined,
    markEmailComplete: async () => undefined,
    markEmailPending: async () => undefined,
    prepareEmailScreen: () => undefined,
    scheduleAfterAcknowledgement: (navigate) => navigate(),
    navigateToApp: () => undefined,
    navigateToBusiness: () => undefined,
    navigateToEmail: () => {
      emailShown = true;
    },
  });
  assert.equal(emailShown, true);
  assert.equal(bridgeSettled, false);
  const publication = claimFor(profile.uid);
  await commitAfterLocalReadiness({
    claim: publication,
    readLive: () => live(profile.uid),
    prepare: async () => ({ state: "ready", key }),
    save,
  });
  assert.equal(saved, 2);
  assert.equal(bridgeSettled, false);
  bridge.resolve(true);
  assert.equal(await bridge.promise, true);

  console.log("sessionLocalReadiness.test.ts: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
