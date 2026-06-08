/**
 * i18n compatibility layer — react-i18next under the hood.
 *
 * Existing screens import `useI18n`, `useT`, and `translate` unchanged.
 * UI language is persisted under `vyd_language_v1` (legacy `vyd_lang_v1` read).
 * All five locale bundles are registered at init; missing keys fall back to English.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { InteractionManager } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { changeAppLanguage, i18n, initI18n, translateSync } from "./i18n";
import { LanguageSwitchScreen } from "./LanguageSwitchScreen";
import { LANGUAGE_SWITCH_MIN_HOLD_MS, waitMs } from "./languageSwitchMessages";
import { reloadAppAfterLanguageChange } from "./reloadApp";
import { assertLocalesInDev } from "./validateLocales";
import {
  isLang,
  LANG_NATIVE_LABELS,
  LANG_STORAGE_KEY,
  LEGACY_LANG_STORAGE_KEY,
  SUPPORTED_LANGS,
  type Lang,
} from "./types";

export type { Lang };
export { SUPPORTED_LANGS, LANG_NATIVE_LABELS };

/** @deprecated All bundles load at init. Kept for backward compatibility. */
export async function ensureHiDictionary(): Promise<void> {
  await initI18n();
}

export function translate(
  lang: Lang,
  key: string,
  vars?: Record<string, string | number>
): string {
  return translateSync(lang, key, vars);
}

interface I18nApi {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  ready: boolean;
  switching: boolean;
}

const I18nContext = createContext<I18nApi | null>(null);

async function readStoredLang(): Promise<Lang> {
  try {
    const current = await AsyncStorage.getItem(LANG_STORAGE_KEY);
    if (isLang(current)) return current;
    const legacy = await AsyncStorage.getItem(LEGACY_LANG_STORAGE_KEY);
    if (legacy === "hi") return "hi";
  } catch {
    // Corrupt storage — default to English.
  }
  return "en";
}

async function persistLang(lang: Lang): Promise<void> {
  try {
    await AsyncStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // Non-fatal — preference resets on next boot.
  }
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const [ready, setReady] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchingToLang, setSwitchingToLang] = useState<Lang | null>(null);
  const [revision, setRevision] = useState(0);
  const [mountKey, setMountKey] = useState(0);
  const switchInFlightRef = useRef(false);

  useEffect(() => {
    assertLocalesInDev();
  }, []);

  useEffect(() => {
    const bump = () => setRevision((n) => n + 1);
    i18n.on("languageChanged", bump);
    i18n.on("loaded", bump);
    return () => {
      i18n.off("languageChanged", bump);
      i18n.off("loaded", bump);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await readStoredLang();
        await initI18n(stored);
        if (cancelled) return;
        if (stored !== "en") {
          await changeAppLanguage(stored);
        }
        if (cancelled) return;
        setLangState(isLang(i18n.language) ? i18n.language : stored);
      } catch (e) {
        if (__DEV__) console.warn("[i18n] init failed", e);
        await initI18n("en");
        if (!cancelled) setLangState("en");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const completeLanguageSwitch = useCallback(
    async (next: Lang, paintedAtMs: number) => {
      if (switchInFlightRef.current) return;
      switchInFlightRef.current = true;
      try {
        await persistLang(next);
        await changeAppLanguage(next);
        setLangState(next);
        setRevision((n) => n + 1);
        setMountKey((k) => k + 1);

        await new Promise<void>((resolve) => {
          InteractionManager.runAfterInteractions(() => resolve());
        });

        const elapsed = Date.now() - paintedAtMs;
        const holdRemaining = Math.max(0, LANGUAGE_SWITCH_MIN_HOLD_MS - elapsed);
        if (holdRemaining > 0) await waitMs(holdRemaining);

        const reloaded = await reloadAppAfterLanguageChange();
        if (reloaded) return;

        setSwitchingToLang(null);
      } catch (e) {
        if (__DEV__) console.warn("[i18n] language switch failed", e);
        setSwitchingToLang(null);
      } finally {
        setSwitching(false);
        switchInFlightRef.current = false;
      }
    },
    []
  );

  const handleBufferPainted = useCallback(
    (paintedAtMs: number) => {
      const next = switchingToLang;
      if (!next) return;
      void completeLanguageSwitch(next, paintedAtMs);
    },
    [switchingToLang, completeLanguageSwitch]
  );

  const setLang = useCallback(
    (next: Lang) => {
      if (!isLang(next) || next === lang || switchingToLang !== null) return;
      setSwitching(true);
      setSwitchingToLang(next);
    },
    [lang, switchingToLang]
  );

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const out = translateSync(lang, key, vars);
      if (out && out !== key) return out;
      const fallback = translateSync("en", key, vars);
      if (fallback && fallback !== key) return fallback;
      if (__DEV__) console.warn(`[i18n] missing key: ${key}`);
      return key;
    },
    [lang, revision]
  );

  const api = useMemo<I18nApi>(
    () => ({ lang, setLang, t, ready, switching }),
    [lang, setLang, t, ready, switching]
  );

  return (
    <I18nContext.Provider value={api}>
      {switchingToLang ? (
        <LanguageSwitchScreen
          targetLang={switchingToLang}
          onPainted={handleBufferPainted}
        />
      ) : ready ? (
        <React.Fragment key={`i18n-${mountKey}`}>{children}</React.Fragment>
      ) : null}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nApi {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}

/** Convenience: returns just the translator function. */
export function useT() {
  return useI18n().t;
}
