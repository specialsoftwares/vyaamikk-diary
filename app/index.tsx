import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import * as SplashScreen from "expo-splash-screen";

import { BootAnimationGate } from "@/boot/BootAnimationGate";
import { BootDraftContinuationSheet } from "@/boot/BootDraftContinuationSheet";
import {
  bootOwnerFromAuth,
  computeBootReady,
  computeRouteResolved,
  createBootCompletionMachine,
  createBootGateCompleters,
  sequenceHoldDurationMs,
  shouldShowLocalDbFailure,
} from "@/boot/bootCompletion";
import { markBootNavigationSettled } from "@/boot/bootGate";
import {
  resolveBootDestination,
  type BootComposerDraftContinuation,
} from "@/boot/resolveBootRoute";
import { BRAND_SURFACE } from "@/config/brandMotion";
import { useBootReducedMotion } from "@/components/boot/VyaamikkBootAnimation";
import { LocalDbErrorScreen } from "@/components/sync/LocalDbErrorScreen";
import { activeRouteRepository } from "@/repositories/activeRouteRepository";
import { snoozeBootDraftPrompt } from "@/services/drafts/draftBootSnooze";
import { useAuth } from "@/state/auth";
import { useLocalDb } from "@/state/localDb";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";

type BootPhase = "preparing" | "routing";

/**
 * Boot: ledger open animation, then local DB → auth gates → route.
 * Native splash hides as soon as this view is up so the launcher mark
 * cannot cover the animation. Routing rules are unchanged.
 *
 * Presentation timeouts never manufacture a destination. Completion requires
 * a destination bound to the current session UID+generation.
 */
