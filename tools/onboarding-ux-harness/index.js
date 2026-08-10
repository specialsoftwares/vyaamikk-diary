import { registerRootComponent } from "expo";
// harness host — Expo Go presentation only (provenance inscription v2)
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";

import { I18nProvider } from "@/i18n";
import { LocaleFontProvider } from "@/i18n/LocaleFontProvider";
import { ThemeProvider } from "@/theme";

import { HarnessApp } from "./src/HarnessApp";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function Root() {
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <I18nProvider>
            <LocaleFontProvider>
              <StatusBar style="light" />
              <HarnessApp />
            </LocaleFontProvider>
          </I18nProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

registerRootComponent(Root);
