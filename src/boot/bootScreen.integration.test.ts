/**
 * Mounted React integration for BootScreenView.
 *
 * Renders production BootScreenView with react-dom createRoot, controlled
 * auth/session ports, and inert gate/sheet/router surfaces.
 *
 * Boundaries:
 * - mounted: BootScreenView (production coordination)
 * - inert: animation gate, draft sheet, splash, router
 * - not native rendering, TalkBack, Reanimated, or Play-installed proof
 * - EXTRACTED_RUNTIME machine tests do not cover these cases
 */
import { createMountContainer } from "@/billing/quotaUpsell/quotaUpsellHost.fakeDom";
import assert from "node:assert/strict";

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Href } from "expo-router";

import type { BootAnimationGateProps } from "@/boot/BootAnimationGate";
import type { BootDraftContinuationSheetProps } from "@/boot/BootDraftContinuationSheet";
import { BootScreenView } from "@/boot/BootScreenView";
import type { BootDestination } from "@/boot/resolveBootRoute";
import type { UserProfile } from "@/domain/types";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class FakeClock {
  now = 0;
  private timers: { at: number; fn: () => void }[] = [];
  setTimeout(fn: () => void, ms: number) {
    this.timers.push({ at: this.now + ms, fn });
    return () => {
      this.timers = this.timers.filter((t) => t.fn !== fn);
    };
  }
  advance(ms: number) {
    this.now += ms;
    const due = this.timers.filter((t) => t.at <= this.now).sort((a, b) => a.at - b.at);
    this.timers = this.timers.filter((t) => t.at > this.now);
    for (const t of due) t.fn();
  }
}

function user(uid: string): UserProfile {
  return { uid } as UserProfile;
}

function dashboard(): BootDestination {
  return { kind: "route", href: "/(app)/(tabs)/you" as Href };
}