export default function BootScreen() {
  const { status, justCreated, user } = useAuth();
  const { status: dbStatus, error: dbError } = useLocalDb();
  const router = useRouter();
  const reducedMotion = useBootReducedMotion();
  const machineRef = useRef(createBootCompletionMachine());
  const [phase, setPhase] = useState<BootPhase>("preparing");
  const [continuation, setContinuation] =
    useState<BootComposerDraftContinuation | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [destinationReady, setDestinationReady] = useState(false);
  const [sequenceHoldDone, setSequenceHoldDone] = useState(false);
  const [animationVisible, setAnimationVisible] = useState(true);
  const [routeFailed, setRouteFailed] = useState(false);
  const [resolveEpoch, setResolveEpoch] = useState(0);

  const session = syncSessionOwnership.capture();
  const sessionUid = session?.uid ?? null;
  const sessionGen = session?.generation ?? null;
  const owner = useMemo(
    () =>
      bootOwnerFromAuth(
        status,
        user?.uid ?? null,
        sessionUid && sessionGen != null ? { uid: sessionUid, generation: sessionGen } : null
      ),
    [status, user?.uid, sessionUid, sessionGen]
  );
  const userRef = useRef(user);
  userRef.current = user;
  const bootReady = computeBootReady({ dbStatus, authStatus: status, owner });
  const routeResolved = computeRouteResolved({
    destinationReady,
    sequenceHoldDone,
    routeFailed,
  });

  const finishBootNavigation = useCallback(
    (href: Href) => {
      markBootNavigationSettled();
      setAnimationVisible(false);
      router.replace(href);
      void SplashScreen.hideAsync().catch(() => {});
    },
    [router]
  );

  const applyAction = useCallback(
    (action: ReturnType<typeof machineRef.current.tryComplete>) => {
      if (action.type === "navigate") {
        setSheetVisible(false);
        setContinuation(null);
        finishBootNavigation(action.href);
        return;
      }
      if (action.type === "show_continuation") {
        setContinuation(action.continuation);
        setSheetVisible(true);
        setAnimationVisible(false);
        void SplashScreen.hideAsync().catch(() => {});
        return;
      }
      if (action.type === "hide_continuation") {
        setSheetVisible(false);
        setContinuation(null);
        return;
      }
      if (action.type === "resolver_failed") {
        setRouteFailed(true);
        setDestinationReady(false);
      }
    },
    [finishBootNavigation]
  );

  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    const hide = machineRef.current.observeOwner(owner);
    applyAction(hide);
    setDestinationReady(machineRef.current.hasPendingDestination());
    setRouteFailed(machineRef.current.isRouteFailed());
  }, [applyAction, owner]);

  useEffect(() => {
    const ms = sequenceHoldDurationMs(reducedMotion);
    const timer = setTimeout(() => setSequenceHoldDone(true), ms);
    return () => clearTimeout(timer);
  }, [reducedMotion]);

  useEffect(() => {
    if (dbStatus !== "ready") return;
    setPhase("routing");
  }, [dbStatus]);

  useEffect(() => {
    if (phase !== "routing") return;
    if (dbStatus !== "ready") return;
    if (!owner || owner.kind === "loading") return;

    let cancelled = false;
    setRouteFailed(false);
    void (async () => {
      const action = await machineRef.current.resolveForOwner(
        owner,
        {
          signedIn: owner.kind === "signed_in",
          user: userRef.current,
          justCreated,
        },
        resolveBootDestination
      );
      if (cancelled) return;
      applyAction(action);
      setDestinationReady(machineRef.current.hasPendingDestination());
      setRouteFailed(machineRef.current.isRouteFailed());
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, dbStatus, owner, justCreated, applyAction, resolveEpoch]);

  const gateCompleters = useMemo(
    () => createBootGateCompleters(machineRef.current),
    []
  );

  const applyPresentationSignal = useCallback(
    (which: "onExitComplete" | "onHoldTimeout") => {
      applyAction(gateCompleters[which]());
      setDestinationReady(machineRef.current.hasPendingDestination());
    },
    [applyAction, gateCompleters]
  );

  const handleContinueDraft = useCallback(() => {
    if (!continuation) return;
    applyAction(machineRef.current.takeContinuationNavigation(continuation.composerHref));
  }, [applyAction, continuation]);

  const handleLater = useCallback(async () => {
    if (!continuation) return;
    if (!machineRef.current.continuationBelongsToCurrent(continuation.userId)) {
      applyAction({ type: "hide_continuation" });
      return;
    }
    await snoozeBootDraftPrompt(continuation.userId);
    await activeRouteRepository.clear(continuation.userId);
    applyAction(machineRef.current.takeContinuationNavigation("/(app)/(tabs)/you"));
  }, [applyAction, continuation]);

  const handleViewDrafts = useCallback(() => {
    if (!continuation) return;
    if (!machineRef.current.continuationBelongsToCurrent(continuation.userId)) {
      applyAction({ type: "hide_continuation" });
      return;
    }
    applyAction(machineRef.current.takeContinuationNavigation("/(app)/drafts"));
  }, [applyAction, continuation]);

  const retryResolve = useCallback(() => {
    setRouteFailed(false);
    setDestinationReady(false);
    setResolveEpoch((n) => n + 1);
  }, []);

  if (shouldShowLocalDbFailure(dbStatus)) {
    return <LocalDbErrorScreen message={dbError?.message} />;
  }

  return (
    <>
      <View style={styles.hold} />
      <BootAnimationGate
        visible={animationVisible}
        bootReady={bootReady}
        routeResolved={routeResolved}
        bootError={routeFailed}
        onBlackMidpoint={() => undefined}
        onExitComplete={() => applyPresentationSignal("onExitComplete")}
        onHoldTimeout={() => applyPresentationSignal("onHoldTimeout")}
      />
      {routeFailed ? (
        <View style={styles.retryWrap} pointerEvents="box-none">
          <Pressable onPress={retryResolve} style={styles.retry} accessibilityRole="button">
            <Text style={styles.retryLabel}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
      <BootDraftContinuationSheet
        visible={sheetVisible}
        continuation={continuation}
        onContinue={handleContinueDraft}
        onLater={() => void handleLater()}
        onViewDrafts={handleViewDrafts}
      />
    </>
  );
}

const styles = StyleSheet.create({
  hold: {
    flex: 1,
    backgroundColor: BRAND_SURFACE,
  },
  retryWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 48,
  },
  retry: {
    backgroundColor: "#C9A84C",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryLabel: {
    color: "#1E1B4B",
    fontWeight: "700",
  },
});
