/**
 * EXTRACTED_RUNTIME tests for boot completion ownership.
 * Not a mounted React test. Not a native/device test.
 * Uses deferred barriers; no real wall-clock wait for navigation permission.
 */
import assert from "node:assert/strict";

import { getAuthEntryHref } from "@/config/authWrapper";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";
import type { BootDestination, BootRouteInput } from "@/boot/resolveBootRoute";
import type { UserProfile } from "@/domain/types";

import {
  bootOwnerFromAuth,
  computeBootReady,
  computeRouteResolved,
  createBootCompletionMachine,
  createBootGateCompleters,
  sequenceHoldDurationMs,
  shouldShowLocalDbFailure,
  type ContinuationTicket,
} from "./bootCompletion";

import {
  BOOT_ANIMATION_MS,
  BOOT_REDUCED_MOTION_MS,
} from "@/config/brandMotion";

function user(uid: string): UserProfile {
  return { uid } as UserProfile;
}

function input(uid: string | null, signedIn: boolean): BootRouteInput {
  return {
    signedIn,
    user: uid ? user(uid) : null,
    justCreated: false,
  };
}

function route(href: ReturnType<typeof getAuthEntryHref> | string): BootDestination {
  return { kind: "route", href: href as BootDestination extends { href: infer H } ? H : never };
}

function dashboard(): BootDestination {
  return { kind: "route", href: "/(app)/(tabs)/you" };
}

function onboarding(): BootDestination {
  return { kind: "route", href: "/(auth)/v2?step=email" };
}

