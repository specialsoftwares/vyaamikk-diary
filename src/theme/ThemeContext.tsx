/**
 * Theme context — light/dark/system, persisted.
 *
 * Usage:
 *   const styles = useThemedStyles((colors) => StyleSheet.create({...}));
 *   const colors = useThemeColors();
 *   const { mode, setMode, resolvedMode } = useTheme();
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Appearance, useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useLocaleFontRevision } from "@/i18n/LocaleFontProvider";
import { darkColors, lightColors, type ColorScheme } from "./palettes";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedThemeMode = "light" | "dark";

/** Persisted appearance preference (`system` | `light` | `dark`). */
export const APPEARANCE_STORAGE_KEY = "vyd_theme_mode_v1";
const STORAGE_KEY = APPEARANCE_STORAGE_KEY;

interface ThemeApi {
  /** What the user picked (system / light / dark). */
  mode: ThemeMode;
  /** What's actually applied right now (light / dark). */
  resolvedMode: ResolvedThemeMode;
  /** Active color palette. */
  colors: ColorScheme;
  /** True while we restore the persisted mode on boot. */
  ready: boolean;
  /** Update the preferred mode and persist it. */
  setMode: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeApi | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  // RN's reactive hook is the single source of truth for the OS theme; it
  // re-renders on OS changes and foreground returns across iOS/Android.
  const hookScheme = useColorScheme();
  const [appearanceScheme, setAppearanceScheme] = useState<"light" | "dark" | null>(
    hookScheme ?? null
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAppearanceScheme(hookScheme ?? null);
  }, [hookScheme]);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setAppearanceScheme(colorScheme ?? null);
    });
    return () => sub.remove();
  }, []);

  // Restore persisted mode on boot.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && (raw === "system" || raw === "light" || raw === "dark")) {
          setModeState(raw);
        }
      } catch {
        // Fall back to system; persistence is best-effort.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const systemScheme = appearanceScheme ?? hookScheme;

  const resolvedMode: ResolvedThemeMode = useMemo(() => {
    if (mode === "system") return systemScheme === "dark" ? "dark" : "light";
    return mode;
  }, [mode, systemScheme]);

  const colors = useMemo<ColorScheme>(
    () => (resolvedMode === "dark" ? darkColors : lightColors),
    [resolvedMode]
  );

  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal — preference resets on next boot.
    }
  }, []);

  const api = useMemo<ThemeApi>(
    () => ({ mode, resolvedMode, colors, ready, setMode }),
    [mode, resolvedMode, colors, ready, setMode]
  );

  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}

/** Alias for product/docs naming. */
export const useAppTheme = useTheme;

export function useThemeColors(): ColorScheme {
  return useTheme().colors;
}

/**
 * Convenience for the common pattern:
 *   const styles = useThemedStyles((colors) => StyleSheet.create({...}));
 *
 * The factory receives the *current* palette; the resulting StyleSheet is
 * re-created (cheaply) whenever the palette changes, so light/dark flips
 * propagate without manual subscriptions.
 */
export function useThemedStyles<T>(factory: (colors: ColorScheme) => T): T {
  const colors = useThemeColors();
  const localeFontRevision = useLocaleFontRevision();
  return useMemo(() => factory(colors), [colors, factory, localeFontRevision]);
}
