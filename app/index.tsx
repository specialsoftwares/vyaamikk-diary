import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";

import { BootAnimationGate } from "@/boot/BootAnimationGate";
import { BootDraftContinuationSheet } from "@/boot/BootDraftContinuationSheet";
import { BootScreenView } from "@/boot/BootScreenView";
import { markBootNavigationSettled } from "@/boot/bootGate";
import { resolveBootDestination } from "@/boot/resolveBootRoute";
import { BRAND_SURFACE } from "@/config/brandMotion";
import { useBootReducedMotion } from "@/components/boot/VyaamikkBootAnimation";
import { LocalDbErrorScreen } from "@/components/sync/LocalDbErrorScreen";
import { useT } from "@/i18n";
import { activeRouteRepository } from "@/repositories/activeRouteRepository";
import { snoozeBootDraftPrompt } from "@/services/drafts/draftBootSnooze";
import { useAuth } from "@/state/auth";
import { useLocalDb } from "@/state/localDb";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";

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
  const t = useT();
  const hideSplash = useCallback(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);
  const schedule = useCallback((fn: () => void, ms: number) => {
    const timer = setTimeout(fn, ms);
    return () => clearTimeout(timer);
  }, []);

  return (
    <BootScreenView
      ports={{
        authStatus: status,
        justCreated,
        user,
        dbStatus,
        dbErrorMessage: dbError?.message,
        reducedMotion,
        captureSession: () => syncSessionOwnership.capture(),
        resolveDestination: resolveBootDestination,
        snoozeDraft: snoozeBootDraftPrompt,
        clearActiveRoute: (userId) => activeRouteRepository.clear(userId),
        replaceRoute: (href) => {
          router.replace(href);
        },
        hideSplash,
        markNavigationSettled: markBootNavigationSettled,
        t,
        schedule,
        renderDbFailure: (message) => <LocalDbErrorScreen message={message} />,
        renderBackdrop: () => <View style={styles.hold} />,
        renderGate: (props) => <BootAnimationGate {...props} />,
        renderRetry: ({ onPress, label }) => (
          <View style={styles.retryWrap} pointerEvents="box-none">
            <Pressable
              onPress={onPress}
              style={styles.retry}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Text style={styles.retryLabel}>{label}</Text>
            </Pressable>
          </View>
        ),
        renderSheet: (props) => <BootDraftContinuationSheet {...props} />,
      }}
    />
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
    zIndex: 20,
    elevation: 20,
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
