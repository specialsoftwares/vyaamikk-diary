import { Platform } from "react-native";

import { rebuildTypography } from "./typography";

export type LocaleFontFamily = string;

const DEFAULT_FONT = Platform.select({
  ios: "System",
  android: "sans-serif",
  default: "System",
}) as string;

let activeLocaleFont: LocaleFontFamily | undefined;

export function getActiveLocaleFont(): LocaleFontFamily | undefined {
  return activeLocaleFont;
}

/** Swap typography tokens to a new locale font without mutating frozen style objects. */
export function setLocaleFontFamily(fontFamily?: LocaleFontFamily): void {
  const next =
    fontFamily && fontFamily !== DEFAULT_FONT ? fontFamily : undefined;
  if (activeLocaleFont === next) return;
  activeLocaleFont = next;
  rebuildTypography(next);
}
