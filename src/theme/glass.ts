import { Platform } from "react-native";
import type { BlurTint } from "expo-blur";

import type { ResolvedThemeMode } from "./ThemeContext";

export function glassChromeTint(mode: ResolvedThemeMode): BlurTint {
  return mode === "dark" ? "systemChromeMaterialDark" : "systemChromeMaterialLight";
}

export function glassCardTint(mode: ResolvedThemeMode): BlurTint {
  return mode === "dark" ? "systemThinMaterialDark" : "systemThinMaterialLight";
}

export function glassBlurIntensity(mode: ResolvedThemeMode): number {
  return mode === "dark" ? 72 : 68;
}

export function glassTabBarIntensity(mode: ResolvedThemeMode): number {
  return mode === "dark" ? 78 : 74;
}

export function glassFallbackFill(mode: ResolvedThemeMode): string {
  return mode === "dark" ? "rgba(22, 25, 49, 0.92)" : "rgba(255, 255, 255, 0.92)";
}

export function glassFallbackMuted(mode: ResolvedThemeMode): string {
  return mode === "dark" ? "rgba(30, 34, 64, 0.9)" : "rgba(245, 246, 250, 0.94)";
}

export function useNativeGlassBlur(): boolean {
  return Platform.OS === "ios";
}
