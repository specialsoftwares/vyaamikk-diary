/**
 * Account-scoped crash consent. Source behavior: ef9c77f and 1c1a014.
 * Executed with an injected Crashlytics port. Not a native device test.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { purposeTransition, type PurposeState } from "../../../functions/src/privacy/processingPurposeState";
import {
  createPurposeConsentQueue,
  type PurposeQueueState,
  type PurposeServerState,
} from "../consent/purposeConsentQueue";
import { crashConsentCopy } from "./crashConsentCopy";
import {
  CRASH_CONSENT_SOURCE_SHAS,
  applyServerAcknowledgement,
  beginLocalChoice,
  crashConsentForAccount,
  crashConsentStatus,
  crashReportingActive,
  hydrateCrashConsent,
  initialCrashConsent,
  nativeFromApply,
  relaunchCrashConsent,
} from "./crashConsentState";
import { nextProcessCrashCollectionEnabled } from "./crashNativeCollection";
import {
  __resetCrashReportingForTests,
  __setCrashSdkBridgeForTests,
  __setCrashlyticsClientForTests,
  recordError,
  setCrashReportingEnabled,
} from "./crashReporter";
import { loadDiagnosticsPreference, resetDiagnosticsPreferenceForTests } from "./diagnosticsPreference";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function ticks(count = 12) {
  for (let i = 0; i < count; i += 1) await Promise.resolve();
}

type Health = "listening" | "server" | "failed";

function harness() {
  const disk = new Map<string, PurposeQueueState>();
  let remote: PurposeState = { revision: 0, decision: null, receivedAt: null };
  const events = new Set<string>();
  let operation = 0;
  let onRemote: ((event: PurposeServerState) => void) | null = null;
  let onHealth: ((health: Health) => void) | null = null;
  let holdWithdraw: Promise<void> | null = null;
  const ports = {
    load: async (uid: string) => disk.get(uid) ?? null,
    save: async (state: PurposeQueueState) => {
      disk.set(state.uid, structuredClone(state));
    },
    generation: () => 1,
    operationId: () => `operation_${++operation}`,
    applyLocal: (enabled: boolean, options?: { deleteUnsentReports?: boolean }) =>
      setCrashReportingEnabled(enabled, { deleteUnsentReports: options?.deleteUnsentReports === true }),
    send: async (
      input:
        | { uid: string; purpose: "crash_diagnostics"; decision: "grant" | "withdraw"; operationId: string; expectedRevision: number }
        | { uid: string; purpose: "crash_diagnostics"; action: "read" }
    ) => {
      if ("action" in input) return { ok: true as const, ...remote };
      if (input.decision === "withdraw" && holdWithdraw) await holdWithdraw;
      const transition = purposeTransition(
        remote,
        { ...input, alreadyReceived: events.has(input.operationId) },
        10
      );
      if (transition.apply) {
        events.add(input.operationId);
        remote = transition.state;
      }
      return { ok: true as const, ...remote, conflict: transition.conflict };
    },
    observeRemote: (
      _uid: string,
      _generation: number,
      remoteListener: (event: PurposeServerState) => void,
      healthListener: (health: Health) => void
    ) => {
      onRemote = remoteListener;
      onHealth = healthListener;
      return () => {
        onRemote = null;
        onHealth = null;
      };
    },
  };
  return {
    disk,
    ports,
    holdWithdraw: (promise: Promise<void> | null) => {
      holdWithdraw = promise;
    },
    snapshot: (event: PurposeServerState) => onRemote?.(event),
    health: (health: Health) => onHealth?.(health),
    remote: () => remote,
  };
}

function createCrashDouble(handlers?: {
  onCollection?: (enabled: boolean) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onRecord?: () => void;
  bridge?: "present" | "absent" | "fail";
}) {
  const snap = {
    preference: true,
    sessionReporting: false,
    unsentDeletion: "none" as "none" | "requested",
  };
  const bridge = handlers?.bridge ?? "present";
  __setCrashlyticsClientForTests({
    setCrashlyticsCollectionEnabled: async (enabled) => {
      snap.preference = enabled;
    },
    deleteUnsentReports: async () => {
      snap.unsentDeletion = "requested";
      await handlers?.onDelete?.();
    },
    recordError: () => undefined,
    log: () => undefined,
    setUserId: () => undefined,
  });
  if (bridge === "absent") {
    __setCrashSdkBridgeForTests(null);
  } else {
    __setCrashSdkBridgeForTests({
      setSessionReportingEnabled: async (enabled) => {
        if (bridge === "fail" && enabled) throw new Error("bridge rejected");
        snap.sessionReporting = enabled;
        try {
          await handlers?.onCollection?.(enabled);
        } catch (error) {
          if (enabled) snap.sessionReporting = false;
          throw error;
        }
      },
      recordDiagnostic: async () => {
        handlers?.onRecord?.();
      },
      logDiagnostic: async () => undefined,
      deleteUnsentReports: async () => {
        snap.unsentDeletion = "requested";
        await handlers?.onDelete?.();
      },
    });
  }
  return snap;
}

function installClient(handlers?: {
  onCollection?: (enabled: boolean) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onRecord?: () => void;
  bridge?: "present" | "absent" | "fail";
}) {
  return createCrashDouble(handlers);
}

async function main(): Promise<void> {
  assert.deepEqual(CRASH_CONSENT_SOURCE_SHAS, ["ef9c77f", "1c1a014"]);

  const en = crashConsentCopy("en");
  const hi = crashConsentCopy("hi");
  for (const copy of [en, hi]) {
    assert.equal(typeof copy.status.pending, "string");
    assert.equal(typeof copy.status.active, "string");
    assert.equal(typeof copy.status.failed, "string");
    assert.equal(typeof copy.status.unavailable, "string");
    assert.match(copy.unsentDeletionRequested, /uploaded|अपलोड/);
  }
  assert.match(en.unsentDeletionRequested, /unsent/i);
  assert.match(en.unsentDeletionRequested, /not deleted/i);
  assert.match(hi.unsentDeletionRequested, /नहीं हटतीं/);
  assert.equal(crashConsentCopy("te").title, en.title);

  const row = readFileSync(resolve("src/components/settings/CrashReportsPreferenceRow.tsx"), "utf8");
  const host = readFileSync(resolve("src/components/telemetry/TelemetryConsentHost.tsx"), "utf8");
  const modal = readFileSync(resolve("src/components/TelemetryConsentModal.tsx"), "utf8");
  assert.match(row, /crashConsentStatus/);
  assert.match(row, /crashConsentCopy/);
  assert.doesNotMatch(row, /desired === "on"/);
  assert.match(host, /crashConsentCopy/);
  assert.match(host, /choice\.decision === "unset"/);
  assert.match(modal, /allowLabel/);
  assert.doesNotMatch(modal, /already uploaded are deleted/);

  const pendingChoice = beginLocalChoice(initialCrashConsent("account-a"), "allow", {
    operationId: "persist",
    expectedServerRevision: 0,
  });
  assert.equal(crashConsentStatus(pendingChoice), "pending");
  assert.equal(crashConsentStatus(relaunchCrashConsent(pendingChoice)), "pending");
  const failed: typeof pendingChoice = {
    ...pendingChoice,
    pending: null,
    acknowledgement: { revision: pendingChoice.choice.revision, decision: "allow", serverRevision: pendingChoice.choice.revision },
    sessionAcknowledgement: pendingChoice.choice.revision,
    native: "failed",
  };
  assert.equal(crashConsentStatus(failed), "failed");
  assert.equal(crashConsentStatus(relaunchCrashConsent(failed)), "failed");
  const unavailable = { ...failed, native: "unavailable" as const };
  assert.equal(crashConsentStatus(unavailable), "unavailable");
  assert.equal(crashConsentStatus(relaunchCrashConsent(unavailable)), "unavailable");
  const active = { ...failed, native: "enabled" as const };
  assert.equal(crashConsentStatus(active), "active");
  const relaunched = relaunchCrashConsent(active);
  assert.equal(crashConsentStatus(relaunched), "pending");
  assert.equal(crashReportingActive(relaunched), false);
  const accountB = crashConsentForAccount(active, "account-b");
  assert.equal(accountB.choice.uid, "account-b");
  assert.equal(accountB.choice.decision, "unset");
  assert.equal(crashConsentStatus(accountB), "off");
  assert.equal(crashConsentStatus(crashConsentForAccount(active, "account-a")), "active");

  const withdrawn = beginLocalChoice(active, "withdraw", { operationId: "newer", expectedServerRevision: 1 });
  const staleGrant = applyServerAcknowledgement(withdrawn, { revision: active.choice.revision, decision: "grant" });
  assert.equal(staleGrant.stale, true);
  assert.equal(staleGrant.consent.choice.decision, "withdraw");
  assert.equal(staleGrant.consent.choice.revision, withdrawn.choice.revision);
  const otherAccount = hydrateCrashConsent(
    {
      uid: "account-b",
      revision: 3,
      localGrant: false,
      hasChoice: false,
      pending: null,
      sync: "unknown",
      consent: active,
    },
    true
  );
  assert.equal(otherAccount.choice.uid, "account-b");
  assert.equal(otherAccount.choice.decision, "unset");

  await allowThenDelayedSnapshotAndRestart();
  await withdrawalDuringActivation();
  await nativeActivationFailure();
  await accountSwitchKeepsChoice();
  await staleAcknowledgementIgnored();
  await storedWithdrawalRetriesUnsentDeletion();
  await failedPersistIsNotActive();
  await legacyFlagDoesNotEnable();
  await delayedDiskAfterAcknowledgedAllow();
  await delayedDiskAfterWithdrawal();
  await accountSwitchDropsPreviousGrant();
  await grantWithoutRuntimeBridge();
  await grantWithBridgeLeavesPreferenceFalse();
  assert.equal(
    nextProcessCrashCollectionEnabled({ sdkOverride: false, preference: false, firebaseJson: true, manifest: true }),
    false,
    "early bootstrap resets the persistent SDK override before SDK initialization"
  );
  assert.equal(
    nextProcessCrashCollectionEnabled({ sdkOverride: false, preference: null, firebaseJson: false, manifest: true }),
    false
  );
  assert.equal(nativeFromApply(true, { status: "enabled", preference: false }), "unavailable");
  assert.equal(nativeFromApply(true, { nativeState: "on" }), "unavailable");
  assert.equal(
    nativeFromApply(true, { status: "enabled", preference: true, sessionReporting: true }),
    "failed"
  );
  assert.equal(
    nativeFromApply(true, { status: "enabled", preference: false, sessionReporting: true }),
    "enabled"
  );

  console.log("crashConsentState.test.ts: ok");
}

async function allowThenDelayedSnapshotAndRestart(): Promise<void> {
  __resetCrashReportingForTests();
  let reports = 0;
  let deletions = 0;
  installClient({
    onDelete: () => {
      deletions += 1;
    },
    onRecord: () => {
      reports += 1;
    },
  });
  const world = harness();
  const queue = createPurposeConsentQueue(world.ports);
  queue.bind("account-a");
  world.health("server");
  await queue.choose("account-a", true);
  await ticks();
  const allowed = queue.state("account-a")?.consent;
  assert.ok(allowed);
  assert.equal(allowed.choice.decision, "allow");
  assert.equal(allowed.choice.uid, "account-a");
  assert.equal(crashConsentStatus(allowed), "active");
  recordError(new Error("synthetic"));
  assert.equal(reports, 1);
  const revision = allowed.choice.revision;
  world.snapshot({ ok: true, revision: revision - 1, decision: "withdraw", receivedAt: 1 });
  await ticks();
  const afterSnapshot = queue.state("account-a")?.consent;
  assert.equal(afterSnapshot?.choice.decision, "allow", "a delayed older snapshot must not revert Allow");
  assert.equal(afterSnapshot?.choice.revision, revision);
  assert.equal(crashConsentStatus(afterSnapshot!), "active");
  assert.equal(world.disk.get("account-a")?.consent?.choice.decision, "allow");

  __resetCrashReportingForTests();
  reports = 0;
  deletions = 0;
  installClient({
    onDelete: () => {
      deletions += 1;
    },
    onRecord: () => {
      reports += 1;
    },
  });
  const restarted = createPurposeConsentQueue(world.ports);
  restarted.bind("account-a");
  await restarted.reconcile("account-a");
  const reloaded = restarted.state("account-a")?.consent;
  assert.equal(reloaded?.choice.decision, "allow");
  assert.equal(reloaded?.choice.uid, "account-a");
  assert.equal(reloaded?.choice.revision, revision);
  assert.notEqual(crashConsentStatus(reloaded!), "active");
  assert.equal(crashConsentStatus(relaunchCrashConsent(allowed)), crashConsentStatus(reloaded!));
  recordError(new Error("synthetic"));
  assert.equal(reports, 0, "restart keeps native off until acknowledgement and activation");
  assert.equal(deletions, 0, "a restarted Allow does not delete unsent reports");

  world.health("server");
  await restarted.reconcile("account-a");
  await ticks(20);
  const confirmed = restarted.state("account-a")?.consent;
  assert.equal(confirmed?.choice.decision, "allow");
  assert.equal(crashConsentStatus(confirmed!), "active");
  assert.equal(crashConsentStatus(confirmed!), crashConsentStatus(allowed));
  recordError(new Error("synthetic"));
  assert.equal(reports, 1);
  __resetCrashReportingForTests();
}

async function withdrawalDuringActivation(): Promise<void> {
  __resetCrashReportingForTests();
  let reports = 0;
  const calls: string[] = [];
  const enableGate = deferred<void>();
  const withdrawSend = deferred<void>();
  const snap = createCrashDouble({
    onCollection: async (enabled) => {
      calls.push(enabled ? "enable" : "disable");
      if (enabled) await enableGate.promise;
    },
    onDelete: () => {
      calls.push("delete");
    },
    onRecord: () => {
      reports += 1;
    },
  });
  const world = harness();
  world.holdWithdraw(withdrawSend.promise);
  const queue = createPurposeConsentQueue(world.ports);
  queue.bind("account-a");
  world.health("server");
  const allow = queue.choose("account-a", true);
  for (let i = 0; i < 40 && !calls.includes("enable"); i += 1) await Promise.resolve();
  assert.ok(calls.includes("enable"));
  const withdraw = queue.choose("account-a", false);
  for (let i = 0; i < 40 && calls.lastIndexOf("disable") < calls.indexOf("enable"); i += 1) {
    await Promise.resolve();
  }
  assert.ok(calls.lastIndexOf("disable") > calls.indexOf("enable"));
  assert.equal(snap.sessionReporting, false, "withdrawal clears the running SDK while enable is in flight");
  assert.equal(snap.preference, false, "withdrawal writes the auto-collection preference false");
  assert.equal(snap.unsentDeletion, "requested");
  recordError(new Error("synthetic"));
  assert.equal(reports, 0, "withdrawal closes the gate while activation is in flight");
  for (
    let i = 0;
    i < 80 &&
    !(
      queue.state("account-a")?.consent?.pending?.decision === "withdraw" &&
      queue.state("account-a")?.consent?.pending?.phase === "sync"
    );
    i += 1
  ) {
    await Promise.resolve();
  }
  const mid = queue.state("account-a")?.consent;
  assert.ok(mid);
  assert.equal(mid.pending?.decision, "withdraw");
  assert.equal(mid.pending?.phase, "sync");
  assert.notEqual(mid.native, "enabled");
  assert.equal(crashConsentStatus(mid), "pending");
  enableGate.resolve();
  withdrawSend.resolve();
  await allow;
  await withdraw;
  await ticks();
  const end = queue.state("account-a")?.consent;
  assert.ok(end);
  assert.equal(end.choice.decision, "withdraw");
  assert.equal(end.choice.uid, "account-a");
  assert.notEqual(end.native, "enabled");
  assert.notEqual(crashConsentStatus(end), "active");
  assert.equal(end.unsentDeletionRequested, true);
  assert.ok(calls.includes("delete"));
  recordError(new Error("synthetic"));
  assert.equal(reports, 0);
  __resetCrashReportingForTests();
}

async function nativeActivationFailure(): Promise<void> {
  __resetCrashReportingForTests();
  let reports = 0;
  installClient({
    onCollection: (enabled) => {
      if (enabled) throw new Error("native rejected");
    },
    onRecord: () => {
      reports += 1;
    },
  });
  const world = harness();
  const queue = createPurposeConsentQueue(world.ports);
  queue.bind("account-a");
  world.health("server");
  await queue.choose("account-a", true);
  const failed = queue.state("account-a")?.consent;
  assert.ok(failed);
  assert.equal(failed.choice.decision, "allow");
  assert.equal(failed.native, "failed");
  assert.equal(crashConsentStatus(failed), "failed");
  assert.equal(crashReportingActive(failed), false);
  recordError(new Error("synthetic"));
  assert.equal(reports, 0);
  const restarted = relaunchCrashConsent(failed);
  assert.equal(crashConsentStatus(restarted), "failed");
  __resetCrashReportingForTests();
}

async function accountSwitchKeepsChoice(): Promise<void> {
  __resetCrashReportingForTests();
  let reports = 0;
  installClient({
    onRecord: () => {
      reports += 1;
    },
  });
  const world = harness();
  const queue = createPurposeConsentQueue(world.ports);
  queue.bind("account-a");
  world.health("server");
  await queue.choose("account-a", true);
  assert.equal(crashConsentStatus(queue.state("account-a")!.consent!), "active");
  const saved = world.disk.get("account-a");
  assert.equal(saved?.consent?.choice.decision, "allow");
  assert.equal(saved?.consent?.choice.uid, "account-a");
  queue.bind("account-b");
  world.health("listening");
  await ticks();
  const other = queue.state("account-b")?.consent;
  assert.ok(other);
  assert.equal(other.choice.uid, "account-b");
  assert.equal(other.choice.decision, "unset");
  assert.equal(crashConsentStatus(other), "off");
  assert.notEqual(crashConsentStatus(other), "active");
  assert.equal(world.disk.get("account-a")?.consent?.choice.decision, "allow");
  assert.equal(world.disk.get("account-a")?.consent?.choice.uid, "account-a");
  assert.equal(queue.state("account-a")?.consent?.choice.decision, "allow");
  recordError(new Error("synthetic"));
  assert.equal(reports, 0, "account B does not collect under account A's choice");
  const relaunchedB = relaunchCrashConsent(other);
  assert.equal(crashConsentStatus(relaunchedB), "off");
  __resetCrashReportingForTests();
}

async function staleAcknowledgementIgnored(): Promise<void> {
  __resetCrashReportingForTests();
  installClient();
  const world = harness();
  const hold: { release: (value: PurposeServerState) => void } = {
    release: () => undefined,
  };
  let reads = 0;
  const queue = createPurposeConsentQueue({
    ...world.ports,
    send: async (input) => {
      if ("action" in input) {
        reads += 1;
        if (reads === 1) {
          return new Promise<PurposeServerState>((done) => {
            hold.release = done;
          });
        }
        return { ok: true as const, ...world.remote() };
      }
      const transition = purposeTransition(
        world.remote(),
        { ...input, alreadyReceived: false },
        20
      );
      if (transition.apply) {
        const current = world.remote();
        current.revision = transition.state.revision;
        current.decision = transition.state.decision;
        current.receivedAt = transition.state.receivedAt;
      }
      return { ok: true as const, ...world.remote(), conflict: transition.conflict };
    },
  });
  queue.bind("account-a");
  world.health("server");
  await queue.choose("account-a", true);
  const allowRevision = queue.state("account-a")?.consent?.choice.revision ?? 0;
  const reading = queue.reconcile("account-a");
  for (let i = 0; i < 40 && reads === 0; i += 1) await Promise.resolve();
  assert.equal(reads, 1);
  await queue.choose("account-a", false);
  const withdrawn = queue.state("account-a")?.consent;
  assert.equal(withdrawn?.choice.decision, "withdraw");
  assert.ok((withdrawn?.choice.revision ?? 0) > allowRevision);
  hold.release({ ok: true, revision: allowRevision, decision: "grant", receivedAt: 1 });
  await reading;
  await ticks();
  const after = queue.state("account-a")?.consent;
  assert.equal(after?.choice.decision, "withdraw", "a stale grant acknowledgement must not overwrite withdrawal");
  assert.equal(after?.choice.uid, "account-a");
  assert.ok((after?.choice.revision ?? 0) > allowRevision);
  assert.notEqual(crashConsentStatus(after!), "active");
  __resetCrashReportingForTests();
}

async function storedWithdrawalRetriesUnsentDeletion(): Promise<void> {
  __resetCrashReportingForTests();
  let deletions = 0;
  installClient({
    onDelete: () => {
      deletions += 1;
    },
  });
  const world = harness();
  const queue = createPurposeConsentQueue(world.ports);
  queue.bind("account-a");
  world.health("server");
  await queue.choose("account-a", false);
  assert.ok(deletions > 0);
  const beforeRestart = deletions;
  __resetCrashReportingForTests();
  deletions = 0;
  installClient({
    onDelete: () => {
      deletions += 1;
    },
  });
  const restarted = createPurposeConsentQueue(world.ports);
  restarted.bind("account-a");
  await restarted.reconcile("account-a");
  await ticks();
  assert.ok(deletions > 0, "a stored withdrawal retries unsent-report deletion");
  assert.equal(restarted.state("account-a")?.consent?.choice.decision, "withdraw");
  assert.notEqual(crashConsentStatus(restarted.state("account-a")!.consent!), "active");
  assert.ok(beforeRestart > 0);
  __resetCrashReportingForTests();
}

async function failedPersistIsNotActive(): Promise<void> {
  __resetCrashReportingForTests();
  let reports = 0;
  installClient({
    onRecord: () => {
      reports += 1;
    },
  });
  const world = harness();
  const queue = createPurposeConsentQueue({
    ...world.ports,
    save: async () => {
      throw new Error("disk");
    },
  });
  queue.bind("account-a");
  world.health("server");
  await queue.choose("account-a", false);
  const failed = queue.state("account-a")?.consent;
  assert.ok(failed);
  assert.equal(failed.choice.decision, "withdraw");
  assert.equal(failed.pending?.persistFailed, true);
  assert.notEqual(failed.native, "enabled");
  assert.equal(crashConsentStatus(failed), "failed");
  recordError(new Error("synthetic"));
  assert.equal(reports, 0);
  assert.equal(crashConsentStatus(relaunchCrashConsent(failed)), "failed");
  __resetCrashReportingForTests();
}

async function legacyFlagDoesNotEnable(): Promise<void> {
  __resetCrashReportingForTests();
  let enables = 0;
  installClient({
    onCollection: (enabled) => {
      if (enabled) enables += 1;
    },
  });
  resetDiagnosticsPreferenceForTests();
  const storage = await import("@react-native-async-storage/async-storage");
  const original = storage.default.getItem.bind(storage.default);
  storage.default.getItem = async () => "true";
  try {
    const pref = await loadDiagnosticsPreference();
    assert.equal(enables, 0, "a stored debug flag must not enable crash reporting");
    assert.notEqual(pref.nativeState, "on");
    assert.equal(pref.desired, "on");
  } finally {
    storage.default.getItem = original;
    resetDiagnosticsPreferenceForTests();
    __resetCrashReportingForTests();
  }
}

function storedChoice(uid: string, decision: "allow" | "withdraw"): PurposeQueueState {
  return {
    uid,
    revision: 9,
    localGrant: false,
    hasChoice: true,
    pending: null,
    sync: "synced",
    consent: {
      choice: { decision, revision: 9, uid },
      pending: null,
      acknowledgement: { revision: 9, decision, serverRevision: 9 },
      native: "disabled",
      enablingInvalidated: false,
      unsentDeletionRequested: false,
      sessionAcknowledgement: null,
    },
  };
}

function heldFirstLoad(world: ReturnType<typeof harness>, stale: PurposeQueueState | null) {
  let calls = 0;
  let release: (value: PurposeQueueState | null) => void = () => {
    throw new Error("the delayed disk read was not started");
  };
  const ports = {
    ...world.ports,
    load: async (uid: string): Promise<PurposeQueueState | null> => {
      calls += 1;
      if (calls === 1) {
        return await new Promise<PurposeQueueState | null>((done) => {
          release = () => done(stale && stale.uid === uid ? stale : stale);
        });
      }
      return world.disk.get(uid) ?? null;
    },
  };
  return {
    ports,
    calls: () => calls,
    release: () => release(stale),
  };
}

async function delayedDiskAfterAcknowledgedAllow(): Promise<void> {
  __resetCrashReportingForTests();
  const snap = createCrashDouble();
  const world = harness();
  const held = heldFirstLoad(world, storedChoice("account-a", "withdraw"));
  const queue = createPurposeConsentQueue(held.ports);
  queue.bind("account-a");
  world.health("server");
  await queue.choose("account-a", true);
  const allowed = queue.state("account-a")?.consent;
  assert.ok(allowed);
  assert.equal(allowed.choice.decision, "allow");
  assert.equal(crashConsentStatus(allowed), "active");
  assert.equal(snap.sessionReporting, true);
  assert.equal(snap.preference, false);
  assert.ok(held.calls() > 1, "the newer choice did not wait on the delayed disk read");
  held.release();
  await ticks(20);
  const after = queue.state("account-a")?.consent;
  assert.equal(after?.choice.decision, "allow");
  assert.equal(after?.choice.revision, allowed.choice.revision);
  assert.equal(after?.acknowledgement?.revision, allowed.acknowledgement?.revision);
  assert.equal(after?.acknowledgement?.decision, "allow");
  assert.equal(crashConsentStatus(after!), "active");
  assert.equal(snap.sessionReporting, true);
  assert.equal(snap.preference, false);
  __resetCrashReportingForTests();
}

async function delayedDiskAfterWithdrawal(): Promise<void> {
  __resetCrashReportingForTests();
  const snap = createCrashDouble();
  const world = harness();
  const held = heldFirstLoad(world, storedChoice("account-a", "allow"));
  const queue = createPurposeConsentQueue(held.ports);
  queue.bind("account-a");
  world.health("server");
  await queue.choose("account-a", false);
  const withdrawn = queue.state("account-a")?.consent;
  assert.ok(withdrawn);
  assert.equal(withdrawn.choice.decision, "withdraw");
  assert.equal(snap.sessionReporting, false);
  assert.equal(snap.preference, false);
  assert.equal(snap.unsentDeletion, "requested");
  assert.notEqual(snap.unsentDeletion, "confirmed" as string);
  held.release();
  await ticks(20);
  const after = queue.state("account-a")?.consent;
  assert.equal(after?.choice.decision, "withdraw");
  assert.equal(after?.choice.uid, "account-a");
  assert.ok((after?.choice.revision ?? 0) > 0);
  assert.notEqual(after?.choice.decision, "allow");
  assert.equal(snap.sessionReporting, false);
  assert.equal(snap.preference, false);
  assert.notEqual(crashConsentStatus(after!), "active");
  __resetCrashReportingForTests();
}

async function accountSwitchDropsPreviousGrant(): Promise<void> {
  __resetCrashReportingForTests();
  const snap = createCrashDouble();
  const world = harness();
  const held = heldFirstLoad(world, storedChoice("account-a", "allow"));
  const queue = createPurposeConsentQueue(held.ports);
  queue.bind("account-a");
  queue.bind("account-b");
  world.health("listening");
  held.release();
  await ticks(20);
  const other = queue.state("account-b")?.consent;
  assert.ok(other);
  assert.equal(other.choice.uid, "account-b");
  assert.equal(other.choice.decision, "unset");
  assert.notEqual(crashConsentStatus(other), "active");
  assert.notEqual(queue.state("account-a")?.consent?.choice.decision, "allow");
  assert.equal(snap.sessionReporting, false);
  assert.equal(snap.preference, false);
  __resetCrashReportingForTests();
}

async function grantWithoutRuntimeBridge(): Promise<void> {
  __resetCrashReportingForTests();
  let reports = 0;
  const snap = createCrashDouble({
    bridge: "absent",
    onRecord: () => {
      reports += 1;
    },
  });
  const world = harness();
  const queue = createPurposeConsentQueue(world.ports);
  queue.bind("account-a");
  world.health("server");
  await queue.choose("account-a", true);
  const consent = queue.state("account-a")?.consent;
  assert.ok(consent);
  assert.equal(consent.choice.decision, "allow");
  assert.equal(crashConsentStatus(consent), "unavailable");
  assert.notEqual(crashConsentStatus(consent), "active");
  assert.equal(snap.preference, false);
  assert.equal(snap.sessionReporting, false);
  recordError(new Error("synthetic"));
  assert.equal(reports, 0);
  __resetCrashReportingForTests();
}

async function grantWithBridgeLeavesPreferenceFalse(): Promise<void> {
  __resetCrashReportingForTests();
  const snap = createCrashDouble();
  assert.equal(snap.preference, true, "the double starts with a poisoned preference");
  const world = harness();
  const queue = createPurposeConsentQueue(world.ports);
  queue.bind("account-a");
  world.health("server");
  await queue.choose("account-a", true);
  const consent = queue.state("account-a")?.consent;
  assert.ok(consent);
  assert.equal(crashConsentStatus(consent), "active");
  assert.equal(snap.sessionReporting, true);
  assert.equal(snap.preference, false);
  queue.bind("account-b");
  await ticks();
  assert.equal(snap.sessionReporting, false);
  assert.equal(snap.preference, false);
  assert.equal(queue.state("account-b")?.consent?.choice.decision, "unset");
  assert.notEqual(crashConsentStatus(queue.state("account-b")!.consent!), "active");
  __resetCrashReportingForTests();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
