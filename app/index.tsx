import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import * as SplashScreen from "expo-splash-screen";

import { BootAnimationGate } from "@/boot/BootAnimationGate";
import { BootDraftContinuationSheet } from "@/boot/BootDraftContinuationSheet";
import { markBootNavigationSettled } from "@/boot/bootGate";
import {
  resolveBootDestination,
  type BootComposerDraftContinuation,
  type BootDestination,
} from "@/boot/resolveBootRoute";
import { getAuthEntryHref } from "@/config/authWrapper";
import {
  BOOT_ANIMATION_MS,
  BOOT_REDUCED_MOTION_MS,
  BRAND_SURFACE,
} from "@/config/brandMotion";
import { useBootReducedMotion } from "@/components/boot/VyaamikkBootAnimation";
import { LocalDbErrorScreen } from "@/components/sync/LocalDbErrorScreen";
import { activeRouteRepository } from "@/repositories/activeRouteRepository";
import { snoozeBootDraftPrompt } from "@/services/drafts/draftBootSnooze";
import { useAuth } from "@/state/auth";
import { useLocalDb } from "@/state/localDb";

type BootPhase = "preparing" | "routing";

/**
 * Boot: ledger open animation, then local DB → auth gates → route.
 * Native splash hides as soon as this view is up so the launcher mark
 * cannot cover the animation. Routing rules are unchanged.
 */
export default function BootScreen() {
  const { status, justCreated, user } = useAuth();
  const { status: dbStatus, error: dbError } = useLocalDb();
  const router = useRouter();
  const reducedMotion = useBootReducedMotion();
  const [phase, setPhase] = useState<BootPhase>("preparing");
  const [continuation, setContinuation] =
    useState<BootComposerDraftContinuation | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [destinationReady, setDestinationReady] = useState(false);
  const [sequenceHoldDone, setSequenceHoldDone] = useState(false);
  const [animationVisible, setAnimationVisible] = useState(true);
  const routingStartedRef = useRef(false);
  const navigatedRef = useRef(false);
  const pendingDestinationRef = useRef<BootDestination | null>(null);

  const bootReady = dbStatus === "ready" && status !== "loading";
  const routeResolved = destinationReady && sequenceHoldDone;

  const finishBootNavigation = useCallback(
    (href: Href) => {
      markBootNavigationSettled();
      router.replace(href);
      void SplashScreen.hideAsync().catch(() => {});
    },
    [router]
  );

  const applyDestination = useCallback(
    (destination: BootDestination) => {
      if (destination.kind === "draft_continuation") {
        setContinuation(destination.continuation);
        setSheetVisible(true);
        void SplashScreen.hideAsync().catch(() => {});
        return;
      }
      finishBootNavigation(destination.href);
    },
    [finishBootNavigation]
  );

  const completeBoot = useCallback(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    setAnimationVisible(false);
    const dest = pendingDestinationRef.current;
    if (dest) {
      applyDestination(dest);
      return;
    }
    if (status === "signed_out" || !user) {
      finishBootNavigation(getAuthEntryHref());
      return;
    }
    finishBootNavigation("/(app)/(tabs)/you");
  }, [applyDestination, finishBootNavigation, status, user]);

  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    const ms = reducedMotion ? BOOT_REDUCED_MOTION_MS : BOOT_ANIMATION_MS;
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
    if (status === "loading") return;
    if (routingStartedRef.current) return;
    routingStartedRef.current = true;

    let cancelled = false;

    (async () => {
      const destination = await resolveBootDestination({
        signedIn: status === "signed_in" && Boolean(user),
        user,
        justCreated,
      });
      if (cancelled) return;

      pendingDestinationRef.current = destination;
      setDestinationReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, dbStatus, status, justCreated, user]);

  /** Failsafe if the gate never finishes — not an aesthetic delay. */
  useEffect(() => {
    if (phase !== "routing" || sheetVisible) return;
    const timer = setTimeout(() => {
      completeBoot();
    }, 12_000);
    return () => clearTimeout(timer);
  }, [phase, sheetVisible, completeBoot]);

  const handleContinueDraft = useCallback(() => {
    if (!continuation) return;
    setSheetVisible(false);
    finishBootNavigation(continuation.composerHref);
  }, [continuation, finishBootNavigation]);

  const handleLater = useCallback(async () => {
    if (!continuation) return;
    await snoozeBootDraftPrompt(continuation.userId);
    await activeRouteRepository.clear(continuation.userId);
    setSheetVisible(false);
    setContinuation(null);
    finishBootNavigation("/(app)/(tabs)/you");
  }, [continuation, finishBootNavigation]);

  const handleViewDrafts = useCallback(() => {
    setSheetVisible(false);
    setContinuation(null);
    finishBootNavigation("/(app)/drafts");
  }, [finishBootNavigation]);

  if (dbStatus === "failed") {
    return <LocalDbErrorScreen message={dbError?.message} />;
  }

  return (
    <>
      <View style={styles.hold} />
      <BootAnimationGate
        visible={animationVisible}
        bootReady={bootReady}
        routeResolved={routeResolved}
        bootError={false}
        onBlackMidpoint={() => undefined}
        onExitComplete={completeBoot}
        onHoldTimeout={completeBoot}
      />
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
});