function draftFor(uid: string): BootDestination {
  return {
    kind: "draft_continuation",
    continuation: {
      userId: uid,
      draftId: `draft_${uid}`,
      scopeKey: "invoice",
      entryId: null,
      updatedAt: 1,
      composerHref: "/(app)/composer",
      recordLabelKey: "composer.options.invoice",
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function main() {

{
  const machine = createBootCompletionMachine();
  machine.observeOwner({ kind: "loading" });
  const navigated: string[] = [];
  const action = machine.tryComplete();
  if (action.type === "navigate") navigated.push(String(action.href));
  assert.equal(action.type, "none", "auth loading must not navigate on timeout");
  assert.equal(navigated.length, 0);
  assert.equal(machine.hasPendingDestination(), false);
}

{
  const machine = createBootCompletionMachine();
  machine.observeOwner({ kind: "signed_out" });
  const barrier = deferred<BootDestination>();
  const pending = machine.resolveForOwner(
    { kind: "signed_out" },
    input(null, false),
    () => barrier.promise
  );
  const timeout = machine.tryComplete();
  assert.equal(timeout.type, "none", "slow DB/auth must not manufacture auth");
  barrier.resolve(route(getAuthEntryHref()));
  await pending;
  const done = machine.tryComplete();
  assert.equal(done.type, "navigate");
  if (done.type === "navigate") assert.equal(done.href, getAuthEntryHref());
}

{
  const machine = createBootCompletionMachine();
  const ownerA = { kind: "signed_in" as const, uid: "A", generation: 1 };
  machine.observeOwner(ownerA);
  const barrier = deferred<BootDestination>();
  void machine.resolveForOwner(ownerA, input("A", true), () => barrier.promise);
  assert.equal(machine.tryComplete().type, "none", "unresolved onboarding must not default to dashboard");
  barrier.resolve(onboarding());
  await flush();
  const done = machine.tryComplete();
  assert.equal(done.type, "navigate");
  if (done.type === "navigate") assert.equal(String(done.href).includes("email"), true);
}

{
  const machine = createBootCompletionMachine();
  const owner = { kind: "signed_in" as const, uid: "A", generation: 1 };
  machine.observeOwner(owner);
  const action = await machine.resolveForOwner(owner, input("A", true), async () => {
    throw new Error("SYNTHETIC_RESOLVER_FAILURE");
  });
  assert.equal(action.type, "resolver_failed");
  assert.equal(machine.isRouteFailed(), true);
  assert.equal(machine.tryComplete().type, "none", "resolver rejection must not navigate");
}

{
  const machine = createBootCompletionMachine();
  const ownerA = { kind: "signed_in" as const, uid: "A", generation: 1 };
  const ownerB = { kind: "signed_in" as const, uid: "B", generation: 2 };
  machine.observeOwner(ownerA);
  const barrier = deferred<BootDestination>();
  void machine.resolveForOwner(ownerA, input("A", true), () => barrier.promise);
  machine.observeOwner(ownerB);
  barrier.resolve(dashboard());
  await flush();
  assert.equal(machine.tryComplete().type, "none", "A→B while pending must ignore A's result");
  await machine.resolveForOwner(ownerB, input("B", true), async () => dashboard());
  const done = machine.tryComplete();
  assert.equal(done.type, "navigate");
  if (done.type === "navigate") assert.equal(done.href, "/(app)/(tabs)/you");
}

{
  const machine = createBootCompletionMachine();
  const ownerA = { kind: "signed_in" as const, uid: "A", generation: 1 };
  const ownerB = { kind: "signed_in" as const, uid: "B", generation: 2 };
  machine.observeOwner(ownerA);
  await machine.resolveForOwner(ownerA, input("A", true), async () => dashboard());
  assert.equal(machine.hasPendingDestination(), true);
  machine.observeOwner(ownerB);
  assert.equal(machine.hasPendingDestination(), false);
  assert.equal(
    machine.tryComplete().type,
    "none",
    "A dest then A→B before exit must not apply A's dashboard"
  );
}

{
  const machine = createBootCompletionMachine();
  const first = { kind: "signed_in" as const, uid: "A", generation: 1 };
  const second = { kind: "signed_in" as const, uid: "A", generation: 2 };
  machine.observeOwner(first);
  await machine.resolveForOwner(first, input("A", true), async () => draftFor("A"));
  machine.observeOwner({ kind: "signed_out" });
  machine.observeOwner(second);
  assert.equal(machine.hasPendingDestination(), false);
  await machine.resolveForOwner(second, input("A", true), async () => dashboard());
  const done = machine.tryComplete();
  assert.equal(done.type, "navigate");
  if (done.type === "navigate") assert.equal(done.href, "/(app)/(tabs)/you");
}

{
  const machine = createBootCompletionMachine();
  const ownerA = { kind: "signed_in" as const, uid: "A", generation: 1 };
  const ownerB = { kind: "signed_in" as const, uid: "B", generation: 2 };
  machine.observeOwner(ownerA);
  await machine.resolveForOwner(ownerA, input("A", true), async () => draftFor("A"));
  const shown = machine.tryComplete();
  assert.equal(shown.type, "show_continuation");
  const hide = machine.observeOwner(ownerB);
  assert.equal(hide.type, "hide_continuation");
  assert.equal(
    machine.continuationBelongsToCurrent("A"),
    false,
    "retired draft continuation callbacks must not run"
  );
  if (shown.type === "show_continuation") {
    const stolen = machine.takeContinue(shown.ticket);
    assert.equal(stolen.type, "none");
  }
  assert.equal(machine.isNavigated(), false);
}

{
  const machine = createBootCompletionMachine();
  const owner = { kind: "signed_in" as const, uid: "A", generation: 1 };
  machine.observeOwner(owner);
  await machine.resolveForOwner(owner, input("A", true), async () => dashboard());
  const first = machine.tryComplete();
  const second = machine.tryComplete();
  assert.equal(first.type, "navigate");
  assert.equal(second.type, "none", "successful current-session routing exactly once");
}

{
  const machine = createBootCompletionMachine();
  const owner = { kind: "signed_in" as const, uid: "A", generation: 1 };
  machine.observeOwner(owner);
  await machine.resolveForOwner(owner, input("A", true), async () => draftFor("A"));
  const shown = machine.tryComplete();
  assert.equal(shown.type, "show_continuation");
  assert.equal(machine.continuationBelongsToCurrent("A"), true);
  assert.equal(shown.type, "show_continuation");
  const continued =
    shown.type === "show_continuation" ? machine.takeContinue(shown.ticket) : { type: "none" as const };
  assert.equal(continued.type, "navigate");
  if (continued.type === "navigate") assert.equal(continued.href, "/(app)/composer");
}

{
  const machine = createBootCompletionMachine();
  const owner = { kind: "signed_in" as const, uid: "A", generation: 1 };
  machine.observeOwner(owner);
  const barrier = deferred<BootDestination>();
  void machine.resolveForOwner(owner, input("A", true), () => barrier.promise);
  assert.equal(machine.tryComplete().type, "none", "presentation timeout is not navigation");
  barrier.resolve(dashboard());
  await flush();
  const done = machine.tryComplete();
  assert.equal(done.type, "navigate", "reduced-motion/presentation complete still requires a valid dest");
}

{
  syncSessionOwnership.resetForTests();
  const token = syncSessionOwnership.beginSession("A");
  const owner = bootOwnerFromAuth("signed_in", "A", token);
  assert.ok(owner && owner.kind === "signed_in");
  if (owner && owner.kind === "signed_in") {
    assert.equal(owner.generation, token.generation);
  }
  assert.equal(bootOwnerFromAuth("signed_in", "A", null), null);
  assert.equal(bootOwnerFromAuth("loading", "A", token)?.kind, "loading");
  syncSessionOwnership.resetForTests();
}

{
  const ownerA = { kind: "signed_in" as const, uid: "A", generation: 1 };
  const ownerB = { kind: "signed_in" as const, uid: "B", generation: 2 };
  const machine = createBootCompletionMachine();
  machine.observeOwner(ownerA);
  await machine.resolveForOwner(ownerA, input("A", true), async () => draftFor("A"));
  const shownA = machine.tryComplete();
  assert.equal(shownA.type, "show_continuation");
  const ticketA = shownA.type === "show_continuation" ? shownA.ticket : null;
  assert.ok(ticketA);
  machine.observeOwner(ownerB);
  await machine.resolveForOwner(ownerB, input("B", true), async () => draftFor("B"));
  const shownB = machine.tryComplete();
  assert.equal(shownB.type, "show_continuation");
  const stolen = machine.takeContinue(ticketA as ContinuationTicket);
  assert.equal(stolen.type, "none", "A's captured Continue must not adopt B's continuation");
  assert.equal(machine.isNavigated(), false);
  if (shownB.type === "show_continuation") {
    const ok = machine.takeContinue(shownB.ticket);
    assert.equal(ok.type, "navigate");
    if (ok.type === "navigate") assert.equal(ok.href, "/(app)/composer");
  }
}

{
  const first = { kind: "signed_in" as const, uid: "A", generation: 1 };
  const second = { kind: "signed_in" as const, uid: "A", generation: 3 };
  const machine = createBootCompletionMachine();
  machine.observeOwner(first);
  await machine.resolveForOwner(first, input("A", true), async () => draftFor("A"));
  const shown = machine.tryComplete();
  const ticket1 = shown.type === "show_continuation" ? shown.ticket : null;
  assert.ok(ticket1);
  machine.observeOwner({ kind: "signed_out" });
  machine.observeOwner(second);
  await machine.resolveForOwner(second, input("A", true), async () => draftFor("A"));
  const shown3 = machine.tryComplete();
  assert.equal(shown3.type, "show_continuation");
  assert.equal(machine.takeContinue(ticket1 as ContinuationTicket).type, "none");
}

{
  const ownerA = { kind: "signed_in" as const, uid: "A", generation: 1 };
  const ownerB = { kind: "signed_in" as const, uid: "B", generation: 2 };
  const machine = createBootCompletionMachine();
  machine.observeOwner(ownerA);
  await machine.resolveForOwner(ownerA, input("A", true), async () => draftFor("A"));
  const shownA = machine.tryComplete();
  assert.equal(shownA.type, "show_continuation");
  const ticketA = shownA.type === "show_continuation" ? shownA.ticket : null;
  assert.ok(ticketA);
  const snooze = deferred<void>();
  const clears: string[] = [];
  const laterP = machine.takeLater(ticketA as ContinuationTicket, {
    snooze: () => snooze.promise,
    clearActiveRoute: async (id) => {
      clears.push(id);
    },
  });
  machine.observeOwner(ownerB);
  await machine.resolveForOwner(ownerB, input("B", true), async () => draftFor("B"));
  machine.tryComplete();
  snooze.resolve();
  const later = await laterP;
  assert.equal(later.type, "none");
  assert.equal(clears.length, 0, "paused Later must not issue retired clear");
  assert.equal(machine.isNavigated(), false);
  assert.equal(machine.continuationBelongsToCurrent("B"), true);
}

{
  const ownerA = { kind: "signed_in" as const, uid: "A", generation: 1 };
  const ownerB = { kind: "signed_in" as const, uid: "B", generation: 2 };
  let liveOwner: typeof ownerA | typeof ownerB = ownerA;
  const machine = createBootCompletionMachine({
    live: () => ({
      owner: liveOwner,
      dbStatus: "ready",
      authStatus: "signed_in",
    }),
  });
  machine.observeOwner(ownerA);
  await machine.resolveForOwner(ownerA, input("A", true), async () => draftFor("A"));
  const shownA = machine.tryComplete();
  const ticketA = shownA.type === "show_continuation" ? shownA.ticket : null;
  assert.ok(ticketA);
  liveOwner = ownerB;
  assert.equal(
    machine.takeContinue(ticketA as ContinuationTicket).type,
    "none",
    "stale dispatch before observeOwner effect must be rejected"
  );
  assert.equal(machine.tryComplete().type, "none");
}

{
  const owner = { kind: "signed_in" as const, uid: "A", generation: 1 };
  let dbStatus = "ready";
  const machine = createBootCompletionMachine({
    live: () => ({ owner, dbStatus, authStatus: "signed_in" }),
  });
  machine.observeOwner(owner);
  await machine.resolveForOwner(owner, input("A", true), async () => dashboard());
  dbStatus = "opening";
  assert.equal(machine.tryComplete().type, "none", "readiness lost before exit must not route");
}

{
  // PRODUCTION_WIRING (EXTRACTED_RUNTIME): BootScreen/gate callbacks share tryComplete.
  class FakeClock {
    now = 0;
    private timers: { at: number; fn: () => void }[] = [];
    setTimeout(fn: () => void, ms: number) {
      this.timers.push({ at: this.now + ms, fn });
    }
    advance(ms: number) {
      this.now += ms;
      const due = this.timers.filter((t) => t.at <= this.now).sort((a, b) => a.at - b.at);
      this.timers = this.timers.filter((t) => t.at > this.now);
      for (const t of due) t.fn();
    }
  }

  function harness() {
    const machine = createBootCompletionMachine();
    const completers = createBootGateCompleters(machine);
    const navigated: string[] = [];
    const apply = (action: ReturnType<typeof machine.tryComplete>) => {
      if (action.type === "navigate") navigated.push(String(action.href));
    };
    return {
      machine,
      completers,
      navigated,
      apply,
      hold: () => apply(completers.onHoldTimeout()),
      exit: () => apply(completers.onExitComplete()),
    };
  }

  {
    const h = harness();
    const owner = { kind: "signed_in" as const, uid: "A", generation: 1 };
    assert.equal(
      computeBootReady({
        dbStatus: "opening",
        authStatus: "signed_in",
        owner,
      }),
      false,
      "slow database is not boot-ready"
    );
    h.machine.observeOwner(owner);
    h.hold();
    h.exit();
    assert.equal(h.navigated.length, 0, "presentation timeout must not manufacture a dashboard");
    assert.equal(
      shouldShowLocalDbFailure("opening"),
      false
    );
  }

  {
    const h = harness();
    h.machine.observeOwner({ kind: "loading" });
    assert.equal(
      computeBootReady({
        dbStatus: "ready",
        authStatus: "loading",
        owner: { kind: "loading" },
      }),
      false,
      "auth loading across timeout is not ready"
    );
    h.hold();
    assert.equal(h.navigated.length, 0);
  }

  {
    assert.equal(shouldShowLocalDbFailure("failed"), true);
    assert.equal(
      computeBootReady({
        dbStatus: "failed",
        authStatus: "signed_in",
        owner: { kind: "signed_in", uid: "A", generation: 1 },
      }),
      false
    );
    const h = harness();
    h.machine.observeOwner({ kind: "signed_in", uid: "A", generation: 1 });
    h.hold();
    assert.equal(h.navigated.length, 0, "database failure must not route");
  }

  {
    const clock = new FakeClock();
    let sequenceHoldDone = false;
    clock.setTimeout(() => {
      sequenceHoldDone = true;
    }, sequenceHoldDurationMs(true));
    assert.equal(sequenceHoldDurationMs(true), BOOT_REDUCED_MOTION_MS);
    assert.equal(sequenceHoldDurationMs(false), BOOT_ANIMATION_MS);
    const h = harness();
    const owner = { kind: "signed_in" as const, uid: "A", generation: 1 };
    h.machine.observeOwner(owner);
    const barrier = deferred<BootDestination>();
    void h.machine.resolveForOwner(owner, input("A", true), () => barrier.promise);
    clock.advance(BOOT_REDUCED_MOTION_MS - 1);
    assert.equal(sequenceHoldDone, false);
    h.hold();
    assert.equal(h.navigated.length, 0);
    clock.advance(1);
    assert.equal(sequenceHoldDone, true);
    barrier.resolve(dashboard());
    await flush();
    assert.equal(
      computeRouteResolved({
        destinationReady: h.machine.hasPendingDestination(),
        sequenceHoldDone,
        routeFailed: false,
      }),
      true
    );
    h.exit();
    assert.equal(h.navigated.length, 1);
    assert.equal(h.navigated[0], "/(app)/(tabs)/you");
  }

  {
    const h = harness();
    const owner = { kind: "signed_in" as const, uid: "A", generation: 1 };
    h.machine.observeOwner(owner);
    await h.machine.resolveForOwner(owner, input("A", true), async () => dashboard());
    h.hold();
    h.exit();
    assert.equal(h.navigated.length, 1, "exit and hold share completers; route once");
  }
}

console.log("bootCompletion.test.ts: ok (EXTRACTED_RUNTIME)");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
