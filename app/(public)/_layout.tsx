import React, { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";

import { LANDING_COLORS } from "@/components/landing/landingTokens";

/** Public routes — no auth redirects; dark marketing canvas. */
export default function PublicLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: LANDING_COLORS.canvas },
        animation: "fade",
      }}
    />
  );
}
