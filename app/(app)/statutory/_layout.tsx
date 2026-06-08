import React from "react";
import { Stack } from "expo-router";

import { useThemeColors } from "@/theme";

/** Statutory list + detail (opened from Settings & Info or calendar). */
export default function StatutoryLayout() {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: "slide_from_right",
      }}
    />
  );
}
