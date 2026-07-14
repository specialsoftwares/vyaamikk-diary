import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

import { setLocaleFontFamily } from "@/theme/localeTypography";
import {
  FONT_BY_LANG,
  ensureScriptFontLoaded,
  isScriptLang,
  resolveLoadedLocaleFont,
} from "./localeFonts";
import { useI18n } from "./index";

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

/**
 * Resolves the script font for the active language only.
 *
 * The language transition controller preloads the target script font BEFORE
 * committing a switch, and the boot path preloads the stored language's font
 * before first paint — so this provider normally finds the font already
 * cached. The load-on-lang-change effect below is a safety net; while a font
 * loads (or if it fails), the system font renders the script correctly — no
 * blank text.
 */
export function LocaleFontProvider({ children }: { children: React.ReactNode }) {
  const { lang } = useI18n();
  const [revision, setRevision] = useState(0);
  const [fontFamily, setFontFamily] = useState<string>(
    () => resolveLoadedLocaleFont(lang) ?? SYSTEM_FONT
  );

  useEffect(() => {
    if (!isScriptLang(lang)) {
      setFontFamily(SYSTEM_FONT);
      return;
    }
    const loaded = resolveLoadedLocaleFont(lang);
    if (loaded) {
      setFontFamily(loaded);
      return;
    }
    // Safety net: transition/boot should have preloaded this already.
    let cancelled = false;
    setFontFamily(SYSTEM_FONT);
    void ensureScriptFontLoaded(lang).then((ok) => {
      if (cancelled) return;
      setFontFamily(ok ? FONT_BY_LANG[lang] : SYSTEM_FONT);
    });
    return () => {
      cancelled = true;
    };
  }, [lang]);

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
