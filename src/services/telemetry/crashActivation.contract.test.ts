import assert from "node:assert/strict";
import {
  __resetCrashReportingForTests,
  __setCrashlyticsClientForTests,
  __setCrashSdkBridgeForTests,
  recordError,
  setCrashReportingEnabled,
} from "./crashReporter";

import { createPurposeConsentQueue, type PurposeQueueState } from "../consent/purposeConsentQueue";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function tick() { for (let i = 0; i < 12; i++) await Promise.resolve(); }

const SCOPE = { ownerUid: "fixture-owner", consentRevision: 1 };
let rnReports = 0;
let autoCollectionWrites: boolean[] = [];

function installNativeDouble(handlers: {
  collection?: (enabled: boolean) => Promise<void> | void;
  preference?: () => Promise<void> | void;
  delete?: () => Promise<void> | void;
  record?: () => void;
} = {}) {
  __setCrashlyticsClientForTests({
    setCrashlyticsCollectionEnabled: async (enabled) => {
      autoCollectionWrites.push(enabled);
      assert.equal(enabled, false, "automatic collection must remain disabled");
      await handlers.preference?.();
    },
    recordError: () => { rnReports++; }, log: () => {}, setUserId: () => {},
  });
  __setCrashSdkBridgeForTests({
    setSessionReportingEnabled: async (enabled, ownerUid, revision) => {
      if (enabled) {
        assert.equal(ownerUid, SCOPE.ownerUid);
        assert.equal(revision, SCOPE.consentRevision);
      }
      await handlers.collection?.(enabled);
    },
    deleteUnsentReports: async () => { await handlers.delete?.(); },
    recordDiagnostic: () => { handlers.record?.(); }, logDiagnostic: () => {},
  });
}

