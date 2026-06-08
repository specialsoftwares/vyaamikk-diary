import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

import {
  formDraftsRepository,
  type FormDraftKind,
} from "@/repositories/formDraftsRepository";
import { activeRouteRepository } from "@/repositories/activeRouteRepository";
import { createLogger } from "@/utils/logger";

const log = createLogger("useFormAutosave");

const DEFAULT_DEBOUNCE_MS = 650;

export interface UseFormAutosaveOptions {
  userId: string | undefined;
  draftKind: FormDraftKind;
  scopeKey: string;
  entryId?: string | null;
  values: Record<string, unknown>;
  enabled?: boolean;
  debounceMs?: number;
  /** When set, persist active route for boot restore (composer). */
  activeRoute?: { href: string; params?: Record<string, string> };
  /** When false, skip recovery write (e.g. empty form). */
  shouldPersist?: (values: Record<string, unknown>) => boolean;
}

export function useFormAutosave(options: UseFormAutosaveOptions): {
  flushNow: () => Promise<void>;
  clearDraft: () => Promise<void>;
} {
  const {
    userId,
    draftKind,
    scopeKey,
    entryId = null,
    values,
    enabled = true,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    activeRoute,
    shouldPersist,
  } = options;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSerializedRef = useRef<string>("");

  const persist = useCallback(async () => {
    if (!userId || !enabled) return;
    if (shouldPersist && !shouldPersist(values)) return;
    const serialized = JSON.stringify(values);
    if (serialized === lastSerializedRef.current) return;
    lastSerializedRef.current = serialized;

    try {
      await formDraftsRepository.saveRecovery({
        userId,
        draftKind,
        scopeKey,
        entryId,
        payload: values,
      });
      if (activeRoute) {
        await activeRouteRepository.set(userId, activeRoute.href, activeRoute.params);
      }
    } catch (e) {
      log.warn("autosave failed", e);
    }
  }, [userId, enabled, values, draftKind, scopeKey, entryId, activeRoute, shouldPersist]);

  const flushNow = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await persist();
  }, [persist]);

  const clearDraft = useCallback(async () => {
    if (!userId) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    lastSerializedRef.current = "";
    await formDraftsRepository.clearRecovery({ userId, draftKind, scopeKey, entryId });
    if (activeRoute) {
      await activeRouteRepository.clear(userId);
    }
  }, [userId, draftKind, scopeKey, entryId, activeRoute]);

  useEffect(() => {
    if (!userId || !enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void persist();
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [userId, enabled, values, debounceMs, persist]);

  useEffect(() => {
    if (!userId || !enabled) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") void flushNow();
    });
    return () => sub.remove();
  }, [userId, enabled, flushNow]);

  return { flushNow, clearDraft };
}
