/**
 * i18n compatibility layer — react-i18next under the hood.
 *
 * Existing screens import `useI18n`, `useT`, and `translate` unchanged.
 * UI language is persisted under `vyd_language_v1` (legacy `vyd_lang_v1` read).
 *
 * Language switching runs through ONE deterministic transition controller
 * (`languageTransitionController.ts`): every selector calls `setLang`, which
 * rejects duplicates while a transition is in flight, loads the target locale
 * bundle + script font BEFORE committing, applies the language, persists only
 * after success, and always tears the transition overlay down (success,
 * failure, timeout, unmount). No DevSettings.reload and no full-tree remount
 * of Auth/LocalDb/Sync — LocaleFontProvider + i18n revision refresh the UI.
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
import { AccessibilityInfo, AppState, InteractionManager } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { changeAppLanguage, ensureLocaleBundle, i18n, initI18n, translateSync } from "./i18n";
import { LanguageTransitionOverlay } from "./LanguageTransitionOverlay";
import { LANGUAGE_OVERLAY_UNMOUNT_FAILSAFE_MS } from "./languageOverlayTouchPolicy";
import {
  createLanguageTransitionController,
  type LanguageTransitionController,
  type LanguageTransitionPhase,
} from "./languageTransitionController";
import { ensureScriptFontLoaded } from "./localeFonts";
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

/** @deprecated Bundles now load lazily per language. Kept for backward compatibility. */
export async function ensureHiDictionary(): Promise<void> {
  await ensureLocaleBundle("hi");
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
  const [transitionPhase, setTransitionPhase] = useState<LanguageTransitionPhase>("idle");
  const [overlayLang, setOverlayLang] = useState<Lang | null>(null);
  const [revision, setRevision] = useState(0);
  const reduceMotionRef = useRef(false);
  const pendingInstantRef = useRef(false);
  const overlayShownResolveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    assertLocalesInDev();
  }, []);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      reduceMotionRef.current = v;
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => {
      reduceMotionRef.current = v;
    });
    return () => sub.remove();
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
        await initI18n("en");
        if (stored !== "en") {
          // Load the active language's resources (locale bundle + script
          // font) before first paint — font failure falls back to system.
          await ensureScriptFontLoaded(stored);
          if (cancelled) return;
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

  const controllerRef = useRef<LanguageTransitionController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createLanguageTransitionController({
      applyLanguage: async (next) => {
        // Resources first: locale bundle failure aborts the switch (throws);
        // font failure is non-fatal (system font renders the script).
        await ensureLocaleBundle(next);
        await ensureScriptFontLoaded(next);
        await changeAppLanguage(next);
        setLangState(next);
        setRevision((n) => n + 1);
      },
      persistLanguage: async (next) => {
        // Bound persist so a hung AsyncStorage write cannot leave the
        // transition (and overlay) stuck in "switching" forever.
        await Promise.race([
          persistLang(next),
          new Promise<void>((resolve) => setTimeout(resolve, 1500)),
        ]);
      },
      settle: async () => {
        // Intentionally NO full-tree remount key. Remounting children of
        // I18nProvider would recreate LocalDbProvider / AuthProvider /
        // SubscriptionProvider / SyncProvider (design forbids this) and can
        // leave navigation and touches wedged after a language switch.
        // LocaleFontProvider + the revision bump above already refresh
        // script fonts and `t()`.
        await new Promise<void>((resolve) => {
          InteractionManager.runAfterInteractions(() => resolve());
        });
      },
      waitForOverlayIn: () =>
        new Promise<void>((resolve) => {
          overlayShownResolveRef.current = resolve;
        }),
      onPhaseChange: (phase, target) => {
        setTransitionPhase(phase);
        // Reduce Motion: no overlay — the language applies instantly.
        if (phase === "preparing" && target && !pendingInstantRef.current) {
          setOverlayLang(target);
        }
        // Overlay unmount is driven by handleOverlayHidden after fade-out;
        // pointer events are already released when `active` flips false.
      },
    });
  }
  const controller = controllerRef.current;

  useEffect(() => {
    return () => controller.dispose();
  }, [controller]);

  const handleOverlayShown = useCallback(() => {
    overlayShownResolveRef.current?.();
    overlayShownResolveRef.current = null;
  }, []);

  const handleOverlayHidden = useCallback(() => {
    setOverlayLang(null);
  }, []);

  // Failsafe: controller is idle but overlay still mounted (dropped fade-out
  // callback). Force unmount so a full-screen layer cannot linger.
  useEffect(() => {
    if (transitionPhase !== "idle" || !overlayLang) return;
    const id = setTimeout(() => setOverlayLang(null), LANGUAGE_OVERLAY_UNMOUNT_FAILSAFE_MS);
    return () => clearTimeout(id);
  }, [transitionPhase, overlayLang]);

  // Resume recovery: if a transition somehow left the overlay mounted while
  // idle, clear it when the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      if (controller.getPhase() === "idle") {
        setOverlayLang(null);
        setTransitionPhase("idle");
      }
    });
    return () => sub.remove();
  }, [controller]);

  const langRef = useRef(lang);
  langRef.current = lang;

  const setLang = useCallback(
    (next: Lang) => {
      if (!isLang(next)) return;
      const instant = reduceMotionRef.current;
      pendingInstantRef.current = instant;
      void controller.request(next, langRef.current, { instant }).then((result) => {
        if (result.status === "applied" && instant) {
          AccessibilityInfo.announceForAccessibility(LANG_NATIVE_LABELS[next]);
        }
        if (result.status === "failed" && __DEV__) {
          console.warn(`[i18n] language switch to ${next} failed`);
        }
      });
    },
    [controller]
  );

  const switching = transitionPhase !== "idle";

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
      {ready ? children : null}
      {overlayLang ? (
        <LanguageTransitionOverlay
          targetLang={overlayLang}
          active={switching}
          onShown={handleOverlayShown}
          onHidden={handleOverlayHidden}
        />
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
