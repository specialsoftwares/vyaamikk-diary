import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";

/**
 * Recovery guard for busy flags that can be stranded by the iOS share-sheet
 * promise hang class: `await pdfService.share(...)` / `Share.share(...)` may
 * never settle after the sheet is dismissed, so a `finally` cleanup never
 * runs and the screen's actions stay disabled.
 *
 * Pattern proven in ComposerSaveSuccess: when the screen regains focus or the
 * app returns to the foreground while an operation is marked pending, reset
 * the busy state.
 *
 * Usage:
 *   const shareRecovery = useStuckBusyRecovery(
 *     useCallback(() => setBusy(false), [])
 *   );
 *   ...
 *   setBusy(true);
 *   shareRecovery.markPending();
 *   try { ... await share ... } finally {
 *     shareRecovery.clearPending();
 *     setBusy(false);
 *   }
 */
export function useStuckBusyRecovery(reset: () => void): {
  markPending: () => void;
  clearPending: () => void;
} {
  const pendingRef = useRef(false);
  const resetRef = useRef(reset);
  resetRef.current = reset;

  const recover = useCallback(() => {
    if (!pendingRef.current) return;
    pendingRef.current = false;
    resetRef.current();
  }, []);

  useFocusEffect(
    useCallback(() => {
      recover();
      return undefined;
    }, [recover])
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") recover();
    });
    return () => sub.remove();
  }, [recover]);

  return {
    markPending: useCallback(() => {
      pendingRef.current = true;
    }, []),
    clearPending: useCallback(() => {
      pendingRef.current = false;
    }, []),
  };
}
