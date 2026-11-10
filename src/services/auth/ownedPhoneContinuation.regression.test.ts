import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { continueOwnedPhoneNavigation } from "./ownedPhoneContinuation";
import { createAuthChallengePersistence } from "./authChallengePersistence";
import { captureProfileWriteOwnership, profileWriteStillOwned, advanceProfileSessionEpoch } from "./profileWriteOwnership";

function deferred() { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r; }); return { promise, resolve }; }
const tick = () => new Promise<void>((r) => setImmediate(r));

async function navigationBoundary(destination: "email" | "profile" | "dashboard", boundary: "marker" | "ack" | "clear" | "import") {
  const held = deferred();
  const owner = captureProfileWriteOwnership("user-a");
  const isCurrent = () => profileWriteStillOwned(owner, "user-a");
  const calls: string[] = [];
  let ack: (() => void) | undefined;
  const result = continueOwnedPhoneNavigation({
    destination, isCurrent,
    markEmail: async () => { calls.push("marker"); if (boundary === "marker") await held.promise; },
    prepare: () => { calls.push("prepare"); },
    acknowledge: (callback) => { ack = callback; },
    publish: () => { calls.push("publish"); },
    clearChallenge: async () => { calls.push("clear"); if (boundary === "clear") await held.promise; },
    challengeCleared: () => { calls.push("challenge-cleared"); },
    loadClearDigits: async () => { calls.push("import"); if (boundary === "import") await held.promise; return async () => { calls.push("digits-cleared"); }; },
    onError: () => { calls.push("error-ui"); },
  });
  if (boundary === "marker") {
    await tick();
    advanceProfileSessionEpoch();
    held.resolve();
    await assert.rejects(result, /session_changed/);
    assert.deepEqual(calls, ["marker"], "stale marker must not prepare UI or schedule navigation");
    return;
  }
  await result;
  assert.ok(ack);
  if (boundary === "ack") advanceProfileSessionEpoch();
  ack();
  await tick();
  if (boundary !== "ack") {
    if (boundary === "clear" && destination !== "dashboard") assert.ok(calls.includes("publish"), "email/profile opens before cleanup resolves");
    advanceProfileSessionEpoch();
    held.resolve();
  }
  await tick();
  if (boundary === "ack") assert.deepEqual(calls, ["marker", "prepare"]);
  if (boundary === "clear") {
    assert.ok(!calls.includes("challenge-cleared"), "stale cleanup must not clear React's new challenge");
    assert.ok(!calls.includes("import"));
    if (destination === "dashboard") assert.ok(!calls.includes("publish"));
  }
  if (boundary === "import") assert.ok(!calls.includes("digits-cleared"));
  assert.ok(!calls.includes("error-ui"), "stale continuation must not alter new session's error UI");
}

async function persistenceRaces() {
  const old = { phoneE164: "+15550000001", verificationId: "old-attempt" };
  const next = { phoneE164: "+15550000001", verificationId: "new-attempt" };
  let raw: string | null = JSON.stringify(old);
  let holdRead: ReturnType<typeof deferred> | null = deferred();
  let removals = 0;
  const persistence = createAuthChallengePersistence({
    read: async () => { const captured = raw; if (holdRead) await holdRead.promise; return captured; },
    write: async (value) => { raw = value; },
    remove: async () => { removals++; raw = null; },
  });
  const clear = persistence.clear(old);
  await tick();
  const save = persistence.save(next);
  holdRead.resolve(); holdRead = null;
  await Promise.all([clear, save]);
  assert.deepEqual(JSON.parse(raw!), next, "save racing with old captured read must survive");
  await persistence.clear(old);
  assert.deepEqual(JSON.parse(raw!), next, "another attempt's snapshot must survive");
  const owner = captureProfileWriteOwnership("user-a");
  holdRead = deferred();
  const staleClear = persistence.clear(next, () => profileWriteStillOwned(owner, "user-a"));
  await tick(); advanceProfileSessionEpoch(); holdRead.resolve(); holdRead = null;
  await staleClear;
  assert.deepEqual(JSON.parse(raw!), next, "same-UID replacement during read must not delete");
  assert.equal(removals, 1);
}

async function actualWrapperRejectsStaleClear() {
  const source = fs.readFileSync(process.env.WRAPPER_REGRESSION_SOURCE ?? "src/auth-v2/authWrapperProgress.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const storage = new Map<string, string>();
  const exports: Record<string, (...args: any[]) => Promise<void>> = {};
  const fakeRequire = (name: string) => {
    if (name === "@react-native-async-storage/async-storage") return {
      getItem: async (key: string) => storage.get(key) ?? null,
      setItem: async (key: string, value: string) => { storage.set(key, value); },
      removeItem: async (key: string) => { storage.delete(key); },
    };
    if (name === "@/services/auth/authChallengePersistence") return { createAuthChallengePersistence };
    throw new Error(`Unexpected test dependency: ${name}`);
  };
  new Function("require", "exports", compiled)(fakeRequire, exports);
  const old = { phoneE164: "+15550000001", verificationId: "old", devCodeHint: null };
  const next = { ...old, verificationId: "new" };
  await exports.saveAuthWrapperChallenge(old);
  await exports.saveAuthWrapperChallenge(next);
  await exports.clearAuthWrapperChallenge(old, () => true);
  assert.equal(JSON.parse(storage.get("vyd_auth_v2_challenge") ?? "null")?.verificationId, "new", "late acknowledgement must not remove newer persisted challenge");
  await exports.markAuthWrapperEmailComplete("user-a");
  assert.equal(JSON.parse(storage.get("vyd_auth_v2_challenge") ?? "null")?.verificationId, "new", "email marker must not clear unowned challenge");
  await exports.markAuthWrapperEmailPending("user-a");
  await exports.clearAuthWrapperProgress("user-a", () => false);
  assert.equal(JSON.parse(storage.get("vyd_auth_v2_challenge") ?? "null")?.verificationId, "new", "a superseded sign-out must not delete a newer challenge");
  assert.equal(storage.get("vyd_auth_v2_email_pending_user-a"), "1", "a superseded sign-out must not clear a newer email marker");
}

async function main() {
  await actualWrapperRejectsStaleClear();
  for (const destination of ["email", "profile", "dashboard"] as const) {
    for (const boundary of ["marker", "ack", "clear"] as const) await navigationBoundary(destination, boundary);
  }
  await navigationBoundary("email", "import");
  await persistenceRaces();
  const cachedOwner = captureProfileWriteOwnership("user-a");
  advanceProfileSessionEpoch();
  assert.equal(profileWriteStillOwned(cachedOwner, "user-a"), false, "cached verified profile cannot acquire the next session's authority");
  console.log("ownedPhoneContinuation.regression.test.ts: ok");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
