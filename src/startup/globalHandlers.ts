import { createLogger } from "@/utils/logger";
import type { StartupDiagnostics } from "./types";
import { buildDiagnostics } from "./diagnostics";
import { redactStartupMessage } from "./errors";

const log = createLogger("startup/globalHandlers");

type FailureListener = (diagnostics: StartupDiagnostics) => void;

let listener: FailureListener | null = null;
let installed = false;

export function setStartupFailureListener(next: FailureListener | null): void {
  listener = next;
}

function emitUncaught(message: string, stage: "BOOT" = "BOOT"): void {
  const diagnostics = buildDiagnostics({
    failedStage: stage,
    errorCode: "UNCAUGHT_JS_ERROR",
    message: redactStartupMessage(message),
    checkpoints: ["BOOT"],
  });
  log.error("uncaught startup/runtime error", { code: diagnostics.errorCode });
  listener?.(diagnostics);
}

/**
 * Install once. Does not swallow errors — routes them to the bootstrap UI.
 */
export function installGlobalStartupHandlers(): void {
  if (installed) return;
  installed = true;

  try {
    const g = globalThis as {
      ErrorUtils?: {
        getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void;
        setGlobalHandler?: (
          handler: (error: Error, isFatal?: boolean) => void
        ) => void;
      };
      addEventListener?: (
        type: string,
        listener: (event: { reason?: unknown }) => void
      ) => void;
    };
    const ErrorUtils = g.ErrorUtils;
    if (ErrorUtils?.setGlobalHandler) {
      const previous = ErrorUtils.getGlobalHandler?.();
      ErrorUtils.setGlobalHandler((error, isFatal) => {
        emitUncaught(error?.message || String(error));
        if (typeof previous === "function") {
          try {
            previous(error, isFatal);
          } catch {
            // ignore nested handler failure
          }
        }
      });
    }
  } catch (e) {
    log.warn("ErrorUtils install failed", e);
  }

  try {
    const g = globalThis as {
      addEventListener?: (
        type: string,
        listener: (event: { reason?: unknown }) => void
      ) => void;
    };
    if (typeof g.addEventListener === "function") {
      g.addEventListener("unhandledrejection", (event) => {
        const reason = event?.reason;
        const message =
          reason instanceof Error ? reason.message : String(reason ?? "rejection");
        emitUncaught(message);
      });
    }
  } catch (e) {
    log.warn("unhandledrejection install failed", e);
  }
}
