import "react-native-gesture-handler";
import React from "react";
import { Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { assertProductionConfig } from "@/config/productionGuard";
import { isPublicLightweightRoute } from "@/config/publicRoutes";
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

SplashScreen.preventAutoHideAsync().catch(() => {
  // No-op — splash hide is best-effort.
});

function SharedShellProviders({ children }: { children: React.ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <I18nextProvider i18n={i18n}>
            <I18nProvider>
              <LocaleFontProvider>{children}</LocaleFontProvider>
            </I18nProvider>
          </I18nextProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicRoute = isPublicLightweightRoute(pathname);

  if (isPublicRoute) {
    return <SharedShellProviders>{children}</SharedShellProviders>;
  }

  return (
    <SharedShellProviders>
      <LocalDbProvider>
        <AuthProvider>
          <SyncProvider>
            <AppFeedbackProvider>{children}</AppFeedbackProvider>
          </SyncProvider>
        </AuthProvider>
      </LocalDbProvider>
    </SharedShellProviders>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <ThemedAppShell />
    </AppProviders>
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
