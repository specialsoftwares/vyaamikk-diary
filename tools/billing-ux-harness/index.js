import React, { Component, useEffect } from "react";
import { AppRegistry, Platform, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";

import { I18nProvider } from "@/i18n";
import { LocaleFontProvider } from "@/i18n/LocaleFontProvider";
import { ThemeProvider } from "@/theme";

import { HarnessApp } from "./src/HarnessApp";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const Stack = createNativeStackNavigator();

class PreviewErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: "#3B0D0D", padding: 24, justifyContent: "center" }}>
          <Text style={{ color: "#FEE2E2", fontSize: 16 }}>
            Isolated preview failed: {String(this.state.error)}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function Root() {
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  return (
    <PreviewErrorBoundary>
      <React.Suspense
        fallback={
          <View style={{ flex: 1, backgroundColor: "#1E1B4B", justifyContent: "center" }}>
            <Text style={{ color: "#E0E7FF" }}>Loading isolated preview…</Text>
          </View>
        }
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <ThemeProvider>
              <I18nProvider>
                <LocaleFontProvider>
                  <StatusBar style="light" />
                  <NavigationContainer theme={DarkTheme}>
                    <Stack.Navigator screenOptions={{ headerShown: false, animation: "none" }}>
                      <Stack.Screen name="BillingUxHarness" component={HarnessApp} />
                    </Stack.Navigator>
                  </NavigationContainer>
                </LocaleFontProvider>
              </I18nProvider>
            </ThemeProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </React.Suspense>
    </PreviewErrorBoundary>
  );
}

AppRegistry.registerComponent("main", () => Root);

function mountWeb() {
  try {
    const existing = document.getElementById("root") ?? document.getElementById("main");
    if (!existing) return;
    const fresh = existing.cloneNode(false);
    fresh.id = "root";
    existing.replaceWith(fresh);
    // Bypass RN-web hydrateRoot on Expo's empty static #root.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createRoot } = require("react-dom/client");
    createRoot(fresh).render(React.createElement(Root));
  } catch (error) {
    const node = document.getElementById("root") ?? document.body;
    if (node) {
      node.textContent = `Isolated preview failed: ${error instanceof Error ? error.stack : String(error)}`;
    }
  }
}

if (Platform.OS === "web" && typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountWeb, { once: true });
  } else {
    mountWeb();
  }
} else {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { registerRootComponent } = require("expo");
  registerRootComponent(Root);
}