async function main() {
  let reports = 0;
  const gate = deferred();
  __resetCrashReportingForTests();
  installNativeDouble({
    collection: (enabled) => enabled ? gate.promise : undefined,
    record: () => { reports++; },
  });
  const activation = setCrashReportingEnabled(true, SCOPE);
  await tick();
  recordError(new Error("synthetic test"));
  assert.equal(reports, 0, "pending activation must not pass reports to the bridge");
  gate.reject(new Error("synthetic activation rejection"));
  assert.equal((await activation).ok, false);
  recordError(new Error("synthetic test"));
  assert.equal(reports, 0, "failed activation must keep reporting closed");

  __resetCrashReportingForTests();
  const success = deferred();
  installNativeDouble({
    collection: (enabled) => enabled ? success.promise : undefined,
    record: () => { reports++; },
  });
  const allowed = setCrashReportingEnabled(true, SCOPE);
  await tick();
  success.resolve();
  const accepted = await allowed;
  assert.equal(accepted.ok, true);
  assert.equal(accepted.sessionReporting, true);
  assert.equal(accepted.preference, false);
  recordError(new Error("synthetic test"));
  assert.equal(reports, 1, "accepted native session permits a sanitized report");

  __resetCrashReportingForTests();
  const enable = deferred();
  const calls: string[] = [];
  installNativeDouble({
    collection: async (enabled) => {
      calls.push(enabled ? "enable" : "disable");
      if (enabled) await enable.promise;
    },
    delete: () => { calls.push("delete_requested"); },
    record: () => { reports++; },
  });
  const stale = setCrashReportingEnabled(true, SCOPE);
  await tick();
  const withdrawn = setCrashReportingEnabled(false, { deleteUnsentReports: true });
  assert.ok(calls.includes("disable"), "native close is invoked without waiting for older enable");
  recordError(new Error("synthetic test"));
  assert.equal(reports, 1);
  enable.resolve();
  assert.equal((await stale).ok, false, "a superseded activation cannot report success");
  const off = await withdrawn;
  assert.equal(off.ok, true);
  assert.equal(off.unsentReports, "deletion_requested");
  assert.equal(off.sessionReporting, false);
  assert.equal(calls.at(-1), "delete_requested");
  recordError(new Error("synthetic test"));
  assert.equal(reports, 1, "late enable completion cannot reopen reporting");

  __resetCrashReportingForTests();
  let rejectDisable = false;
  installNativeDouble({
    collection: (enabled) => {
      if (!enabled && rejectDisable) {
        recordError(new Error("synthetic reentrant report"));
        throw new Error("disable rejected");
      }
    },
    record: () => { reports++; },
  });
  await setCrashReportingEnabled(true, SCOPE);
  rejectDisable = true;
  const failedDisable = await setCrashReportingEnabled(false, { deleteUnsentReports: true });
  assert.equal(failedDisable.ok, false);
  assert.equal(reports, 1, "withdrawal closes the gate before a synchronous native failure");

  __resetCrashReportingForTests();
  installNativeDouble({
    delete: () => { throw new Error("cleanup rejected"); },
    record: () => { reports++; },
  });
  const failedCleanup = await setCrashReportingEnabled(false, { deleteUnsentReports: true });
  assert.equal(failedCleanup.ok, false);
  assert.equal(failedCleanup.unsentReports, "error");
  recordError(new Error("synthetic test"));
  assert.equal(reports, 1);
  const reenableAfterFailedCleanup = await setCrashReportingEnabled(true, SCOPE);
  assert.equal(reenableAfterFailedCleanup.ok, false, "failed withdrawal cleanup must be retried before native enable");
  recordError(new Error("synthetic test"));
  assert.equal(reports, 1);
  assert.equal(rnReports, 0, "RNFirebase recordError is never used while automatic collection stays off");
  assert.ok(autoCollectionWrites.length > 0);
  assert.equal(autoCollectionWrites.includes(true), false);
  __resetCrashReportingForTests();
  await retainedReportsDuringConsentRecovery();
  console.log("crashActivation.contract.test.ts: ok");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

async function retainedReportsDuringConsentRecovery() {
  __resetCrashReportingForTests();
  let retained = 1;
  let deletions = 0;
  let onHealth!: (health: "listening" | "server" | "failed") => void;
  const stored: PurposeQueueState = {
    uid: "fixture-owner", revision: 1, localGrant: true, hasChoice: true,
    pending: null, sync: "synced",
  };
  installNativeDouble({ delete: () => { deletions++; retained = 0; } });
  const queue = createPurposeConsentQueue({
    load: async () => stored, save: async () => {}, generation: () => 1,
    operationId: () => "fixture-withdrawal",
    applyLocal: setCrashReportingEnabled,
    send: async () => ({ ok: true, revision: 2, decision: "withdraw", receivedAt: 2 }),
    observeRemote: (_uid, _generation, _remote, health) => { onHealth = health; return () => {}; },
  });
  queue.bind("fixture-owner");
  await queue.reconcile("fixture-owner");
  assert.equal(retained, 1, "startup must retain a previously consented unsent report while authority is pending");
  assert.equal(deletions, 0);
  __resetCrashReportingForTests();
  retained = 1;
  deletions = 0;
  const withdrawn: PurposeQueueState = {
    ...stored, localGrant: false, hasChoice: true, pending: null,
  };
  installNativeDouble({ delete: () => { deletions++; retained = 0; } });
  const withdrawnQueue = createPurposeConsentQueue({
    load: async () => withdrawn, save: async () => {}, generation: () => 1,
    operationId: () => "fixture-stored-withdrawal",
    applyLocal: setCrashReportingEnabled,
    send: async () => ({ ok: true, revision: 2, decision: "withdraw", receivedAt: 2 }),
    observeRemote: () => () => {},
  });
  withdrawnQueue.bind("fixture-owner");
  await withdrawnQueue.reconcile("fixture-owner");
  assert.equal(retained, 0, "a stored withdrawal retries unsent-report deletion on startup");
  assert.ok(deletions > 0);
  __resetCrashReportingForTests();
  retained = 1;
  deletions = 0;
  installNativeDouble({ delete: () => { deletions++; retained = 0; } });
  onHealth("failed");
  await queue.reconcile("fixture-owner");
  assert.equal(retained, 1, "temporary listener failure must pause without deleting retained reports");
  await queue.choose("fixture-owner", false);
  assert.equal(retained, 0, "explicit withdrawal must request unsent-report deletion");
  assert.ok(deletions > 0);
  retained = 1;
  const beforeAccountChange = deletions;
  queue.bind("another-fixture-owner");
  await queue.reconcile("another-fixture-owner");
  assert.equal(retained, 0, "account retirement requests cleanup before the next account can activate");
  assert.ok(deletions > beforeAccountChange);
  __resetCrashReportingForTests();
}
