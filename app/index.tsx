import React, { useCallback, useEffect, useRef, useState } from "react";
import { LocaleUiText } from "@/components/ui/LocaleUiText";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import * as SplashScreen from "expo-splash-screen";

import { BootAnimationGate } from "@/boot/BootAnimationGate";
import { BootDraftContinuationSheet } from "@/boot/BootDraftContinuationSheet";
import { consumeBootAnimationSlot } from "@/boot/bootAnimationSession";
import { markBootNavigationSettled } from "@/boot/bootGate";
import {
  resolveBootDestination,
  type BootComposerDraftContinuation,
  type BootDestination,
} from "@/boot/resolveBootRoute";
import { getAuthEntryHref } from "@/config/authWrapper";
import { BRAND_SURFACE } from "@/config/brandMotion";
import { LocalDbErrorScreen } from "@/components/sync/LocalDbErrorScreen";
import { activeRouteRepository } from "@/repositories/activeRouteRepository";
import { snoozeBootDraftPrompt } from "@/services/drafts/draftBootSnooze";
import { useAuth } from "@/state/auth";
import { useLocalDb } from "@/state/localDb";
import { BrandMomentsTagline } from "@/components/brand/BrandMomentsTagline";
import { spacing, typography, useThemedStyles, useThemeColors } from "@/theme";
import { useT } from "@/i18n";

type BootPhase = "preparing" | "routing";

/**
 * Boot: local DB → auth onboarding gates → optimistic route / draft continuation sheet.
 * Premium boot animation (once per cold session) runs in parallel with route resolution.
 */
export default function BootScreen() {
  const t = useT();
  const { status, justCreated, user } = useAuth();
  const { status: dbStatus, error: dbError } = useLocalDb();
  const router = useRouter();
  const colors = useThemeColors();
  const [phase, setPhase] = useState<BootPhase>("preparing");
  const [continuation, setContinuation] =
    useState<BootComposerDraftContinuation | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const routingStartedRef = useRef(false);

  const playBootAnimation = useRef(consumeBootAnimationSlot()).current;
  const [bootOverlayVisible, setBootOverlayVisible] = useState(playBootAnimation);
  const [pendingDestination, setPendingDestination] = useState<BootDestination | null>(null);
  const pendingDestinationRef = useRef<BootDestination | null>(null);

  const bootReady =
    dbStatus === "ready" && phase === "routing" && status !== "loading";
  const routeResolved = pendingDestination != null;
  const bootError = dbStatus === "failed";

  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      container: {
        flex: 1,
        backgroundColor: playBootAnimation ? BRAND_SURFACE : c.background,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: spacing.xl,
      },
      logoCircle: {
        width: 72,
        height: 72,
        borderRadius: 18,
        backgroundColor: c.primary,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: spacing.lg,
      },
      logoText: { ...typography.titleLg, color: c.primaryOn, letterSpacing: 1 },
      title: { ...typography.displayMd, color: c.text, marginBottom: spacing.sm },
      taglineBlock: { marginTop: spacing.xs, maxWidth: 300 },
      spinner: { marginTop: spacing.xl },
    })
  );

  const finishBootNavigation = useCallback(
    (href: Href) => {
      markBootNavigationSettled();
      router.replace(href);
    },
    [router]
  );

  const applyDestination = useCallback(
    (destination: BootDestination) => {
      if (destination.kind === "draft_continuation") {
        setContinuation(destination.continuation);
        setSheetVisible(true);
        return;
      }
      finishBootNavigation(destination.href);
    },
    [finishBootNavigation]
  );

  const releaseBootToApp = useCallback(() => {
    const dest = pendingDestinationRef.current;
    if (dest) {
      applyDestination(dest);
      return;
    }
    markBootNavigationSettled();
    if (status === "signed_out" || !user) {
      router.replace(getAuthEntryHref());
      return;
    }
    router.replace("/(app)/(tabs)/you");
  }, [applyDestination, router, status, user]);

  const onBootBlackMidpoint = useCallback(() => {
    requestAnimationFrame(() => {
      releaseBootToApp();
    });
  }, [releaseBootToApp]);

  const onBootExitComplete = useCallback(() => {
    setBootOverlayVisible(false);
  }, []);

  const onBootHoldTimeout = useCallback(() => {
    setBootOverlayVisible(false);
    releaseBootToApp();
  }, [releaseBootToApp]);

  useEffect(() => {
    if (dbStatus !== "ready") return;

    let mounted = true;

    async function prepareBoot() {
      await SplashScreen.hideAsync().catch(() => {});
      if (mounted) setPhase("routing");
    }

    prepareBoot();
    return () => {
      mounted = false;
    };
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
      setPendingDestination(destination);

      if (!playBootAnimation) {
        applyDestination(destination);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, dbStatus, status, justCreated, user, playBootAnimation, applyDestination]);

  /** Never leave the boot shell spinning indefinitely (slow Firestore / stuck router). */
  useEffect(() => {
    if (phase !== "routing" || sheetVisible) return;
    if (bootOverlayVisible) return;
    const timer = setTimeout(() => {
      releaseBootToApp();
    }, 12_000);
    return () => clearTimeout(timer);
  }, [phase, sheetVisible, bootOverlayVisible, releaseBootToApp]);

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

  if (dbStatus === "loading" || phase === "preparing") {
    return null;
  }

  const showLegacySpinner =
    phase === "routing" &&
    !sheetVisible &&
    !playBootAnimation &&
    status !== "signed_out" &&
    !pendingDestination;

  return (
    <>
      {showLegacySpinner ? (
        <View style={styles.container}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>VD</Text>
          </View>
          <LocaleUiText style={styles.title}>{t("app.name")}</LocaleUiText>
          <BrandMomentsTagline compact style={styles.taglineBlock} />
          <ActivityIndicator color={colors.primary} style={styles.spinner} />
        </View>
      ) : playBootAnimation && !sheetVisible ? (
        <View style={styles.container} />
      ) : null}

      <BootAnimationGate
        visible={bootOverlayVisible && !sheetVisible}
        bootReady={bootReady}
        routeResolved={routeResolved}
        bootError={bootError}
        onBlackMidpoint={onBootBlackMidpoint}
        onExitComplete={onBootExitComplete}
        onHoldTimeout={onBootHoldTimeout}
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
