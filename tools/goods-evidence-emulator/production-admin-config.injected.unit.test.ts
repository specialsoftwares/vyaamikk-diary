/**
 * INJECTED Admin ports for production project/bucket resolution.
 * Label: INJECTED / not live deploy / not FIREBASE_READ.
 *
 * Includes an inline copy of the previous resolver so the reproduced
 * configuration failure stays executable. That copy is not imported by
 * production code.
 */
import assert from "node:assert/strict";

import {
  createProductionGrinCallables,
  GRIN_ADMIN_CONFIG_CODES,
  GRIN_ADMIN_DEFAULT_APP_NAME,
  GrinAdminConfigError,
  ISOLATED_FUNCTIONS_PROJECT,
  ISOLATED_STORAGE_BUCKET,
  preflightGrinAdminBinding,
  resolveGrinAdminBinding,
  type GrinAdminAppLike,
  type GrinAdminRuntimePorts,
} from "../../functions/src/goodsEvidence/productionCompose";

const LIVE_PROJECT = "vyaamikk-diary";
const LIVE_BUCKET = "vyaamikk-diary.firebasestorage.app";
const LEGACY_BUCKET = "vyaamikk-diary.appspot.com";
const OTHER_PROJECT = "other-diary-project";
const OTHER_BUCKET = "other-diary-project.appspot.com";

