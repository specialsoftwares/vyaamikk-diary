import { useMemo } from "react";

import { buildBrandTokens } from "./brandTokens";
import { getCategoryAccent, type CategoryAccentKey } from "./categoryAccents";
import { useTheme } from "./ThemeContext";

export function useBrandTokens() {
  const { colors, resolvedMode } = useTheme();
  return useMemo(() => buildBrandTokens(colors, resolvedMode), [colors, resolvedMode]);
}

export function useCategoryAccent(key: CategoryAccentKey) {
  const { resolvedMode } = useTheme();
  return useMemo(() => getCategoryAccent(key, resolvedMode), [key, resolvedMode]);
}
