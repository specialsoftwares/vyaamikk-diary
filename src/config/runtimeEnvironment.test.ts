import assert from "node:assert/strict";

import {
  RuntimeConfigurationError,
  buildResolvedEnvironment,
  detectRuntimeKind,
  parseBundledAppMode,
  resolveActiveBackend,
  resolveEffectiveAppMode,
} from "./runtimeEnvironment";

const expoGoSignals = {
  appOwnership: "expo" as const,
  isDev: true,
  platform: "ios",
};

const devClientSignals = {
  appOwnership: "standalone" as const,
  isDev: true,
  platform: "ios",
};

const storeSignals = {
  appOwnership: "standalone" as const,
  isDev: false,
  platform: "ios",
};

const firebaseConfigured = true;

function testRuntimeDetection() {
  assert.equal(detectRuntimeKind(expoGoSignals), "expo-go");
  assert.equal(detectRuntimeKind(devClientSignals), "development-client");
  assert.equal(detectRuntimeKind(storeSignals), "store-or-standalone");
  assert.equal(
    detectRuntimeKind({ appOwnership: null, isDev: true, platform: "web" }),
    "web-dev"
  );
  assert.equal(
    detectRuntimeKind({ appOwnership: null, isDev: false, platform: "web" }),
    "web-production"
  );
}

function testExpoGoDevelopmentResolvesLocalMock() {
  const resolved = buildResolvedEnvironment({
    bundledAppModeRaw: "development",
    devBackendRaw: "shared-dev",
    firebaseConfigured,
    signals: expoGoSignals,
  });
  assert.equal(resolved.effectiveAppMode, "development");
  assert.equal(resolved.getActiveBackend(), "local-mock");
}

function testExpoGoIgnoresProductionBundledMode() {
  const resolved = buildResolvedEnvironment({
    bundledAppModeRaw: "production",
    devBackendRaw: "local-mock",
    firebaseConfigured,
    signals: expoGoSignals,
  });
  assert.equal(resolved.effectiveAppMode, "development");
  assert.equal(resolved.getActiveBackend(), "local-mock");
}

function testProdDevClientResolvesFirebaseProduction() {
  const resolved = buildResolvedEnvironment({
    bundledAppModeRaw: "production",
    devBackendRaw: "local-mock",
    firebaseConfigured,
    signals: devClientSignals,
  });
  assert.equal(resolved.effectiveAppMode, "production");
  assert.equal(resolved.getActiveBackend(), "firebase-production");
}

function testEasPreviewResolvesFirebaseProduction() {
  const resolved = buildResolvedEnvironment({
    bundledAppModeRaw: "production",
    devBackendRaw: "shared-dev",
    firebaseConfigured,
    signals: storeSignals,
  });
  assert.equal(resolved.effectiveAppMode, "production");
  assert.equal(resolved.getActiveBackend(), "firebase-production");
}

function testStoreProductionResolvesFirebaseProduction() {
  const resolved = buildResolvedEnvironment({
    bundledAppModeRaw: "production",
    devBackendRaw: "",
    firebaseConfigured,
    signals: storeSignals,
  });
  assert.equal(resolved.getActiveBackend(), "firebase-production");
}

function testInvalidModeRejectedInProductionLikeRuntime() {
  assert.throws(
    () =>
      parseBundledAppMode("staging", detectRuntimeKind(devClientSignals)),
    RuntimeConfigurationError
  );
  assert.throws(
    () =>
      buildResolvedEnvironment({
        bundledAppModeRaw: "staging",
        devBackendRaw: "local-mock",
        firebaseConfigured,
        signals: devClientSignals,
      }),
    RuntimeConfigurationError
  );
}

function testMissingModeFailsInProductionLikeRuntime() {
  assert.throws(
    () =>
      resolveEffectiveAppMode(
        "development",
        "development-client",
        true,
        devClientSignals
      ),
    (error: unknown) =>
      error instanceof RuntimeConfigurationError &&
      error.message.includes("missing")
  );
  assert.throws(
    () =>
      buildResolvedEnvironment({
        bundledAppModeRaw: "",
        devBackendRaw: "local-mock",
        firebaseConfigured,
        signals: devClientSignals,
      }),
    RuntimeConfigurationError
  );
}

function testDevClientRejectsDevelopmentBundledMode() {
  assert.throws(
    () =>
      buildResolvedEnvironment({
        bundledAppModeRaw: "development",
        devBackendRaw: "local-mock",
        firebaseConfigured,
        signals: devClientSignals,
      }),
    (error: unknown) =>
      error instanceof RuntimeConfigurationError &&
      error.message.includes("start:prod-dev-client")
  );
}

function testMockOtpDisabledOutsideExpoGo() {
  const devClient = buildResolvedEnvironment({
    bundledAppModeRaw: "production",
    devBackendRaw: "shared-dev",
    firebaseConfigured,
    signals: devClientSignals,
  });
  assert.equal(devClient.isProduction, true);
  assert.notEqual(devClient.getActiveBackend(), "local-mock");
  assert.notEqual(devClient.getActiveBackend(), "firebase-shared-dev");

  const store = buildResolvedEnvironment({
    bundledAppModeRaw: "production",
    devBackendRaw: "shared-dev",
    firebaseConfigured,
    signals: storeSignals,
  });
  assert.equal(store.isProduction, true);
  assert.equal(store.getActiveBackend(), "firebase-production");
}

function testSharedDevOnlyOnWebDev() {
  const backend = resolveActiveBackend(
    "development",
    "shared-dev",
    firebaseConfigured,
    "web-dev"
  );
  assert.equal(backend, "firebase-shared-dev");
}

function main() {
  testRuntimeDetection();
  testExpoGoDevelopmentResolvesLocalMock();
  testExpoGoIgnoresProductionBundledMode();
  testProdDevClientResolvesFirebaseProduction();
  testEasPreviewResolvesFirebaseProduction();
  testStoreProductionResolvesFirebaseProduction();
  testInvalidModeRejectedInProductionLikeRuntime();
  testMissingModeFailsInProductionLikeRuntime();
  testDevClientRejectsDevelopmentBundledMode();
  testMockOtpDisabledOutsideExpoGo();
  testSharedDevOnlyOnWebDev();
  console.log("runtimeEnvironment.test.ts: ok");
}

main();
