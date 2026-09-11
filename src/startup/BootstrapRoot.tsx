import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";

import { runStartupCoordinator } from "./coordinator";
import { installGlobalStartupHandlers, setStartupFailureListener } from "./globalHandlers";
import { StartupFailureScreen } from "./StartupFailureScreen";
import { RootErrorBoundary } from "./RootErrorBoundary";
import type { StartupDiagnostics } from "./types";
import { BRAND_SURFACE } from "@/config/brandMotion";

installGlobalStartupHandlers();

type Phase =
  | { kind: "loading" }
  | { kind: "failed"; diagnostics: StartupDiagnostics }
  | { kind: "ready"; token: number };

async function hideSplash(): Promise<void> {
  try {
    await SplashScreen.hideAsync();
  } catch {
    // best-effort
  }
}

/**
 * Runs the startup coordinator before mounting the real provider tree.
 * Keep the native splash up on success so BootScreen can hide it at route time.
 * Hide on controlled failure so StartupFailureScreen is visible.
 */
export function BootstrapRoot({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  const run = useCallback(() => {
    setPhase({ kind: "loading" });
    let cancelled = false;
    void (async () => {
      const outcome = await runStartupCoordinator();
      if (cancelled) return;
      if (!outcome.ok) {
        await hideSplash();
        setPhase({ kind: "failed", diagnostics: outcome.diagnostics });
        return;
      }
      setPhase({ kind: "ready", token: Date.now() });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cancel = run();
    setStartupFailureListener((diagnostics) => {
      void hideSplash();
      setPhase({ kind: "failed", diagnostics });
    });
    return () => {
      cancel();
      setStartupFailureListener(null);
    };
  }, [run]);

  if (phase.kind === "loading") {
    return <View style={styles.boot} />;
  }

  if (phase.kind === "failed") {
    return (
      <StartupFailureScreen
        diagnostics={phase.diagnostics}
        onRetry={() => run()}
      />
    );
  }

  return (
    <RootErrorBoundary key={phase.token} onRetry={() => run()}>
      {children}
    </RootErrorBoundary>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: BRAND_SURFACE,
  },
});
