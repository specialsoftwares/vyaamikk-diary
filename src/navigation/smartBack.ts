import type { Href } from "expo-router";

import { APPEARANCE_STORAGE_KEY } from "@/theme/ThemeContext";

export { APPEARANCE_STORAGE_KEY };

/** Where the user came from — used when the stack has no history to pop. */
export type NavigationOrigin =
  | "you"
  | "calendar"
  | "diary"
  | "map"
  | "letterhead"
  | "pro_pack"
  | "settings"
  | "composer";

const FALLBACK_ROUTES: Record<NavigationOrigin, Href> = {
  you: "/(app)/(tabs)/you",
  calendar: "/(app)/(tabs)/calendar",
  diary: "/(app)/diary",
  map: "/(app)/map",
  letterhead: "/(app)/letterhead",
  pro_pack: "/(app)/professional-pack/history",
  settings: "/(app)/(tabs)/settings",
  composer: "/(app)/(tabs)/you",
};

export function normalizeNavigationOrigin(
  raw: string | string[] | undefined
): NavigationOrigin | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return undefined;
  if (v in FALLBACK_ROUTES) return v as NavigationOrigin;
  return undefined;
}

export function resolveSmartBackFallback(
  origin?: NavigationOrigin | string | string[],
  explicitFallback?: Href
): Href {
  if (explicitFallback) return explicitFallback;
  const key = normalizeNavigationOrigin(
    typeof origin === "string" || Array.isArray(origin) ? origin : undefined
  );
  if (key) return FALLBACK_ROUTES[key];
  return FALLBACK_ROUTES.you;
}
