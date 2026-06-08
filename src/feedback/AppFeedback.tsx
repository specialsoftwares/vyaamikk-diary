import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Banner } from "@/components/ui";
import { spacing, typography, useThemedStyles } from "@/theme";

export type FeedbackTone = "success" | "warning" | "error" | "guidance";

export interface FeedbackMessage {
  id: string;
  tone: FeedbackTone;
  title?: string;
  message: string;
}

interface AppFeedbackContextValue {
  /** Transient banner (auto-dismiss). */
  show: (input: Omit<FeedbackMessage, "id"> & { durationMs?: number }) => void;
  showSuccess: (message: string, title?: string) => void;
  showWarning: (message: string, title?: string) => void;
  showError: (message: string, title?: string) => void;
  showGuidance: (message: string, title?: string) => void;
  clear: () => void;
}

const AppFeedbackContext = createContext<AppFeedbackContextValue | null>(null);

function toneToBanner(tone: FeedbackTone): "success" | "warning" | "danger" | "info" {
  switch (tone) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "error":
      return "danger";
    case "guidance":
    default:
      return "info";
  }
}

export function AppFeedbackProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<FeedbackMessage | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const styles = useThemedStyles((c) =>
    StyleSheet.create({
      host: { flex: 1 },
      overlay: {
        position: "absolute",
        left: spacing.lg,
        right: spacing.lg,
        zIndex: 100,
      },
      guidance: {
        borderRadius: 12,
        padding: spacing.md,
        backgroundColor: c.surfaceMuted,
        borderWidth: 1,
        borderColor: c.divider,
        gap: spacing.xs,
      },
      guidanceTitle: { ...typography.captionStrong, color: c.text },
      guidanceBody: { ...typography.caption, color: c.textMuted },
    })
  );
  const overlayTop = insets.top + spacing.sm;

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setActive(null);
  }, []);

  const show = useCallback(
    (input: Omit<FeedbackMessage, "id"> & { durationMs?: number }) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const id = String(Date.now());
      setActive({ id, tone: input.tone, title: input.title, message: input.message });
      const ms = input.durationMs ?? 4500;
      timerRef.current = setTimeout(() => setActive(null), ms);
    },
    []
  );

  const value = useMemo<AppFeedbackContextValue>(
    () => ({
      show,
      showSuccess: (message, title) => show({ tone: "success", message, title }),
      showWarning: (message, title) => show({ tone: "warning", message, title }),
      showError: (message, title) => show({ tone: "error", message, title }),
      showGuidance: (message, title) => show({ tone: "guidance", message, title, durationMs: 6000 }),
      clear,
    }),
    [show, clear]
  );

  return (
    <AppFeedbackContext.Provider value={value}>
      <View style={styles.host}>
        {children}
        {active ? (
          <View style={[styles.overlay, { top: overlayTop }]} pointerEvents="none">
            {active.tone === "guidance" ? (
              <View style={styles.guidance}>
                {active.title ? <Text style={styles.guidanceTitle}>{active.title}</Text> : null}
                <Text style={styles.guidanceBody}>{active.message}</Text>
              </View>
            ) : (
              <Banner
                tone={toneToBanner(active.tone)}
                title={active.title}
                message={active.message}
              />
            )}
          </View>
        ) : null}
      </View>
    </AppFeedbackContext.Provider>
  );
}

export function useAppFeedback(): AppFeedbackContextValue {
  const ctx = useContext(AppFeedbackContext);
  if (!ctx) {
    throw new Error("useAppFeedback must be used within AppFeedbackProvider");
  }
  return ctx;
}
