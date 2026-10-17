/**
 * SOURCE — auth mutation fence and bridge races with deferred adapters.
 * Run: npm run test:auth-session-security
 */

import {
  __resetAuthSessionFenceForTests,
  cleanBothAuthSdks,
  currentAuthMutationGeneration,
  retireJsAuthBridge,
  runLocalDeviceSignOut,
} from "./authSessionFence";
import { bridgeNativeSession } from "./jsAuthBridge";
import { AppError } from "@/domain/errors";
import {
  classifyLogoutAllCallableFailure,
  newLogoutOperationId,
  requestLogoutAllDevices,
  runConfirmedLogoutAll,
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
