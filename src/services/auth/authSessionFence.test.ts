/**
 * SOURCE — auth mutation fence and bridge races with deferred adapters.
 * Run: npm run test:auth-session-security
 */

import {
  __resetAuthSessionFenceForTests,
  cleanBothAuthSdks,
  clearPersistedProfileIfOwned,
  currentAuthMutationGeneration,
  noteNativeAuthIdentity,
  retireJsAuthBridge,
  runLocalDeviceSignOut,
} from "./authSessionFence";
import { bridgeNativeSession } from "./jsAuthBridge";
import { AppError } from "@/domain/errors";
import {
  classifyLogoutAllCallableFailure,
  LOGOUT_ALL_CONTROL_ENABLED,
  newLogoutOperationId,
  orchestrateConfirmedLogoutAll,
  requestLogoutAllDevices,
  runConfirmedLogoutAll,
  type LogoutAllIdentity,
  type LogoutAllRemoteOutcome,
} from "./logoutAllDevices";

let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ok - ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL - ${name}${detail ? ` (${detail})` : ""}`);
  }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function main() {
  console.log("auth session fence (SOURCE)");

  __resetAuthSessionFenceForTests();
  {
    const mint = deferred<string>();
    const mintEntered = deferred<void>();
    let signedIn = 0;
    const attempt = bridgeNativeSession({
      getNativeUid: () => "uid-a",
      getJsUid: () => null,
      mint: () => {
        mintEntered.resolve();
        return mint.promise;
      },
      signIn: async () => {
        signedIn += 1;
        return "uid-a";
      },
      signOutJs: async () => undefined,
    });
    await mintEntered.promise;
    const retired = retireJsAuthBridge();
    let nativeCleared = false;
    const cleanup = cleanBothAuthSdks(retired, {
      signOutJs: async () => undefined,
      signOutNative: async () => {
        nativeCleared = true;
      },
    });
    mint.resolve("minted-after-logout");
    const bridged = await attempt;
    const cleaned = await cleanup;
    check("delayed mint after logout does not exchange", bridged === false && signedIn === 0);
    check("logout still clears native auth", nativeCleared && cleaned.nativeCleared);
  }

  __resetAuthSessionFenceForTests();
  {
    let nativeUid = "uid-a";
    const mint = deferred<string>();
    const mintEntered = deferred<void>();
    let signedInUid: string | null = null;
    const attempt = bridgeNativeSession({
      getNativeUid: () => nativeUid,
      getJsUid: () => signedInUid,
      mint: () => {
        mintEntered.resolve();
        return mint.promise;
      },
      signIn: async () => {
        signedInUid = "uid-a";
        return "uid-a";
      },
      signOutJs: async () => {
        signedInUid = null;
      },
    });
    await mintEntered.promise;
    nativeUid = "uid-b";
    mint.resolve("token-a");
    const bridged = await attempt;
    check("A to B does not publish A's custom token", bridged === false && signedInUid === null);
  }

  __resetAuthSessionFenceForTests();
  {
    const mint = deferred<string>();
    const mintEntered = deferred<void>();
    let signedIn = 0;
    const attempt = bridgeNativeSession({
      getNativeUid: () => "uid-a",
      getJsUid: () => null,
      mint: () => {
        mintEntered.resolve();
        return mint.promise;
      },
      signIn: async () => {
        signedIn += 1;
        return "uid-a";
      },
      signOutJs: async () => undefined,
    });
    await mintEntered.promise;
    retireJsAuthBridge();
    mint.resolve("old-generation");
    const bridged = await attempt;
    check("same uid new generation does not exchange", bridged === false && signedIn === 0);
  }

  __resetAuthSessionFenceForTests();
  {
    let nativeCalled = false;
    const retired = retireJsAuthBridge();
    const cleaned = await cleanBothAuthSdks(retired, {
      signOutJs: async () => {
        throw new Error("js sign-out failed");
      },
      signOutNative: async () => {
        nativeCalled = true;
      },
    });
    check(
      "JS sign-out failure still clears native auth",
      nativeCalled && cleaned.jsCleared === false && cleaned.nativeCleared
    );
  }

  __resetAuthSessionFenceForTests();
  {
    const first = retireJsAuthBridge();
    let erased = false;
    const cleanup = cleanBothAuthSdks(first, {
      signOutJs: async () => {
        erased = true;
      },
      signOutNative: async () => {
        erased = true;
      },
    });
    retireJsAuthBridge();
    const cleaned = await cleanup;
    check(
      "old cleanup does not erase a newer login",
      erased === false && cleaned.skippedBecauseNewerSession
    );
  }

  __resetAuthSessionFenceForTests();
  {
    let jsUid: string | null = null;
    let nativeUid = "uid-a";
    const mint = deferred<string>();
    const mintEntered = deferred<void>();
    const attempt = bridgeNativeSession({
      getNativeUid: () => nativeUid,
      getJsUid: () => jsUid,
      mint: () => {
        mintEntered.resolve();
        return mint.promise;
      },
      signIn: async () => {
        retireJsAuthBridge();
        nativeUid = "uid-a";
        jsUid = "uid-a";
        return "uid-a";
      },
      signOutJs: async () => {
        jsUid = null;
      },
    });
    await mintEntered.promise;
    mint.resolve("stale");
    const bridged = await attempt;
    check("stale exchange undoes itself and leaves no JS user", bridged === false && jsUid === null);
  }

  __resetAuthSessionFenceForTests();
  {
    const order: string[] = [];
    const gate = deferred<void>();
    const done = runLocalDeviceSignOut({
      maskPrivateUi: () => order.push("mask"),
      retireCloudAdmission: () => {
        order.push("retire");
        retireJsAuthBridge();
      },
      cleanAuthSdks: async () => {
        order.push("clean");
        await gate.promise;
      },
      clearLocalProfileCache: async () => {
        order.push("profile");
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    check(
      "UI mask and admission retire happen before SDK cleanup",
      order[0] === "mask" && order[1] === "retire" && order[2] === "clean" && order.length === 3
    );
    check("admission generation is retired before cleanup finishes", currentAuthMutationGeneration() > 0);
    gate.resolve();
    await done;
    check("profile cache clear follows SDK cleanup", order[3] === "profile");
  }

  const offline = await requestLogoutAllDevices({
    online: false,
    operationId: "op-1",
    call: async () => {
      throw new Error("must not be called offline");
    },
  });
  check("offline logout-all is unavailable and does not claim success", offline.remote === "unavailable");

  const operationId = newLogoutOperationId();
  check(
    "logout operation id is a uuid",
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)
  );
  let unconfirmedCalls = 0;
  let unconfirmedClears = 0;
  const unconfirmed = await runConfirmedLogoutAll({
    confirmed: false,
    online: true,
    operationId,
    call: async () => {
      unconfirmedCalls += 1;
      return { status: "complete" };
    },
    clearThisDevice: async () => {
      unconfirmedClears += 1;
    },
  });
  check(
    "unconfirmed logout-all does not call or clear this device",
    unconfirmed.kind === "not_confirmed" && unconfirmedCalls === 0 && unconfirmedClears === 0
  );

  let offlineCalls = 0;
  let offlineClears = 0;
  const offlineConfirmed = await runConfirmedLogoutAll({
    confirmed: true,
    online: false,
    operationId,
    call: async () => {
      offlineCalls += 1;
      return { status: "complete" };
    },
    clearThisDevice: async () => {
      offlineClears += 1;
    },
  });
  check(
    "offline confirmation clears only this device",
    offlineConfirmed.kind === "offline" && offlineCalls === 0 && offlineClears === 1
  );

  const cases: { status: "complete" | "pending" | "superseded" | "not_recent"; kind: string }[] = [
    { status: "complete", kind: "complete" },
    { status: "pending", kind: "pending" },
    { status: "superseded", kind: "superseded" },
    { status: "not_recent", kind: "not_recent" },
  ];
  for (const item of cases) {
    let clears = 0;
    const result = await runConfirmedLogoutAll({
      confirmed: true,
      online: true,
      operationId,
      call: async () => ({ status: item.status }),
      clearThisDevice: async () => {
        clears += 1;
      },
    });
    check(`confirmed ${item.status} clears this device`, result.kind === item.kind && clears === 1);
  }

  let throwClears = 0;
  const thrown = await runConfirmedLogoutAll({
    confirmed: true,
    online: true,
    operationId,
    call: async () => {
      throw new Error("network");
    },
    clearThisDevice: async () => {
      throwClears += 1;
    },
  });
  check(
    "a failed remote call still clears this device without claiming completion",
    thrown.kind === "unavailable" && throwClears === 1
  );
  check("logout-all control stays hidden until rules are validated", LOGOUT_ALL_CONTROL_ENABLED === false);

  type SideEffects = {
    signOuts: number;
    navigations: number;
    outcomes: LogoutAllRemoteOutcome[];
    busy: boolean[];
    calls: number;
    bound: LogoutAllIdentity | null;
  };

  async function runProductionLogout(input: {
    online: boolean;
    liveUid: () => string;
    uiAttached: () => boolean;
    call: (operationId: string, identity: LogoutAllIdentity) => Promise<{ status: "complete" | "pending" | "unavailable" }>;
    identity?: LogoutAllIdentity;
  }): Promise<{ result: Awaited<ReturnType<typeof orchestrateConfirmedLogoutAll>>; effects: SideEffects }> {
    const effects: SideEffects = {
      signOuts: 0,
      navigations: 0,
      outcomes: [],
      busy: [],
      calls: 0,
      bound: null,
    };
    const identity = input.identity ?? {
      uid: input.liveUid(),
      generation: currentAuthMutationGeneration(),
    };
    const result = await orchestrateConfirmedLogoutAll({
      confirmed: true,
      online: input.online,
      operationId,
      identity,
      sessionStillCurrent: () =>
        input.liveUid() === identity.uid && currentAuthMutationGeneration() === identity.generation,
      uiAttached: input.uiAttached,
      call: async (id, bound) => {
        effects.calls += 1;
        effects.bound = bound;
        return input.call(id, bound);
      },
      signOutThisDevice: async () => {
        effects.signOuts += 1;
      },
      navigateToSignedOut: () => {
        effects.navigations += 1;
      },
      presentOutcome: (remote) => {
        effects.outcomes.push(remote);
      },
      setBusy: (busy) => {
        effects.busy.push(busy);
      },
    });
    return { result, effects };
  }

  __resetAuthSessionFenceForTests();
  {
    noteNativeAuthIdentity("uid-a");
    const identity = { uid: "uid-a", generation: currentAuthMutationGeneration() };
    let liveUid = "uid-a";
    const entered = deferred<void>();
    const release = deferred<{ status: "complete" }>();
    const pending = runProductionLogout({
      online: true,
      liveUid: () => liveUid,
      uiAttached: () => true,
      identity,
      call: async () => {
        entered.resolve();
        return release.promise;
      },
    });
    await entered.promise;
    liveUid = "uid-b";
    noteNativeAuthIdentity("uid-b");
    release.resolve({ status: "complete" });
    const { result, effects } = await pending;
    check(
      "A to B while logout-all waits keeps the remote result and does not clear B",
      result.remote === "complete" &&
        result.localCompletion === "discarded" &&
        effects.calls === 1 &&
        effects.bound?.uid === "uid-a" &&
        effects.bound.generation === identity.generation &&
        effects.signOuts === 0 &&
        effects.navigations === 0 &&
        effects.outcomes.length === 0 &&
        effects.busy.includes(false) === false
    );
  }

  __resetAuthSessionFenceForTests();
  {
    noteNativeAuthIdentity("uid-a");
    const identity = { uid: "uid-a", generation: currentAuthMutationGeneration() };
    let liveUid = "uid-a";
    const entered = deferred<void>();
    const release = deferred<{ status: "complete" }>();
    const pending = runProductionLogout({
      online: true,
      liveUid: () => liveUid,
      uiAttached: () => true,
      identity,
      call: async () => {
        entered.resolve();
        return release.promise;
      },
    });
    await entered.promise;
    retireJsAuthBridge();
    liveUid = "uid-a";
    noteNativeAuthIdentity("uid-a");
    release.resolve({ status: "complete" });
    const { result, effects } = await pending;
    check(
      "A logout then A on a new generation does not clear the new login",
      result.remote === "complete" &&
        result.localCompletion === "discarded" &&
        currentAuthMutationGeneration() !== identity.generation &&
        effects.signOuts === 0 &&
        effects.navigations === 0 &&
        effects.outcomes.length === 0
    );
  }

  __resetAuthSessionFenceForTests();
  {
    const identity = { uid: "uid-a", generation: currentAuthMutationGeneration() };
    let attached = true;
    const entered = deferred<void>();
    const release = deferred<{ status: "pending" }>();
    const pending = runProductionLogout({
      online: true,
      liveUid: () => "uid-a",
      uiAttached: () => attached,
      identity,
      call: async () => {
        entered.resolve();
        return release.promise;
      },
    });
    await entered.promise;
    attached = false;
    release.resolve({ status: "pending" });
    const { result, effects } = await pending;
    check(
      "completion after unmount clears the current device and does not navigate or alert",
      result.remote === "pending" &&
        result.localCompletion === "device_only" &&
        effects.signOuts === 1 &&
        effects.navigations === 0 &&
        effects.outcomes.length === 0 &&
        effects.busy.includes(false) === false
    );
  }

  __resetAuthSessionFenceForTests();
  {
    const finished = await runProductionLogout({
      online: true,
      liveUid: () => "uid-a",
      uiAttached: () => true,
      call: async () => ({ status: "complete" }),
    });
    check(
      "same-session complete signs out, alerts, and navigates",
      finished.result.remote === "complete" &&
        finished.result.localCompletion === "applied" &&
        finished.effects.signOuts === 1 &&
        finished.effects.navigations === 1 &&
        finished.effects.outcomes[0] === "complete" &&
        finished.effects.busy[0] === true &&
        finished.effects.busy.at(-1) === false
    );
    const pendingSame = await runProductionLogout({
      online: true,
      liveUid: () => "uid-a",
      uiAttached: () => true,
      call: async () => ({ status: "pending" }),
    });
    check(
      "same-session pending does not claim remote completion",
      pendingSame.result.remote === "pending" &&
        pendingSame.effects.outcomes[0] === "pending" &&
        pendingSame.effects.signOuts === 1 &&
        pendingSame.effects.navigations === 1
    );
    const failed = await runProductionLogout({
      online: true,
      liveUid: () => "uid-a",
      uiAttached: () => true,
      call: async () => {
        throw new Error("network");
      },
    });
    check(
      "same-session failure still clears this device and reports failure",
      failed.result.remote === "unavailable" &&
        failed.effects.outcomes[0] === "unavailable" &&
        failed.effects.signOuts === 1 &&
        failed.effects.navigations === 1
    );
    const offlineSame = await runProductionLogout({
      online: false,
      liveUid: () => "uid-a",
      uiAttached: () => true,
      call: async () => {
        throw new Error("must not be called offline");
      },
    });
    check(
      "same-session offline clears only this device and does not call",
      offlineSame.result.remote === "offline" &&
        offlineSame.effects.calls === 0 &&
        offlineSame.effects.outcomes[0] === "offline" &&
        offlineSame.effects.signOuts === 1 &&
        offlineSame.effects.navigations === 1
    );
  }

  async function productionLocalSignOut(profile: { uid: string | null }, gates: {
    sdk?: { entered: ReturnType<typeof deferred<void>>; release: ReturnType<typeof deferred<void>> };
    cache?: { entered: ReturnType<typeof deferred<void>>; release: ReturnType<typeof deferred<void>> };
  }) {
    return runLocalDeviceSignOut({
      maskPrivateUi: () => undefined,
      retireCloudAdmission: () => {
        retireJsAuthBridge();
      },
      cleanAuthSdks: async (ownedGeneration) => {
        await cleanBothAuthSdks(ownedGeneration, {
          signOutJs: async () => {
            if (!gates.sdk) return;
            gates.sdk.entered.resolve();
            await gates.sdk.release.promise;
          },
          signOutNative: async () => undefined,
        });
      },
      clearLocalProfileCache: (ownedGeneration) =>
        clearPersistedProfileIfOwned(ownedGeneration, {
          prepare: async () => {
            if (!gates.cache) return;
            gates.cache.entered.resolve();
            await gates.cache.release.promise;
          },
          removePersistedProfile: async () => {
            profile.uid = null;
          },
        }).then(() => undefined),
    });
  }

  __resetAuthSessionFenceForTests();
  {
    noteNativeAuthIdentity("uid-a");
    const confirmed = { uid: "uid-a", generation: currentAuthMutationGeneration() };
    const profile = { uid: "uid-a" as string | null };
    const sdk = { entered: deferred<void>(), release: deferred<void>() };
    let navigations = 0;
    const outcomes: LogoutAllRemoteOutcome[] = [];
    const pending = orchestrateConfirmedLogoutAll({
      confirmed: true,
      online: true,
      operationId,
      identity: confirmed,
      sessionStillCurrent: () =>
        profile.uid === confirmed.uid && currentAuthMutationGeneration() === confirmed.generation,
      uiAttached: () => true,
      call: async () => ({ status: "complete" }),
      signOutThisDevice: () => productionLocalSignOut(profile, { sdk }),
      navigateToSignedOut: () => {
        navigations += 1;
      },
      presentOutcome: (remote) => {
        outcomes.push(remote);
      },
      setBusy: () => undefined,
    });
    await sdk.entered.promise;
    profile.uid = "uid-b";
    noteNativeAuthIdentity("uid-b");
    sdk.release.resolve();
    const result = await pending;
    check(
      "a login during SDK cleanup keeps the newer persisted profile and does not alert",
      result.remote === "complete" &&
        result.localCompletion === "discarded" &&
        profile.uid === "uid-b" &&
        navigations === 0 &&
        outcomes.length === 0
    );
  }

  __resetAuthSessionFenceForTests();
  {
    noteNativeAuthIdentity("uid-a");
    const confirmed = { uid: "uid-a", generation: currentAuthMutationGeneration() };
    const profile = { uid: "uid-a" as string | null };
    const cache = { entered: deferred<void>(), release: deferred<void>() };
    let navigations = 0;
    const outcomes: LogoutAllRemoteOutcome[] = [];
    const pending = orchestrateConfirmedLogoutAll({
      confirmed: true,
      online: true,
      operationId,
      identity: confirmed,
      sessionStillCurrent: () => currentAuthMutationGeneration() === confirmed.generation,
      uiAttached: () => true,
      call: async () => ({ status: "complete" }),
      signOutThisDevice: () => productionLocalSignOut(profile, { cache }),
      navigateToSignedOut: () => {
        navigations += 1;
      },
      presentOutcome: (remote) => {
        outcomes.push(remote);
      },
      setBusy: () => undefined,
    });
    await cache.entered.promise;
    profile.uid = "uid-b";
    noteNativeAuthIdentity("uid-b");
    cache.release.resolve();
    const result = await pending;
    check(
      "a login during profile-cache cleanup keeps the newer persisted profile and does not alert",
      result.remote === "complete" &&
        result.localCompletion === "discarded" &&
        profile.uid === "uid-b" &&
        navigations === 0 &&
        outcomes.length === 0
    );
  }

  __resetAuthSessionFenceForTests();
  {
    noteNativeAuthIdentity("uid-a");
    const confirmed = { uid: "uid-a", generation: currentAuthMutationGeneration() };
    const profile = { uid: "uid-a" as string | null };
    let navigations = 0;
    const outcomes: LogoutAllRemoteOutcome[] = [];
    const result = await orchestrateConfirmedLogoutAll({
      confirmed: true,
      online: true,
      operationId,
      identity: confirmed,
      sessionStillCurrent: () => currentAuthMutationGeneration() === confirmed.generation,
      uiAttached: () => true,
      call: async () => ({ status: "complete" }),
      signOutThisDevice: () => productionLocalSignOut(profile, {}),
      navigateToSignedOut: () => {
        navigations += 1;
      },
      presentOutcome: (remote) => {
        outcomes.push(remote);
      },
      setBusy: () => undefined,
    });
    check(
      "the logout retirement still completes UI after its own generation bump",
      result.remote === "complete" &&
        result.localCompletion === "applied" &&
        currentAuthMutationGeneration() !== confirmed.generation &&
        profile.uid === null &&
        navigations === 1 &&
        outcomes[0] === "complete"
    );
  }

  check(
    "recent-auth and pending callable codes stay distinct",
    classifyLogoutAllCallableFailure(
      new AppError("permission_denied", "Recent phone sign-in is required to revoke every device.", undefined, {
        functionsErrorCode: "functions/permission-denied",
      })
    ) === "not_recent" &&
      classifyLogoutAllCallableFailure(
        new AppError("permission_denied", "Session revocation is incomplete.", undefined, {
          functionsErrorCode: "functions/failed-precondition",
        })
      ) === "pending" &&
      classifyLogoutAllCallableFailure(
        new AppError("unknown", "A newer sign-out of every device is already recorded.", undefined, {
          functionsErrorCode: "functions/aborted",
        })
      ) === "superseded" &&
      classifyLogoutAllCallableFailure(
        new AppError("auth_failed", "Sign-in is no longer valid.", undefined, {
          functionsErrorCode: "functions/unauthenticated",
        })
      ) === "sign_in_invalid"
  );

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all auth session fence tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
