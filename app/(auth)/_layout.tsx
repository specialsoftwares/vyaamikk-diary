import React from "react";
import { Stack } from "expo-router";

import { useThemeColors } from "@/theme";

export default function AuthLayout() {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: "slide_from_right",
        animationDuration: 250,
      }}
    />
  );
}
