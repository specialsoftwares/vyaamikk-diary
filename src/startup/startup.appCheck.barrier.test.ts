/**
 * Startup must not wait on optional App Check token probes.
 * Boundary: coordinator + real initializeAppCheckLayer with injected native port.
 */
import assert from "node:assert/strict";

import { runStartupCoordinator } from "./coordinator";
import {
  getAppCheckDiagnosticPromise,
  initializeAppCheckLayer,
  __resetAppCheckAttemptsForTests,
} from "@/services/appCheck/bootstrap";
import { getLastAppCheckInitReport } from "@/services/appCheck/appCheckTypes";
import { probeNativeAppCheckTokens } from "@/services/appCheck/nativeAppCheck";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 25; i++) await Promise.resolve();
}

async function main() {
  __resetAppCheckAttemptsForTests();

  {
    const tokenHold = deferred<{ token: string }>();
    let tokenCalls = 0;
    let startupDone = false;
    const startup = runStartupCoordinator({
      skipNativeSideEffects: true,
      initializeAppCheckLayerForTests: () =>
        initializeAppCheckLayer({
          isProduction: true,
          nativePort: {
            platform: "android",
            nativeAppId: "1:proj:android:xyz",
            initialize: async () => undefined,
            getToken: async () => {
              tokenCalls += 1;
              return tokenHold.promise;
            },
          },
        }),
    });
    const marked = startup.then((outcome) => {
      startupDone = true;
      return outcome;
    });
    await flush();
    assert.equal(startupDone, true);
    const outcome = await marked;
    assert.equal(outcome.ok, true);
    assert.equal(getLastAppCheckInitReport()?.nativeTokenObtained, false);
    tokenHold.resolve({ token: "late-token" });
    const diagnostic = await getAppCheckDiagnosticPromise();
    assert.equal(diagnostic?.nativeTokenObtained, true);
    assert.equal(tokenCalls, 1);
  }

  {
    __resetAppCheckAttemptsForTests();
    const refreshHold = deferred<{ token: string }>();
    const calls: boolean[] = [];
    const startup = runStartupCoordinator({
      skipNativeSideEffects: true,
      initializeAppCheckLayerForTests: () =>
        initializeAppCheckLayer({
          isProduction: true,
          nativePort: {
            platform: "android",
            nativeAppId: "1:proj:android:xyz",
            initialize: async () => undefined,
            getToken: async (forceRefresh) => {
              calls.push(forceRefresh);
              if (forceRefresh) return refreshHold.promise;
              return { token: "cached" };
            },
          },
        }),
    });
    const outcome = await startup;
    assert.equal(outcome.ok, true);
    await getAppCheckDiagnosticPromise();
    assert.deepEqual(calls, [false]);
    refreshHold.resolve({ token: "fresh" });
  }

  {
    __resetAppCheckAttemptsForTests();
    const initHold = deferred<void>();
    let startupDone = false;
    const budget = deferred<void>();
    const startup = runStartupCoordinator({
      skipNativeSideEffects: true,
      initializeAppCheckLayerForTests: () =>
        initializeAppCheckLayer({
          isProduction: true,
          initBudgetMs: 1,
          clock: {
            nowMs: () => 0,
            wait: () => budget.promise,
          },
          nativePort: {
            platform: "android",
            nativeAppId: "1:proj:android:xyz",
            initialize: () => initHold.promise,
          },
        }),
    });
    const marked = startup.then((outcome) => {
      startupDone = true;
      return outcome;
    });
    await flush();
    assert.equal(startupDone, false);
    budget.resolve();
    const outcome = await marked;
    assert.equal(outcome.ok, true);
    assert.equal(getLastAppCheckInitReport()?.native, "failed");
    initHold.resolve();
    await flush();
    assert.equal(getLastAppCheckInitReport()?.native, "failed");
  }

  {
    __resetAppCheckAttemptsForTests();
    const firstToken = deferred<{ token: string }>();
    const secondToken = deferred<{ token: string }>();
    let layerCalls = 0;
    await runStartupCoordinator({
      skipNativeSideEffects: true,
      initializeAppCheckLayerForTests: () => {
        layerCalls += 1;
        return initializeAppCheckLayer({
          isProduction: true,
          nativePort: {
            platform: "android",
            nativeAppId: "1:proj:android:xyz",
            initialize: async () => undefined,
            getToken: async () => (layerCalls === 1 ? firstToken.promise : secondToken.promise),
          },
        });
      },
    });
    await runStartupCoordinator({
      skipNativeSideEffects: true,
      initializeAppCheckLayerForTests: () =>
        initializeAppCheckLayer({
          isProduction: true,
          nativePort: {
            platform: "android",
            nativeAppId: "1:proj:android:xyz",
            initialize: async () => undefined,
            getToken: async () => secondToken.promise,
          },
        }),
    });
    firstToken.resolve({ token: "stale-attempt" });
    await flush();
    assert.equal(getLastAppCheckInitReport()?.nativeTokenObtained, false);
    secondToken.resolve({ token: "newer" });
    const diagnostic = await getAppCheckDiagnosticPromise();
    assert.equal(diagnostic?.nativeTokenObtained, true);
  }

  {
    const rejected = await probeNativeAppCheckTokens({
      port: {
        platform: "android",
        initialize: async () => undefined,
        getToken: async () => {
          throw new Error("integrity unavailable");
        },
      },
      forceRefresh: true,
    });
    assert.equal(rejected.tokenObtained, false);
    assert.equal(rejected.refreshAttempted, true);
  }

  console.log("startup.appCheck.barrier.test.ts: ok");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
