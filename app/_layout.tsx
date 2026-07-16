import "react-native-gesture-handler";
import React from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { assertProductionConfig } from "@/config/productionGuard";
import { decideRootDataProviders } from "@/config/rootDataProviders";
import { AppFeedbackProvider } from "@/feedback/AppFeedback";
import { LocalDbProvider } from "@/state/localDb";
import { AuthProvider } from "@/state/auth";
import { SyncProvider } from "@/state/sync";
import { I18nProvider } from "@/i18n";
import { LocaleFontProvider } from "@/i18n/LocaleFontProvider";
import { ThemeProvider, useTheme } from "@/theme";
import { I18nextProvider } from "react-i18next";
import { i18n } from "@/i18n/i18n";

assertProductionConfig();

/** Pathname must never gate this — see `decideRootDataProviders`. */
const rootDataProviders = decideRootDataProviders();
if (
  !rootDataProviders.mountLocalDb ||
  !rootDataProviders.mountAuth ||
  !rootDataProviders.mountSync ||
  !rootDataProviders.mountAppFeedback
) {
  throw new Error(
    "Root LocalDb/Auth/Sync/AppFeedback providers must always mount (path-gated mounts crash useAuth consumers)."
  );
}

SplashScreen.preventAutoHideAsync().catch(() => {
  // No-op — splash hide is best-effort.
});

/**
 * Single stable provider tree for the entire app.
 *
 * LocalDb → Auth → Sync → AppFeedback must remain mounted across public
 * routes, authenticated routes, redirects, and language transitions.
 * Path-gated provider swaps previously unmounted AuthProvider while
 * Expo Router kept `app/(app)/_layout` (a `useAuth` consumer) alive.
 *
 * Order matters: AuthProvider reads LocalDb; SyncProvider reads Auth + LocalDb.
 */
function RootProviders({ children }: { children: React.ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <I18nextProvider i18n={i18n}>
            <I18nProvider>
              <LocaleFontProvider>
                <LocalDbProvider>
                  <AuthProvider>
                    <SyncProvider>
                      <AppFeedbackProvider>{children}</AppFeedbackProvider>
                    </SyncProvider>
                  </AuthProvider>
                </LocalDbProvider>
              </LocaleFontProvider>
            </I18nProvider>
          </I18nextProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <RootProviders>
      <ThemedAppShell />
    </RootProviders>
  );
}

/**
 * Inner shell that consumes the theme so the StatusBar + Stack
 * background follow light/dark live.
 */
function ThemedAppShell() {
  const { resolvedMode, colors } = useTheme();
  return (
    <>
      <StatusBar style={resolvedMode === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "fade",
        }}
      />
    </>
  );
}
