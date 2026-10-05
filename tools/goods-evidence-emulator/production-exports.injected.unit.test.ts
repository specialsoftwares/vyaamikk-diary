/**
 * INJECTED production GRIN https exports.
 * Label: INJECTED / not live deploy.
 *
 * Proves lazy composition: missing Admin config denies GRIN only, and does not
 * guess a demo project or .appspot.com bucket.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GRIN_ADMIN_CONFIG_CODES,
  GrinAdminConfigError,
  createProductionGrinCallables,
} from "../../functions/src/goodsEvidence/productionCompose";
import {
  createComposedGrinCallables,
  type ComposedEvidenceAdapter,
  type ComposedGrinAdapter,
  type ComposedGrinCallables,
} from "../../functions/src/goodsEvidence/composed";
import {
  PRODUCTION_GRIN_CALLABLE_NAMES,
  runProductionGrinCallable,
} from "../../functions/src/goodsEvidence/productionExports";

const here = dirname(fileURLToPath(import.meta.url));
const indexSrc = readFileSync(join(here, "../../functions/src/index.ts"), "utf8");
const exportsSrc = readFileSync(join(here, "../../functions/src/goodsEvidence/productionExports.ts"), "utf8");

assert.deepEqual([...PRODUCTION_GRIN_CALLABLE_NAMES], [
  "grinRegisterGoodsReceipt",
  "grinReconcileCommand",
  "grinMutateGoodsReceipt",
  "grinReadGoodsReceipt",
  "grinReserveEvidence",
  "grinBeginEvidenceUpload",
  "grinUploadEvidence",
]);

for (const name of PRODUCTION_GRIN_CALLABLE_NAMES) {
  assert.match(indexSrc, new RegExp(`export \\{[\\s\\S]*\\b${name}\\b[\\s\\S]*\\} from ["']\\.\\/goodsEvidence\\/productionExports["']`));
}
assert.match(indexSrc, /mintClientAuthToken/);
assert.match(indexSrc, /resolveOrCreateUserByPhone/);
assert.match(indexSrc, /prepareAndroidBillingAccount/);
assert.doesNotMatch(indexSrc, /createProductionGrinCallables\s*\(/);
assert.doesNotMatch(indexSrc, /productionCompose/);
assert.doesNotMatch(indexSrc, /productionAdminConfig/);
assert.doesNotMatch(indexSrc, /resolveGrinAdminBinding/);
assert.doesNotMatch(indexSrc, /handleGrinRegister/);
assert.doesNotMatch(indexSrc, /grinBeginEvidence[^U]/);
assert.match(exportsSrc, /import\(["']\.\/productionCompose["']\)/);
assert.match(exportsSrc, /region:\s*["']asia-south1["']/);
assert.match(exportsSrc, /request\.auth\?\.uid/);
const exportsExec = exportsSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
assert.doesNotMatch(exportsExec, /FIREBASE_CONFIG/);
assert.doesNotMatch(exportsExec, /demo-vyaamikk-grin-t1/);
assert.doesNotMatch(exportsExec.replace(/import\(["']\.\/productionCompose["']\)/, ""), /from ["']\.\/productionCompose["']/);

function denyCallables(calls: string[]): ComposedGrinCallables {
  const denied = { ok: false as const, code: "policy_denied" as const, detail: "denied" as const };
  const evidence = {
    ok: false,
    originalDurable: false,
    generation: null,
    retryable: false,
    ownerUid: null,
    mime: null,
    sizeBytes: null,
    storagePath: null,
    evidenceId: null,
    receiptId: null,
    ledgerId: null,
    category: null,
    claimedSha256: null,
    actualSha256: null,
    reservationId: null,
  };
  return {
    compositionKind: "UNDEPLOYED_COMPOSED",
    compositionLabel: "INJECTED_TEST",
    register: async (request) => {
      calls.push(`register:${request.auth?.uid ?? "none"}`);
      return denied;
    },
    reconcile: async () => denied,
    mutate: async () => denied,
    readReceipt: async () => denied,
    reserveEvidence: async () => denied,
    beginEvidenceUpload: async () => evidence,
    uploadEvidence: async () => evidence,
  };
}

async function main(): Promise<void> {
{
  const calls: string[] = [];
  const result = await runProductionGrinCallable(
    "register",
    { auth: { uid: "uid_admitted" }, data: { envelope: {} } },
    async () => denyCallables(calls)
  );
  assert.deepEqual(result, { ok: false, code: "policy_denied", detail: "denied" });
  assert.deepEqual(calls, ["register:uid_admitted"]);
}

{
  const result = await runProductionGrinCallable(
    "register",
    { auth: { uid: "uid_1" }, data: {} },
    async () => {
      throw new GrinAdminConfigError(GRIN_ADMIN_CONFIG_CODES.missing);
    }
  );
  assert.deepEqual(result, { ok: false, code: "policy_denied", detail: "denied" });
  assert.equal(JSON.stringify(result).includes("FIREBASE_CONFIG"), false);
  assert.equal(JSON.stringify(result).includes("demo-vyaamikk-grin-t1"), false);
}

{
  const result = await runProductionGrinCallable(
    "register",
    { auth: { uid: "uid_1" }, data: {} },
    async () => {
      throw new GrinAdminConfigError(GRIN_ADMIN_CONFIG_CODES.malformed);
    }
  );
  assert.equal(result && typeof result === "object" && "code" in result && result.code === "policy_denied", true);
}

{
  const fakePorts = {
    getApps: () => [],
    initializeApp: () => {
      throw new Error("must not initialize Admin when config is missing");
    },
    getFirestore: () => {
      throw new Error("must not bind Firestore");
    },
    getStorage: () => {
      throw new Error("must not bind Storage");
    },
  };
  const result = await runProductionGrinCallable(
    "readReceipt",
    { auth: { uid: "uid_1" }, data: { ledgerId: "l", receiptId: "r" } },
    async () => createProductionGrinCallables({}, fakePorts as never)
  );
  assert.deepEqual(result, { ok: false, code: "policy_denied", detail: "denied" });
}

{
  const fakePorts = {
    getApps: () => [],
    initializeApp(options: { projectId: string; storageBucket: string }) {
      return { name: "[DEFAULT]", options };
    },
    getFirestore() {
      return { settings() {} };
    },
    getStorage() {
      return { bucket() { return {}; } };
    },
  };
  const result = await runProductionGrinCallable(
    "register",
    { auth: { uid: "uid_1" }, data: {} },
    async () =>
      createProductionGrinCallables(
        {
          GRIN_ADMIN_PROJECT: "vyaamikk-diary",
          GRIN_ADMIN_STORAGE_BUCKET: "vyaamikk-diary.firebasestorage.app",
          GRIN_GOODS_EVIDENCE_FUNCTIONS: "TRUE",
        },
        fakePorts as never
      )
  );
  assert.equal(result && typeof result === "object" && "code" in result && result.code === "policy_denied", true);
}

{
  const mustNotRun = async () => {
    throw new Error("adapter must not run when auth is null");
  };
  const adapter = {
    register: mustNotRun,
    reconcile: mustNotRun,
    amendFields: mustNotRun,
    recordQc: mustNotRun,
    dispatchReturn: mustNotRun,
    correctReturnDispatch: mustNotRun,
    voidWithReason: mustNotRun,
    recordEwbObservation: mustNotRun,
    linkVerifiedEvidence: mustNotRun,
    readReceipt: mustNotRun,
  } as unknown as ComposedGrinAdapter;
  const evidence = {
    reserve: mustNotRun,
    beginUpload: mustNotRun,
    completeUpload: mustNotRun,
    verify: mustNotRun,
    link: mustNotRun,
  } as unknown as ComposedEvidenceAdapter;
  const load = async () =>
    createComposedGrinCallables({
      adapter,
      evidence,
      env: { GRIN_GOODS_EVIDENCE_FUNCTIONS: "true" },
    });
  const registerNull = await runProductionGrinCallable("register", { auth: null, data: {} }, load);
  assert.equal(
    registerNull && typeof registerNull === "object" && "code" in registerNull && registerNull.code === "unauthenticated",
    true
  );
  const uploadNull = await runProductionGrinCallable("uploadEvidence", { auth: null, data: {} }, load);
  assert.equal(uploadNull && typeof uploadNull === "object" && "ok" in uploadNull && uploadNull.ok === false, true);
  assert.equal(
    uploadNull && typeof uploadNull === "object" && "originalDurable" in uploadNull && uploadNull.originalDurable === false,
    true
  );
}

console.log("tools/goods-evidence-emulator/production-exports.injected.unit.test.ts: ok (INJECTED / not live deploy)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
