/**
 * Safe reporting for RootErrorBoundary. Extracted so tests can exercise the
 * production reporting path without mounting React Native UI.
 */
import { recordError } from "@/services/telemetry/crashReporter";
import { createLogger } from "@/utils/logger";
import type { StartupErrorCode, StartupStage } from "./types";

const log = createLogger("startup/errorBoundary");

export const UNCAUGHT_RENDER_SUMMARY = "Uncaught render error";

export function uncaughtRenderDiagnosticInput(): {
  failedStage: StartupStage;
  errorCode: StartupErrorCode;
  message: string;
  checkpoints: StartupStage[];
} {
  return {
    failedStage: "ROUTER_READY",
    errorCode: "UNCAUGHT_JS_ERROR",
    message: UNCAUGHT_RENDER_SUMMARY,
    checkpoints: ["BOOT", "ROUTER_READY"],
  };
}

export function reportUncaughtRenderError(error: Error): void {
  try {
    log.error("uncaught render error", {
      code: "UNCAUGHT_JS_ERROR",
      stage: "ROUTER_READY",
    });
    recordError(error, "ErrorBoundary");
  } catch {
    // Diagnostic failure must not replace the original render error
    // or prevent the failure screen / Retry.
  }
}
