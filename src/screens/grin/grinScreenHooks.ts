import React from "react";

import type { GrinDispatchSession } from "@/services/grin/outbox/types";
import { requireOriginGrinApplicationRepository } from "@/services/grin/repository";
import type { ColorScheme } from "@/theme/palettes";

type Translator = (key: string, vars?: Record<string, string | number>) => string;

type RouterApi = {
  back: () => void;
  push: (target: string | { pathname: string; params?: Record<string, string> }) => void;
  replace: (target: string | { pathname: string; params?: Record<string, string> }) => void;
};

export type GrinScreenRuntime = {
  useT: () => Translator;
  useThemedStyles: <T>(factory: (colors: ColorScheme) => T) => T;
  useRouter: () => RouterApi;
  useLocalSearchParams: <T extends Record<string, string | undefined>>() => T;
  useFocusEffect: (effect: () => void | (() => void)) => void;
  getPickerHostAppState: () => string;
};

let runtime: GrinScreenRuntime | null = null;

export function installGrinScreenRuntime(next: GrinScreenRuntime): void {
  runtime = next;
}

export function getGrinScreenRuntime(): GrinScreenRuntime {
  if (!runtime) throw new Error("grin_screen_runtime_unbound");
  return runtime;
}

export function useGrinT(): Translator {
  return getGrinScreenRuntime().useT();
}

export function useGrinThemedStyles<T>(factory: (colors: ColorScheme) => T): T {
  return getGrinScreenRuntime().useThemedStyles(factory);
}

export function useGrinRouter(): RouterApi {
  return getGrinScreenRuntime().useRouter();
}

export function useGrinLocalSearchParams<T extends Record<string, string | undefined>>(): T {
  return getGrinScreenRuntime().useLocalSearchParams<T>();
}

export function useGrinFocusEffect(effect: () => void | (() => void)): void {
  getGrinScreenRuntime().useFocusEffect(effect);
}

/** Freeze the admitted origin at body mount. Do not recapture live. */
export function useFrozenGrinOrigin(session: GrinDispatchSession): GrinDispatchSession {
  const ref = React.useRef(session);
  return ref.current;
}

export function originRepo(origin: GrinDispatchSession) {
  return requireOriginGrinApplicationRepository(origin);
}
