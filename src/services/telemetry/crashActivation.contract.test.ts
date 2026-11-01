import assert from "node:assert/strict";
import {
  __resetCrashReportingForTests,
  __setCrashlyticsClientForTests,
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

async function main() {
  let reports = 0;
  const gate = deferred();
  __resetCrashReportingForTests();
  __setCrashlyticsClientForTests({
    setCrashlyticsCollectionEnabled: () => gate.promise,
    recordError: () => { reports++; }, log: () => {}, setUserId: () => {},
  });
  const activation = setCrashReportingEnabled(true);
  await tick();
  recordError(new Error("synthetic test"));
  assert.equal(reports, 0, "pending activation must not pass reports to the SDK");
  gate.reject(new Error("synthetic activation rejection"));
  assert.equal((await activation).ok, false);
  recordError(new Error("synthetic test"));
  assert.equal(reports, 0, "failed activation must keep reporting closed");

  __resetCrashReportingForTests();
  const success = deferred();
  __setCrashlyticsClientForTests({
    setCrashlyticsCollectionEnabled: () => success.promise,
    recordError: () => { reports++; }, log: () => {}, setUserId: () => {},
  });
  const allowed = setCrashReportingEnabled(true);
  await tick();
  success.resolve();
  assert.equal((await allowed).ok, true);
  recordError(new Error("synthetic test"));
  assert.equal(reports, 1, "successful activation permits a redacted report");

  __resetCrashReportingForTests();
  const enable = deferred();
  const calls: string[] = [];
  __setCrashlyticsClientForTests({
    setCrashlyticsCollectionEnabled: async (value) => {
      calls.push(value ? "enable" : "disable");
      if (value) await enable.promise;
    },
    deleteUnsentReports: async () => { calls.push("delete_requested"); },
    recordError: () => { reports++; }, log: () => {}, setUserId: () => {},
  });
  const stale = setCrashReportingEnabled(true);
  await tick();
  const withdrawn = setCrashReportingEnabled(false, { deleteUnsentReports: true });
  assert.equal(calls.at(-1), "disable", "native disable is invoked without waiting for older enable");
  recordError(new Error("synthetic test"));
  assert.equal(reports, 1);
  enable.resolve();
  assert.equal((await stale).ok, false, "a superseded activation cannot report success");
  const off = await withdrawn;
  assert.equal(off.ok, true);
  assert.equal(off.unsentReports, "deletion_requested");
  assert.equal(calls.at(-1), "delete_requested");
  recordError(new Error("synthetic test"));
  assert.equal(reports, 1, "late enable completion cannot reopen reporting");

  __resetCrashReportingForTests();
  let rejectDisable = false;
  __setCrashlyticsClientForTests({
    setCrashlyticsCollectionEnabled: (value) => {
      if (!value && rejectDisable) {
        recordError(new Error("synthetic reentrant report"));
        throw new Error("disable rejected");
      }
      return Promise.resolve();
    },
    deleteUnsentReports: async () => {},
    recordError: () => { reports++; }, log: () => {}, setUserId: () => {},
  });
  await setCrashReportingEnabled(true);
  rejectDisable = true;
  const failedDisable = await setCrashReportingEnabled(false, { deleteUnsentReports: true });
  assert.equal(failedDisable.ok, false);
  assert.equal(reports, 1, "withdrawal closes the gate before a synchronous native failure");

  __resetCrashReportingForTests();
  __setCrashlyticsClientForTests({
    setCrashlyticsCollectionEnabled: async () => {},
    deleteUnsentReports: async () => { throw new Error("cleanup rejected"); },
    recordError: () => { reports++; }, log: () => {}, setUserId: () => {},
  });
  const failedCleanup = await setCrashReportingEnabled(false, { deleteUnsentReports: true });
  assert.equal(failedCleanup.ok, false);
  assert.equal(failedCleanup.unsentReports, "error");
  recordError(new Error("synthetic test"));
  assert.equal(reports, 1);
  const reenableAfterFailedCleanup = await setCrashReportingEnabled(true);
  assert.equal(reenableAfterFailedCleanup.ok, false, "failed withdrawal cleanup must be retried before native enable");
  recordError(new Error("synthetic test"));
  assert.equal(reports, 1);
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
    pending: null, sync: "synced", reportingEnabled: true,
  };
  __setCrashlyticsClientForTests({
    setCrashlyticsCollectionEnabled: async () => {},
    deleteUnsentReports: async () => { deletions++; retained = 0; },
    recordError: () => {}, log: () => {}, setUserId: () => {},
  });
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
    ...stored, localGrant: false, hasChoice: true, pending: null, reportingEnabled: false,
  };
  __setCrashlyticsClientForTests({
    setCrashlyticsCollectionEnabled: async () => {},
    deleteUnsentReports: async () => { deletions++; retained = 0; },
    recordError: () => {}, log: () => {}, setUserId: () => {},
  });
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
  __setCrashlyticsClientForTests({
    setCrashlyticsCollectionEnabled: async () => {},
    deleteUnsentReports: async () => { deletions++; retained = 0; },
    recordError: () => {}, log: () => {}, setUserId: () => {},
  });
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
