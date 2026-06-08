import { useMemo } from "react";
import { type TextStyle } from "react-native";

import { getLanguageTextStyle } from "./languageTextStyle";
import { useI18n } from "./index";

/** Hook for components rendering translated labels/titles/buttons. */
export function useLanguageTextStyle(baseStyle?: TextStyle | TextStyle[] | null): TextStyle {
  const { lang } = useI18n();
  const normalized = baseStyle ?? undefined;
  return useMemo(() => getLanguageTextStyle(lang, normalized), [lang, normalized]);
}

export { getLanguageTextStyle } from "./languageTextStyle";
