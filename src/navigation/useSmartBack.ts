import { usePreventRemove } from "@react-navigation/core";
import { useCallback, useEffect } from "react";
import { BackHandler } from "react-native";
import { useNavigation, useRouter, type Href } from "expo-router";

import { useT } from "@/i18n";

import { confirmUnsavedChanges } from "./confirmUnsaved";
import {
  normalizeNavigationOrigin,
  resolveSmartBackFallback,
  type NavigationOrigin,
} from "./smartBack";

export interface UseSmartBackOptions {
  /** Query param or explicit origin when `router.canGoBack()` is false. */
  from?: NavigationOrigin | string | string[];
  fallback?: Href;
  /** Block pop and show discard dialog (also disables iOS swipe-back). */
  dirty?: boolean;
  /** Custom back handler (e.g. close success panel first). Runs before dirty/stack logic when set. */
  onBack?: () => void;
  onDiscard?: () => void;
  draftAvailable?: boolean;
  onSaveDraft?: () => void;
  /** Register Android hardware back (default true when dirty or onBack). */
  handleHardwareBack?: boolean;
  enabled?: boolean;
}

export function useSmartBack(options: UseSmartBackOptions = {}) {
  const router = useRouter();
  const navigation = useNavigation();
  const t = useT();
  const enabled = options.enabled !== false;

  const fallback = resolveSmartBackFallback(options.from, options.fallback);

  const performBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallback);
    }
  }, [router, fallback]);

  const goBack = useCallback(() => {
    if (!enabled) return;
    if (options.onBack) {
      options.onBack();
      return;
    }
    if (options.dirty) {
      confirmUnsavedChanges({
        t,
        onDiscard: () => {
          options.onDiscard?.();
          performBack();
        },
        draftAvailable: options.draftAvailable,
        onSaveDraft: options.onSaveDraft,
      });
      return;
    }
    performBack();
  }, [enabled, options, performBack, t]);

  useEffect(() => {
    if (!enabled) return;
    navigation.setOptions({ gestureEnabled: !options.dirty });
  }, [navigation, options.dirty, enabled]);

  const preventRemove = enabled && Boolean(options.dirty);
  usePreventRemove(preventRemove, ({ data }) => {
    confirmUnsavedChanges({
      t,
      onDiscard: () => navigation.dispatch(data.action),
      draftAvailable: options.draftAvailable,
      onSaveDraft: options.onSaveDraft,
    });
  });

  useEffect(() => {
    if (!enabled || options.handleHardwareBack === false) return;
    if (!options.dirty && !options.onBack) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [enabled, options.dirty, options.onBack, options.handleHardwareBack, goBack]);

  return { goBack, performBack, fallback };
}