function legacyEnsureAdminApp(env: NodeJS.ProcessEnv): { projectId: string; storageBucket: string } {
  const projectId = env.GCLOUD_PROJECT || env.GCLOUD_PROJECT_ID || ISOLATED_FUNCTIONS_PROJECT;
  const storageBucket = env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`;
  return { projectId, storageBucket };
}

function liveFirebaseConfigEnv(): NodeJS.ProcessEnv {
  return {
    GCLOUD_PROJECT: LIVE_PROJECT,
    FIREBASE_CONFIG: JSON.stringify({
      projectId: LIVE_PROJECT,
      storageBucket: LIVE_BUCKET,
    }),
  };
}

type FakeDb = {
  settings: (options: unknown) => void;
};

function createFakePorts(seed: GrinAdminAppLike[] = []): {
  ports: GrinAdminRuntimePorts;
  initializeCalls: Array<{ projectId: string; storageBucket: string }>;
  firestoreApps: GrinAdminAppLike[];
  storageBindings: Array<{ app: GrinAdminAppLike; bucket: string }>;
} {
  const apps = [...seed];
  const initializeCalls: Array<{ projectId: string; storageBucket: string }> = [];
  const firestoreApps: GrinAdminAppLike[] = [];
  const storageBindings: Array<{ app: GrinAdminAppLike; bucket: string }> = [];
  const dummyDb: FakeDb = {
    settings() {
      // ignore
    },
  };
  const dummyBucket = {};
  const ports: GrinAdminRuntimePorts = {
    getApps: () => apps,
    initializeApp(options) {
      initializeCalls.push({ ...options });
      const app: GrinAdminAppLike = {
        name: GRIN_ADMIN_DEFAULT_APP_NAME,
        options: { projectId: options.projectId, storageBucket: options.storageBucket },
      };
      apps.push(app);
      return app;
    },
    getFirestore(app) {
      firestoreApps.push(app);
      return dummyDb as unknown as ReturnType<GrinAdminRuntimePorts["getFirestore"]>;
    },
    getStorage(app) {
      return {
        bucket(name: string) {
          storageBindings.push({ app, bucket: name });
          return dummyBucket as ReturnType<ReturnType<GrinAdminRuntimePorts["getStorage"]>["bucket"]>;
        },
      };
    },
  };
  return { ports, initializeCalls, firestoreApps, storageBindings };
}

function assertThrowsCode(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (err) {
    assert.equal(err instanceof GrinAdminConfigError, true);
    assert.equal((err as GrinAdminConfigError).code, code);
    assert.equal((err as Error).message, code);
    assert.doesNotMatch((err as Error).message, /FIREBASE_CONFIG|storageBucket=|GCLOUD_PROJECT=/);
    return;
  }
  assert.fail(`expected ${code}`);
}

{
  const env = liveFirebaseConfigEnv();
  const legacy = legacyEnsureAdminApp(env);
  assert.equal(legacy.projectId, LIVE_PROJECT);
  assert.equal(legacy.storageBucket, LEGACY_BUCKET);

  const fake = createFakePorts();
  const binding = resolveGrinAdminBinding(env, fake.ports);
  assert.equal(binding.projectId, LIVE_PROJECT);
  assert.equal(binding.storageBucket, LIVE_BUCKET);
  assert.equal(binding.initialized, true);
  assert.deepEqual(fake.initializeCalls, [{ projectId: LIVE_PROJECT, storageBucket: LIVE_BUCKET }]);

  const created = createProductionGrinCallables(env, fake.ports);
  assert.equal(created.compositionKind, "UNDEPLOYED_COMPOSED");
  assert.equal(fake.firestoreApps[0], binding.app);
  assert.equal(fake.storageBindings[0]?.app, binding.app);
  assert.equal(fake.storageBindings[0]?.bucket, LIVE_BUCKET);
}

{
  const env: NodeJS.ProcessEnv = {
    GCLOUD_PROJECT: LIVE_PROJECT,
    FIREBASE_STORAGE_BUCKET: LEGACY_BUCKET,
  };
  const fake = createFakePorts();
  const created = createProductionGrinCallables(env, fake.ports);
  assert.equal(created.compositionKind, "UNDEPLOYED_COMPOSED");
  assert.deepEqual(fake.initializeCalls, [{ projectId: LIVE_PROJECT, storageBucket: LEGACY_BUCKET }]);
  assert.equal(fake.storageBindings[0]?.bucket, LEGACY_BUCKET);
  assert.equal(fake.firestoreApps[0]?.name, GRIN_ADMIN_DEFAULT_APP_NAME);
}

{
  const existing: GrinAdminAppLike = {
    name: GRIN_ADMIN_DEFAULT_APP_NAME,
    options: { projectId: LIVE_PROJECT, storageBucket: LIVE_BUCKET },
  };
  const env = liveFirebaseConfigEnv();
  const fake = createFakePorts([existing]);
  const created = createProductionGrinCallables(env, fake.ports);
  assert.equal(created.compositionKind, "UNDEPLOYED_COMPOSED");
  assert.equal(fake.initializeCalls.length, 0);
  assert.equal(fake.firestoreApps[0], existing);
  assert.equal(fake.storageBindings[0]?.app, existing);
  assert.equal(fake.storageBindings[0]?.bucket, LIVE_BUCKET);

  const gcloudOnly: NodeJS.ProcessEnv = { GCLOUD_PROJECT: LIVE_PROJECT };
  const fromExisting = resolveGrinAdminBinding(gcloudOnly, createFakePorts([existing]).ports);
  assert.equal(fromExisting.storageBucket, LIVE_BUCKET);
  assert.equal(fromExisting.initialized, false);
  assert.notEqual(legacyEnsureAdminApp(gcloudOnly).storageBucket, LIVE_BUCKET);
}

{
  const existing: GrinAdminAppLike = {
    name: GRIN_ADMIN_DEFAULT_APP_NAME,
    options: { projectId: OTHER_PROJECT, storageBucket: OTHER_BUCKET },
  };
  const fake = createFakePorts([existing]);
  assertThrowsCode(
    () => createProductionGrinCallables(liveFirebaseConfigEnv(), fake.ports),
    GRIN_ADMIN_CONFIG_CODES.conflict
  );
  assert.equal(fake.initializeCalls.length, 0);
  assert.equal(fake.firestoreApps.length, 0);
  assert.equal(fake.storageBindings.length, 0);
}

{
  const named: GrinAdminAppLike = {
    name: "billing",
    options: { projectId: LIVE_PROJECT, storageBucket: LIVE_BUCKET },
  };
  const fake = createFakePorts([named]);
  assertThrowsCode(
    () => createProductionGrinCallables(liveFirebaseConfigEnv(), fake.ports),
    GRIN_ADMIN_CONFIG_CODES.no_default_app
  );
  assert.equal(fake.initializeCalls.length, 0);
  assert.equal(fake.firestoreApps.length, 0);
}

{
  const fake = createFakePorts();
  assertThrowsCode(
    () => createProductionGrinCallables({}, fake.ports),
    GRIN_ADMIN_CONFIG_CODES.missing
  );
  assertThrowsCode(
    () => createProductionGrinCallables({ GCLOUD_PROJECT: LIVE_PROJECT }, fake.ports),
    GRIN_ADMIN_CONFIG_CODES.missing
  );
  assert.equal(fake.initializeCalls.length, 0);
}

{
  const fake = createFakePorts();
  assertThrowsCode(
    () => createProductionGrinCallables({ FIREBASE_CONFIG: "{not-json" }, fake.ports),
    GRIN_ADMIN_CONFIG_CODES.malformed
  );
  assertThrowsCode(
    () => createProductionGrinCallables({ FIREBASE_CONFIG: "[]" }, fake.ports),
    GRIN_ADMIN_CONFIG_CODES.malformed
  );
  assertThrowsCode(
    () =>
      createProductionGrinCallables(
        { FIREBASE_CONFIG: JSON.stringify({ projectId: 1, storageBucket: LIVE_BUCKET }) },
        fake.ports
      ),
    GRIN_ADMIN_CONFIG_CODES.malformed
  );
  assert.equal(fake.initializeCalls.length, 0);
}

{
  const env: NodeJS.ProcessEnv = {
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8090",
    FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9201",
    GRIN_ADMIN_PROJECT: ISOLATED_FUNCTIONS_PROJECT,
    GRIN_ADMIN_STORAGE_BUCKET: ISOLATED_STORAGE_BUCKET,
  };
  const fake = createFakePorts();
  const created = createProductionGrinCallables(env, fake.ports);
  assert.equal(created.compositionKind, "UNDEPLOYED_COMPOSED");
  assert.deepEqual(fake.initializeCalls, [
    { projectId: ISOLATED_FUNCTIONS_PROJECT, storageBucket: ISOLATED_STORAGE_BUCKET },
  ]);
  assert.equal(fake.storageBindings[0]?.bucket, ISOLATED_STORAGE_BUCKET);

  const noExplicit = createFakePorts();
  assertThrowsCode(
    () =>
      createProductionGrinCallables(
        {
          FIRESTORE_EMULATOR_HOST: "127.0.0.1:8090",
          FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9201",
        },
        noExplicit.ports
      ),
    GRIN_ADMIN_CONFIG_CODES.missing
  );
  assert.equal(noExplicit.initializeCalls.length, 0);
}

{
  const existing: GrinAdminAppLike = {
    name: GRIN_ADMIN_DEFAULT_APP_NAME,
    options: { projectId: LIVE_PROJECT, storageBucket: LIVE_BUCKET },
  };
  const fake = createFakePorts([existing]);
  createProductionGrinCallables(liveFirebaseConfigEnv(), fake.ports);
  createProductionGrinCallables(liveFirebaseConfigEnv(), fake.ports);
  assert.equal(fake.initializeCalls.length, 0);
  assert.equal(fake.firestoreApps.length, 2);
  assert.equal(fake.firestoreApps[0], existing);
  assert.equal(fake.firestoreApps[1], existing);
  assert.equal(fake.storageBindings[0]?.bucket, LIVE_BUCKET);
  assert.equal(fake.storageBindings[1]?.bucket, LIVE_BUCKET);
}

{
  const env: NodeJS.ProcessEnv = {
    GCLOUD_PROJECT: LIVE_PROJECT,
    FIREBASE_CONFIG: JSON.stringify({
      projectId: LIVE_PROJECT,
      storageBucket: LIVE_BUCKET,
    }),
    FIREBASE_STORAGE_BUCKET: LEGACY_BUCKET,
  };
  assertThrowsCode(
    () => createProductionGrinCallables(env, createFakePorts().ports),
    GRIN_ADMIN_CONFIG_CODES.conflict
  );
}

{
  const preflight = preflightGrinAdminBinding(liveFirebaseConfigEnv(), createFakePorts().ports);
  assert.equal(preflight.ok, true);
  if (preflight.ok) {
    assert.equal(preflight.projectId, LIVE_PROJECT);
    assert.equal(preflight.storageBucket, LIVE_BUCKET);
    assert.equal(preflight.appName, GRIN_ADMIN_DEFAULT_APP_NAME);
  }
  const failed = preflightGrinAdminBinding({}, createFakePorts().ports);
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.code, GRIN_ADMIN_CONFIG_CODES.missing);
  }
  assert.equal(JSON.stringify(preflight).includes("FIREBASE_CONFIG"), false);
}

console.log("tools/goods-evidence-emulator/production-admin-config.injected.unit.test.ts: ok (INJECTED / not live deploy)");
