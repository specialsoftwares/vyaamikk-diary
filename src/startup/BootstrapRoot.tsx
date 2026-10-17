import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";

import { runStartupCoordinator } from "./coordinator";
import { buildDiagnostics } from "./diagnostics";
import { installGlobalStartupHandlers, setStartupFailureListener } from "./globalHandlers";
import { StartupFailureScreen } from "./StartupFailureScreen";
import { RootErrorBoundary } from "./RootErrorBoundary";
import {
  STARTUP_REVEAL_MS,
  startupResultMayPublish,
  startupRetryMayStart,
} from "./startupAttempt";
import type { StartupDiagnostics } from "./types";
import { BRAND_SURFACE } from "@/config/brandMotion";
import { createLogger } from "@/utils/logger";

const log = createLogger("startup/bootstrap");

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
  const attemptRef = useRef(0);
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(() => {
    if (!startupRetryMayStart(inFlightRef.current)) return;
    const attempt = ++attemptRef.current;
    inFlightRef.current = true;
    setPhase({ kind: "loading" });
    if (timerRef.current) clearTimeout(timerRef.current);
    // Reveal recovery if startup never settles. Do not cancel the in-flight
    // coordinator: a deadline is not a cancelled migration.
    timerRef.current = setTimeout(() => {
      if (!startupResultMayPublish(attempt, attemptRef.current)) return;
      log.warn("startup_deadline");
      void hideSplash();
      setPhase({
        kind: "failed",
        diagnostics: buildDiagnostics({
          failedStage: "BOOT",
          errorCode: "STARTUP_DEADLINE",
          message: "startup_deadline",
          checkpoints: ["BOOT"],
        }),
      });
    }, STARTUP_REVEAL_MS);
    void (async () => {
      const outcome = await runStartupCoordinator();
      if (!startupResultMayPublish(attempt, attemptRef.current)) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      inFlightRef.current = false;
      if (!outcome.ok) {
        await hideSplash();
        setPhase({ kind: "failed", diagnostics: outcome.diagnostics });
        return;
      }
      setPhase({ kind: "ready", token: Date.now() });
    })();
  }, []);

  useEffect(() => {
    run();
    setStartupFailureListener((diagnostics) => {
      void hideSplash();
      setPhase({ kind: "failed", diagnostics });
    });
    return () => {
      attemptRef.current += 1;
      inFlightRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
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
