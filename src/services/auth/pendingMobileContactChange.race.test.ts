/** Production pending store and reconciliation, with synthetic SecureStore/native/callable I/O. */
import assert from "node:assert/strict";
import Module from "node:module";
import { beginSessionCommit, __resetAuthSessionFenceForTests } from "./authSessionFence";
import type { UserProfile } from "@/domain/types";

const KEY = "vyd_pending_mobile_contact_change_v1";
const OLD = "+919800000081";
const NEW = "+919800000082";
const storage = new Map<string, string>();
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
let heldRead: ReturnType<typeof deferred<void>> | null = null;
let readEntered: ReturnType<typeof deferred<void>> | null = null;
let uid: string | null = "owner-a";
let phone: string | null = NEW;
let calls = 0;
let bridge: () => Promise<void> = async () => undefined;
let confirm: () => Promise<UserProfile> = async () => ({ uid: "owner-a", phoneE164: NEW } as UserProfile);
const originalRequire = Module.prototype.require;
Module.prototype.require = function(this: NodeJS.Module, id: string) {
  if (id === "react-native") return { Platform: { OS: "android" } };
  if (id === "expo-constants") return { default: { expoConfig: {}, manifest: null } };
  if (id === "expo-secure-store") return {
    getItemAsync: async (key: string) => {
      const value = storage.get(key) ?? null;
      const held = heldRead;
      if (held) { heldRead = null; readEntered?.resolve(); await held.promise; }
      return value;
    },
    setItemAsync: async (key: string, value: string) => { storage.set(key, value); },
    deleteItemAsync: async (key: string) => { storage.delete(key); },
  };
  if (id === "./nativePhoneAuth") return { getNativeAuthUid: () => uid, getNativeAuthPhoneE164: () => phone };
  if (id === "./jsAuthBridge") return { requireJsAuthSessionForFirestore: () => bridge() };
  if (id === "./identityCallable") return {
    callPreflightVerifiedMobileContactChange: async () => ({ operationId: "preflight" }),
    callConfirmVerifiedMobileContactChange: async () => { calls++; return confirm(); },
  };
  if (id === "@react-native-firebase/auth") return { default: () => ({ currentUser: uid ? { uid, getIdToken: async () => "fixture-token" } : null }) };
  return originalRequire.apply(this, arguments as unknown as [string]);
};

async function main() {
  const pending = await import("./pendingMobileContactChange");
  const flow = await import("./reconcilePendingMobileContactChange");
  const row = (operationId: string, owner = "owner-a") => ({ uid: owner, oldPhoneE164: OLD, newPhoneE164: NEW, operationId, authUpdatedAt: 1, purpose: "contact_change" as const });
  const profile = { uid: "owner-a", phoneE164: OLD } as UserProfile;
  const failures: string[] = [];
  async function check(name: string, run: () => Promise<void>) {
    storage.clear(); __resetAuthSessionFenceForTests(); uid = "owner-a"; phone = NEW; calls = 0;
    heldRead = null; bridge = async () => undefined;
    confirm = async () => ({ ...profile, phoneE164: NEW });
    try { await run(); } catch (error) { failures.push(`${name}: ${String(error)}`); }
  }
  await check("malformed read cannot delete replacement", async () => {
    storage.set(KEY, "{invalid");
    const held = deferred<void>(); heldRead = held; readEntered = deferred<void>();
    const reading = pending.loadPendingMobileContactChange(); await readEntered.promise;
    await pending.savePendingMobileContactChange(row("replacement"));
    held.resolve(); assert.equal(await reading, null);
    assert.equal((await pending.loadPendingMobileContactChange())?.operationId, "replacement");
  });
  await check("late completed bind cannot clear replacement", async () => {
    const started = deferred<void>(); const result = deferred<UserProfile>();
    confirm = () => { started.resolve(); return result.promise; };
    const completion = flow.completeServerMobileBindAfterAuthUpdate({ uid: "owner-a", oldPhoneE164: OLD, newerPhoneE164: NEW, operationId: "old-bind" });
    await started.promise;
    await pending.savePendingMobileContactChange(row("replacement"));
    result.resolve({ ...profile, phoneE164: NEW }); await completion;
    assert.equal((await pending.loadPendingMobileContactChange())?.operationId, "replacement");
  });
  await check("foreign pending id is not reused", async () => {
    const decision = pending.shouldRetryServerMobileBind({ uid: "owner-a", authPhoneE164: NEW, profilePhoneE164: OLD, pending: row("foreign-operation", "owner-b") });
    assert.equal(decision.retry, true);
    if (decision.retry) assert.notEqual(decision.operationId, "foreign-operation");
  });
  await check("conditional clear is serialized with replacement save", async () => {
    const old = row("old-bind"); await pending.savePendingMobileContactChange(old);
    const held = deferred<void>(); heldRead = held; readEntered = deferred<void>();
    const clearing = pending.clearPendingMobileContactChangeIfMatches(old);
    await readEntered.promise;
    const saving = pending.savePendingMobileContactChange(row("new-bind"));
    held.resolve(); await clearing; await saving;
    assert.equal((await pending.loadPendingMobileContactChange())?.operationId, "new-bind");
  });
  await check("same UID replacement during bridge cannot dispatch", async () => {
    bridge = async () => { beginSessionCommit(); };
    await assert.rejects(flow.completeServerMobileBindAfterAuthUpdate({ uid: "owner-a", oldPhoneE164: OLD, newerPhoneE164: NEW, operationId: "old-bind" }), /session_changed/);
    assert.equal(calls, 0);
    assert.equal((await pending.loadPendingMobileContactChange())?.operationId, "old-bind", "unknown result preserves recovery state");
  });
  await check("foreign account during resume cannot dispatch", async () => {
    await pending.savePendingMobileContactChange(row("old-bind"));
    bridge = async () => { uid = "owner-b"; };
    await assert.rejects(flow.reconcilePendingMobileContactChange(profile), /session_changed/);
    assert.equal(calls, 0);
    assert.equal((await pending.loadPendingMobileContactChange())?.operationId, "old-bind");
  });
  await check("retired completion cannot publish or clear another owner", async () => {
    const started = deferred<void>(); const result = deferred<UserProfile>();
    confirm = () => { started.resolve(); return result.promise; };
    const completion = flow.completeServerMobileBindAfterAuthUpdate({ uid: "owner-a", oldPhoneE164: OLD, newerPhoneE164: NEW, operationId: "old-bind" });
    const rejected = assert.rejects(completion, /session_changed/);
    await started.promise; uid = "owner-b"; beginSessionCommit();
    await pending.savePendingMobileContactChange(row("new-owner-bind", "owner-b"));
    result.resolve({ ...profile, phoneE164: NEW }); await rejected;
    assert.equal((await pending.loadPendingMobileContactChange())?.operationId, "new-owner-bind");
  });
  await check("owned completion clears only its own row", async () => {
    const result = await flow.completeServerMobileBindAfterAuthUpdate({ uid: "owner-a", oldPhoneE164: OLD, newerPhoneE164: NEW, operationId: "owned" });
    assert.equal(result.uid, "owner-a"); assert.equal(calls, 1);
    assert.equal(await pending.loadPendingMobileContactChange(), null);
  });
  if (failures.length) throw new Error(failures.join("\n"));
  console.log("pendingMobileContactChange.race.test.ts: ok");
}
void main().finally(() => { Module.prototype.require = originalRequire; }).catch(error => { console.error(error); process.exitCode = 1; });
