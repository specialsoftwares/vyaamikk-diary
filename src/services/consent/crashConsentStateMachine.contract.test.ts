import assert from "node:assert/strict";

import {
  createPurposeConsentQueue,
  type PurposeQueueState,
  type PurposeMutation,
  type PurposeServerState,
} from "./purposeConsentQueue";
import { crashReportingActive, crashConsentStatus, initialCrashConsent } from "../telemetry/crashConsentState";
const status = (state: PurposeQueueState | null | undefined) => crashConsentStatus(state?.consent ?? initialCrashConsent(state?.uid ?? ""));
const active = (state: PurposeQueueState | null | undefined) => crashReportingActive(state?.consent ?? initialCrashConsent(state?.uid ?? ""));
import { purposeTransition, type PurposeState } from "../../../functions/src/privacy/processingPurposeState";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(predicate(), true);
}

type Health = (health: "listening" | "server" | "failed") => void;

async function main(): Promise<void> {
  // Allow before the first server snapshot stays pending and flushes later.
  {
    const disk = new Map<string, PurposeQueueState>();
    let native = false;
    let sends = 0;
    let operation = 0;
    let health: Health = () => undefined;
    let remote: PurposeServerState = { ok: true, revision: 0, decision: null, receivedAt: null };
    const queue = createPurposeConsentQueue({
      load: async (uid) => disk.get(uid) ?? null,
      save: async (state) => { disk.set(state.uid, structuredClone(state)); },
      generation: () => 1,
      operationId: () => `op_${++operation}`,
      applyLocal: async (enabled) => { native = enabled; return { sessionReporting: enabled, preference: false, status: enabled ? "enabled" : "disabled" }; },
      send: async (input) => {
        sends += 1;
        if (!("action" in input)) {
          remote = { ok: true, revision: remote.revision + 1, decision: input.decision, receivedAt: remote.revision + 1 };
        }
        return remote;
      },
      observeRemote: (_uid, _generation, _onRemote, onHealth) => {
        health = onHealth;
        return () => undefined;
      },
    });
    queue.bind("owner");
    health("listening");
    await queue.choose("owner", true);
    assert.equal(native, false);
    assert.equal(sends, 0);
    assert.equal(queue.state("owner")?.pending?.decision, "grant");
    assert.equal(queue.state("owner")?.consent?.choice.decision, "allow");
    assert.equal(queue.state("owner")?.hasChoice, true);
    assert.equal(status(queue.state("owner")), "pending");
    assert.notEqual(status(queue.state("owner")), "off");
    health("server");
    await waitUntil(() => native === true);
    assert.equal(queue.state("owner")?.pending ?? null, null);
    assert.equal(queue.state("owner")?.sync, "synced");
    assert.equal(active(queue.state("owner")), true);
    assert.equal(status(queue.state("owner")), "active");
    assert.equal(sends, 1);
  }

  // Listener failure keeps the Allow. It does not become a decline.
  {
    const disk = new Map<string, PurposeQueueState>();
    let native = false;
    let health: Health = () => undefined;
    const queue = createPurposeConsentQueue({
      load: async (uid) => disk.get(uid) ?? null,
      save: async (state) => { disk.set(state.uid, structuredClone(state)); },
      generation: () => 1,
      operationId: () => "allow_once",
      applyLocal: async (enabled) => { native = enabled; return { sessionReporting: enabled, preference: false, status: enabled ? "enabled" : "disabled" }; },
      send: async (input) => ({
        ok: true,
        revision: 1,
        decision: "action" in input ? null : input.decision,
        receivedAt: 1,
      }),
      observeRemote: (_uid, _generation, _onRemote, onHealth) => {
        health = onHealth;
        return () => undefined;
      },
    });
    queue.bind("owner");
    health("failed");
    await queue.choose("owner", true);
    assert.equal(native, false);
    assert.equal(queue.state("owner")?.sync, "listener_unavailable");
    assert.equal(queue.state("owner")?.pending?.decision, "grant");
    assert.equal(queue.state("owner")?.consent?.choice.decision, "allow");
    assert.equal(queue.state("owner")?.hasChoice, true);
    assert.equal(disk.get("owner")?.pending?.decision, "grant");
    assert.notEqual(status(queue.state("owner")), "off");
    health("listening");
    await queue.reconcile("owner");
    assert.equal(native, false);
    assert.equal(queue.state("owner")?.pending?.decision, "grant");
    assert.equal(queue.state("owner")?.consent?.choice.decision, "allow");
  }

  // Withdrawal beats an in-flight grant, including the grant response that arrives later.
  {
    let remote: PurposeState = { revision: 0, decision: null, receivedAt: null };
    const seen = new Set<string>();
    let native = false;
    let operation = 0;
    const hold = deferred<void>();
    const entered = deferred<void>();
    const queue = createPurposeConsentQueue({
      load: async () => null,
      save: async () => undefined,
      generation: () => 1,
      operationId: () => `op_${++operation}`,
      applyLocal: async (enabled) => { native = enabled; return { sessionReporting: enabled, preference: false, status: enabled ? "enabled" : "disabled" }; },
      send: async (input) => {
        if ("action" in input) return { ok: true as const, ...remote };
        if (input.decision === "grant") {
          entered.resolve();
          await hold.promise;
        }
        const transition = purposeTransition(remote, { ...input, alreadyReceived: seen.has(input.operationId) }, 10);
        if (transition.apply) {
          seen.add(input.operationId);
          remote = transition.state;
        }
        return { ok: true as const, ...remote, conflict: transition.conflict };
      },
    });
    queue.bind("owner");
    const grant = queue.choose("owner", true);
    await entered.promise;
    const withdraw = queue.choose("owner", false);
    assert.equal(native, false);
    await withdraw;
    assert.equal(native, false);
    assert.equal(queue.state("owner")?.localGrant, false);
    assert.equal(remote.decision, "withdraw");
    hold.resolve();
    await grant;
    assert.equal(native, false);
    assert.equal(remote.decision, "withdraw");
    assert.equal(queue.state("owner")?.localGrant, false);
    assert.equal(active(queue.state("owner")), false);
    assert.notEqual(status(queue.state("owner")), "active");
  }

  // SDK rejection is a failed activation, not a successful grant and not a decline.
  {
    let native = false;
    let health: Health = () => undefined;
    let remote: PurposeServerState = { ok: true, revision: 0, decision: null, receivedAt: null };
    const queue = createPurposeConsentQueue({
      load: async () => null,
      save: async () => undefined,
      generation: () => 1,
      operationId: () => "sdk_grant",
      applyLocal: async (enabled) => {
        if (enabled) {
          native = true;
          throw new Error("sdk rejected");
        }
        native = false;
      },
      send: async (input) => {
        if (!("action" in input)) {
          remote = { ok: true, revision: remote.revision + 1, decision: input.decision, receivedAt: remote.revision + 1 };
        }
        return remote;
      },
      observeRemote: (_uid, _generation, _onRemote, onHealth) => {
        health = onHealth;
        return () => undefined;
      },
    });
    queue.bind("owner");
    health("server");
    await queue.reconcile("owner");
    await queue.choose("owner", true);
    assert.equal(native, false);
    assert.equal(queue.state("owner")?.consent?.native, "failed");
    assert.equal(queue.state("owner")?.consent?.choice.decision, "allow");
    assert.equal(queue.state("owner")?.hasChoice, true);
    assert.notEqual(active(queue.state("owner")), true);
    assert.equal(status(queue.state("owner")), "failed");
    assert.equal(status(queue.state("owner")), "failed");
  }

  // Restart load restores the pending grant for the same uid only.
  {
    const disk = new Map<string, PurposeQueueState>();
    let operation = 0;
    let health: Health = () => undefined;
    const ports = {
      load: async (uid: string) => disk.get(uid) ?? null,
      save: async (state: PurposeQueueState) => { disk.set(state.uid, structuredClone(state)); },
      generation: () => 1,
      operationId: () => `restart_${++operation}`,
      applyLocal: async () => undefined,
      send: async (input: PurposeMutation | { uid: string; purpose: "crash_diagnostics"; action: "read" }) => ({
        ok: true as const,
        revision: 1,
        decision: "action" in input ? null : input.decision,
        receivedAt: 1,
      }),
      observeRemote: (_uid: string, _generation: number, _onRemote: (remote: PurposeServerState) => void, onHealth: Health) => {
        health = onHealth;
        return () => undefined;
      },
    };
    const first = createPurposeConsentQueue(ports);
    first.bind("same");
    health("listening");
    await first.choose("same", true);
    const saved = disk.get("same");
    assert.equal(saved?.pending?.decision, "grant");
    assert.equal(saved?.consent?.choice.decision, "allow");
    const operationId = saved?.pending?.operationId;
    const restarted = createPurposeConsentQueue(ports);
    restarted.bind("same");
    await restarted.reconcile("same");
    assert.equal(restarted.state("same")?.pending?.decision, "grant");
    assert.equal(restarted.state("same")?.pending?.operationId, operationId);
    assert.equal(restarted.state("same")?.consent?.choice.decision, "allow");
    assert.equal(restarted.state("same")?.uid, "same");
    restarted.bind("other");
    await restarted.reconcile("other");
    assert.equal(restarted.state("other")?.pending ?? null, null);
    assert.equal(restarted.state("other")?.hasChoice, false);
    assert.equal(restarted.state("other")?.localGrant, false);
    assert.equal(disk.get("same")?.pending?.operationId, operationId);
    assert.equal(disk.get("other")?.pending?.decision, undefined);
    assert.notEqual(restarted.state("other")?.pending?.operationId, operationId);
  }

  console.log("crashConsentStateMachine.contract.test.ts: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
