import { GestureHandlerRootView } from "react-native-gesture-handler";
import React from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { BootstrapRoot } from "@/startup/BootstrapRoot";
import { decideRootDataProviders } from "@/config/rootDataProviders";
import { AppFeedbackProvider } from "@/feedback/AppFeedback";
import { LocalDbProvider } from "@/state/localDb";
import { AuthProvider } from "@/state/auth";
import { SubscriptionProvider } from "@/subscription";
import { IapProvider } from "@/billing/iap";
import { QuotaUpsellHost } from "@/billing/quotaUpsell";
import { SyncProvider } from "@/state/sync";
import { I18nProvider } from "@/i18n";
import { LocaleFontProvider } from "@/i18n/LocaleFontProvider";
import { ThemeProvider, useTheme } from "@/theme";
import { I18nextProvider } from "react-i18next";
import { i18n } from "@/i18n/i18n";

/**
 * Keep splash visible until BootScreen hides it after route resolution,
 * or BootstrapRoot hides it on a controlled startup failure.
 * Never call assertProductionConfig() at module scope — that terminated Android.
 */
SplashScreen.preventAutoHideAsync().catch(() => {
  // No-op — splash hide is best-effort.
});

/** Pathname must never gate this — see `decideRootDataProviders`. */
const rootDataProviders = decideRootDataProviders();

/**
 * Single stable provider tree for the entire app.
 *
 * LocalDb → Auth → Subscription → IAP → QuotaUpsellHost → Sync → AppFeedback must remain mounted
 * across public routes, authenticated routes, redirects, and language
 * transitions. Subscription and IAP are uid-bound and must not remount per screen.
 */
function RootProviders({ children }: { children: React.ReactNode }) {
  // Soft-check only — BootstrapRoot already enforced this fail-closed in-UI.
  if (
    !rootDataProviders.mountLocalDb ||
    !rootDataProviders.mountAuth ||
    !rootDataProviders.mountSubscription ||
    !rootDataProviders.mountIap ||
    !rootDataProviders.mountSync ||
    !rootDataProviders.mountAppFeedback
  ) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <I18nextProvider i18n={i18n}>
            <I18nProvider>
              <LocaleFontProvider>
                <LocalDbProvider>
                  <AuthProvider>
                    <SubscriptionProvider>
                      <IapProvider>
                        <QuotaUpsellHost>
                          <SyncProvider>
                            <AppFeedbackProvider>{children}</AppFeedbackProvider>
                          </SyncProvider>
                        </QuotaUpsellHost>
                      </IapProvider>
                    </SubscriptionProvider>
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
    <BootstrapRoot>
      <RootProviders>
        <ThemedAppShell />
      </RootProviders>
    </BootstrapRoot>
  );
}

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
