import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { useFonts } from "expo-font";
import {
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_500Medium,
  NotoSansDevanagari_600SemiBold,
} from "@expo-google-fonts/noto-sans-devanagari";
import {
  NotoSansTamil_400Regular,
  NotoSansTamil_500Medium,
  NotoSansTamil_600SemiBold,
} from "@expo-google-fonts/noto-sans-tamil";
import {
  NotoSansTelugu_400Regular,
  NotoSansTelugu_500Medium,
  NotoSansTelugu_600SemiBold,
} from "@expo-google-fonts/noto-sans-telugu";
import {
  NotoSansGujarati_400Regular,
  NotoSansGujarati_500Medium,
  NotoSansGujarati_600SemiBold,
} from "@expo-google-fonts/noto-sans-gujarati";

import { setLocaleFontFamily, type LocaleFontFamily } from "@/theme/localeTypography";
import { useI18n, type Lang } from "./index";

const SCRIPT_LANGS = new Set<Lang>(["hi", "ta", "te", "gu"]);

const FONT_BY_LANG: Record<"hi" | "ta" | "te" | "gu", LocaleFontFamily> = {
  hi: "NotoSansDevanagari_400Regular",
  ta: "NotoSansTamil_400Regular",
  te: "NotoSansTelugu_400Regular",
  gu: "NotoSansGujarati_400Regular",
};

const SYSTEM_FONT = Platform.select({
  ios: "System",
  android: "sans-serif",
  default: "System",
}) as string;

interface LocaleFontContextValue {
  revision: number;
  fontFamily: string;
}

const LocaleFontContext = createContext<LocaleFontContextValue>({
  revision: 0,
  fontFamily: SYSTEM_FONT,
});

export function useLocaleFontRevision(): number {
  return useContext(LocaleFontContext).revision;
}

function resolveLocaleFont(lang: Lang, fontsLoaded: boolean): LocaleFontFamily | undefined {
  if (!fontsLoaded || !SCRIPT_LANGS.has(lang)) return undefined;
  return FONT_BY_LANG[lang as "hi" | "ta" | "te" | "gu"];
}

/** Loads script fonts and rebuilds typography tokens for Hindi/Tamil/Telugu/Gujarati UI. */
export function LocaleFontProvider({ children }: { children: React.ReactNode }) {
  const { lang } = useI18n();
  const [revision, setRevision] = useState(0);
  const [fontsLoaded] = useFonts({
    NotoSansDevanagari_400Regular,
    NotoSansDevanagari_500Medium,
    NotoSansDevanagari_600SemiBold,
    NotoSansTamil_400Regular,
    NotoSansTamil_500Medium,
    NotoSansTamil_600SemiBold,
    NotoSansTelugu_400Regular,
    NotoSansTelugu_500Medium,
    NotoSansTelugu_600SemiBold,
    NotoSansGujarati_400Regular,
    NotoSansGujarati_500Medium,
    NotoSansGujarati_600SemiBold,
  });

  const fontFamily = useMemo(
    () => resolveLocaleFont(lang, fontsLoaded) ?? SYSTEM_FONT,
    [lang, fontsLoaded]
  );

  useEffect(() => {
    setLocaleFontFamily(fontFamily);
    setRevision((n) => n + 1);
  }, [fontFamily]);

  const value = useMemo(
    () => ({ revision, fontFamily }),
    [revision, fontFamily]
  );

  return (
    <LocaleFontContext.Provider value={value}>{children}</LocaleFontContext.Provider>
  );
}

export function useLocaleFontFamily(): string {
  return useContext(LocaleFontContext).fontFamily;
}