function draft(uid: string): BootDestination {
  return {
    kind: "draft_continuation",
    continuation: {
      userId: uid,
      draftId: `draft_${uid}`,
      scopeKey: "invoice",
      entryId: null,
      updatedAt: 1,
      composerHref: ("/(app)/composer/" + uid) as Href,
      recordLabelKey: "composer.options.invoice",
    },
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function main(): Promise<void> {
  const container = createMountContainer();
  const root: Root = createRoot(container);
  const clock = new FakeClock();
  const navigated: string[] = [];
  const clears: string[] = [];
  const snoozes: string[] = [];
  const latest: {
    gate: BootAnimationGateProps | null;
    sheet: BootDraftContinuationSheetProps | null;
    retry: { onPress: () => void; label: string } | null;
  } = { gate: null, sheet: null, retry: null };
  let fontsLoaded = true;
  let resolveImpl: () => Promise<BootDestination> = async () => dashboard();
  let snoozeImpl: (userId: string) => Promise<void> = async (userId) => {
    snoozes.push(userId);
  };

  const model = {
    authStatus: "signed_in" as "loading" | "signed_out" | "signed_in",
    justCreated: false,
    user: user("A"),
    dbStatus: "ready",
  };

  function InertGate(props: BootAnimationGateProps) {
    latest.gate = props;
    useEffect(() => {
      if (!props.visible || props.bootError) return;
      if (!fontsLoaded && props.bootReady && props.routeResolved) {
        props.onExitComplete();
      }
    }, [props]);
    return null;
  }

  function Harness() {
    return React.createElement(BootScreenView, {
      ports: {
        authStatus: model.authStatus,
        justCreated: model.justCreated,
        user: model.user,
        dbStatus: model.dbStatus,
        reducedMotion: true,
        sequenceHoldMs: 0,
        captureSession: () => syncSessionOwnership.capture(),
        resolveDestination: () => resolveImpl(),
        snoozeDraft: (uid) => snoozeImpl(uid),
        clearActiveRoute: async (uid) => {
          clears.push(uid);
        },
        replaceRoute: (href) => {
          navigated.push(String(href));
        },
        hideSplash: () => undefined,
        markNavigationSettled: () => undefined,
        t: (key) => key,
        schedule: (fn, ms) => clock.setTimeout(fn, ms),
        renderDbFailure: () => React.createElement("div", { "data-db": "failed" }),
        renderBackdrop: () => null,
        renderGate: (props) => React.createElement(InertGate, props),
        renderRetry: (props) => {
          latest.retry = props;
          return React.createElement("button", {
            "data-retry": props.label,
            onClick: props.onPress,
          });
        },
        renderSheet: (props) => {
          latest.sheet = props;
          return null;
        },
      },
    });
  }

  async function render() {
    await act(async () => {
      root.render(React.createElement(Harness));
    });
  }

  async function remount() {
    await act(async () => {
      root.render(React.createElement("div"));
    });
    latest.gate = null;
    latest.sheet = null;
    latest.retry = null;
    await render();
  }

  async function holdAndExit() {
    await act(async () => {
      clock.advance(0);
    });
    await flush();
    if (latest.gate && latest.gate.visible && !latest.gate.bootError) {
      await act(async () => {
        latest.gate?.onExitComplete();
      });
    }
  }

  syncSessionOwnership.resetForTests();
  syncSessionOwnership.beginSession("A");
  resolveImpl = async () => draft("A");
  await render();
  await holdAndExit();
  assert.equal(latest.sheet?.visible, true, "current-session draft sheet is shown");
  const continueA = latest.sheet!.onContinue;
  assert.equal(navigated.length, 0);

  model.user = user("B");
  syncSessionOwnership.endSession();
  syncSessionOwnership.beginSession("B");
  resolveImpl = async () => draft("B");
  await render();
  await holdAndExit();
  assert.equal(latest.sheet?.visible, true);
  assert.equal(latest.sheet?.continuation?.userId, "B");
  const continueB = latest.sheet!.onContinue;
  await act(async () => {
    continueA();
  });
  assert.equal(navigated.length, 0, "1: A's Continue after B is displayed is rejected");
  await act(async () => {
    continueB();
  });
  assert.equal(navigated.length, 1);
  assert.equal(navigated[0], "/(app)/composer/B");

  navigated.length = 0;
  syncSessionOwnership.resetForTests();
  syncSessionOwnership.beginSession("A");
  model.user = user("A");
  resolveImpl = async () => draft("A");
  await remount();
  await holdAndExit();
  const continueGen1 = latest.sheet!.onContinue;
  syncSessionOwnership.endSession();
  syncSessionOwnership.beginSession("A");
  resolveImpl = async () => draft("A");
  await render();
  await holdAndExit();
  await act(async () => {
    continueGen1();
  });
  assert.equal(navigated.length, 0, "2: A→logout→A generation rejects old Continue");
  await act(async () => {
    latest.sheet!.onContinue();
  });
  assert.equal(navigated[0], "/(app)/composer/A");

  navigated.length = 0;
  clears.length = 0;
  syncSessionOwnership.resetForTests();
  syncSessionOwnership.beginSession("A");
  model.user = user("A");
  resolveImpl = async () => draft("A");
  const snoozeBarrier = deferred<void>();
  snoozeImpl = () => snoozeBarrier.promise;
  await remount();
  await holdAndExit();
  const laterPaused = latest.sheet!.onLater;
  void laterPaused();
  model.user = user("B");
  syncSessionOwnership.endSession();
  syncSessionOwnership.beginSession("B");
  resolveImpl = async () => draft("B");
  snoozeImpl = async (uid) => {
    snoozes.push(uid);
  };
  await render();
  await holdAndExit();
  assert.equal(latest.sheet?.continuation?.userId, "B");
  await act(async () => {
    snoozeBarrier.resolve();
    await Promise.resolve();
  });
  assert.equal(clears.length, 0, "3: paused Later does not issue retired clear");
  assert.equal(navigated.length, 0);
  assert.equal(latest.sheet?.visible, true);
  assert.equal(latest.sheet?.continuation?.userId, "B");

  navigated.length = 0;
  syncSessionOwnership.resetForTests();
  syncSessionOwnership.beginSession("A");
  model.user = user("A");
  resolveImpl = async () => draft("A");
  snoozeImpl = async (uid) => {
    snoozes.push(uid);
  };
  await remount();
  await holdAndExit();
  const staleContinue = latest.sheet!.onContinue;
  syncSessionOwnership.endSession();
  syncSessionOwnership.beginSession("B");
  await act(async () => {
    staleContinue();
  });
  assert.equal(
    navigated.length,
    0,
    "4: session retirement before owner-update effect rejects stale dispatch"
  );

  navigated.length = 0;
  model.user = user("B");
  resolveImpl = async () => dashboard();
  await render();
  assert.equal(latest.gate?.visible, true, "5: retiring continuation restores boot surface");
  await holdAndExit();
  assert.equal(navigated.length, 1);
  assert.equal(navigated[0], "/(app)/(tabs)/you");

  navigated.length = 0;
  syncSessionOwnership.resetForTests();
  syncSessionOwnership.beginSession("A");
  model.user = user("A");
  const failOnce = deferred<BootDestination>();
  resolveImpl = () => failOnce.promise;
  await remount();
  await act(async () => {
    clock.advance(0);
  });
  await act(async () => {
    failOnce.reject(new Error("SYNTHETIC_RESOLVER_FAILURE"));
    await Promise.resolve();
  });
  await flush();
  assert.ok(latest.retry, "6: resolver rejection presents Retry");
  assert.equal(latest.retry!.label, "common.retry");
  assert.equal(latest.gate?.visible, false, "Retry is not covered by the animation overlay");
  resolveImpl = async () => dashboard();
  await act(async () => {
    latest.retry!.onPress();
  });
  await flush();
  await holdAndExit();
  assert.equal(navigated.length, 1);
  assert.equal(navigated[0], "/(app)/(tabs)/you");

  navigated.length = 0;
  syncSessionOwnership.resetForTests();
  syncSessionOwnership.beginSession("A");
  model.user = user("A");
  model.dbStatus = "ready";
  resolveImpl = async () => dashboard();
  await remount();
  await act(async () => {
    clock.advance(0);
  });
  await flush();
  model.dbStatus = "opening";
  await render();
  await act(async () => {
    latest.gate?.onExitComplete();
  });
  assert.equal(navigated.length, 0, "7: DB readiness lost before exit callback does not route");

  navigated.length = 0;
  model.dbStatus = "ready";
  fontsLoaded = false;
  resolveImpl = async () => dashboard();
  await remount();
  await holdAndExit();
  assert.equal(navigated.length, 1, "8: slow/failed fonts still complete a ready route");
  assert.equal(navigated[0], "/(app)/(tabs)/you");

  navigated.length = 0;
  const failFonts = deferred<BootDestination>();
  resolveImpl = () => failFonts.promise;
  await remount();
  await act(async () => {
    clock.advance(0);
  });
  await act(async () => {
    failFonts.reject(new Error("SYNTHETIC_RESOLVER_FAILURE"));
    await Promise.resolve();
  });
  await flush();
  assert.ok(latest.retry, "8: resolver failure remains reachable with failed fonts");
  assert.equal(latest.retry!.label, "common.retry");
  assert.equal(latest.gate?.visible, false);

  navigated.length = 0;
  fontsLoaded = true;
  syncSessionOwnership.resetForTests();
  syncSessionOwnership.beginSession("A");
  resolveImpl = async () => dashboard();
  await remount();
  await holdAndExit();
  await act(async () => {
    latest.gate?.onExitComplete();
  });
  assert.equal(navigated.length, 1, "9: normal boot route exactly once");
  await act(async () => {
    latest.gate?.onExitComplete();
  });
  assert.equal(navigated.length, 1);

  await act(async () => {
    root.unmount();
  });
  syncSessionOwnership.resetForTests();
  console.log("bootScreen.integration.test.ts: ok (MOUNTED_REACT_INERT_NATIVE)");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
