/**
 * Production / runtime guards that return structured results instead of
 * killing the Android process at module import time.
 */

import {
  env,
  getActiveBackend,
  getEnvModuleError,
  getResolvedEnvironment,
  isFirebaseConfigured,
} from "@/config/env";
import { findLegalConfigBlockers } from "@/config/legal";
import {
  assertRuntimeBackendIsolation,
  type ResolvedEnvironment,
} from "@/config/runtimeEnvironment";
import { StartupError } from "./errors";
import type { StartupErrorCode, StartupStage } from "./types";

export type GuardResult =
  | { ok: true }
  | { ok: false; code: StartupErrorCode; stage: StartupStage; message: string };

export function evaluateRuntimeBackendIsolation(
  resolved: ResolvedEnvironment = getResolvedEnvironment()
): GuardResult {
  const moduleError = getEnvModuleError();
  if (moduleError) {
    return {
      ok: false,
      code: "ENV_RESOLUTION_FAILED",
      stage: "CONFIG_LOADED",
      message: moduleError.message,
    };
  }
  try {
    assertRuntimeBackendIsolation(resolved);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      code: "RUNTIME_ISOLATION_FAILED",
      stage: "RUNTIME_RESOLVED",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Fail-closed for production security, but as a GuardResult — never as an
 * uncaught module-scope throw that terminates the Android process.
 */
export function evaluateProductionConfig(): GuardResult {
  const isolation = evaluateRuntimeBackendIsolation();
  if (!isolation.ok) return isolation;

  if (!env.isProduction) return { ok: true };

  if (!isFirebaseConfigured()) {
    return {
      ok: false,
      code: "FIREBASE_JS_MISSING",
      stage: "CONFIG_LOADED",
      message:
        "Production build requires EXPO_PUBLIC_FIREBASE_* configuration. Refusing insecure start.",
    };
  }

  const backend = getActiveBackend();
  if (backend === "local-mock" || backend === "firebase-shared-dev") {
    return {
      ok: false,
      code: "LOCAL_MOCK_FORBIDDEN",
      stage: "RUNTIME_RESOLVED",
      message: `Production build cannot use backend "${backend}".`,
    };
  }
  if (backend !== "firebase-production") {
    return {
      ok: false,
      code: "PRODUCTION_CONFIG_INVALID",
      stage: "RUNTIME_RESOLVED",
      message: `Production build cannot use backend "${backend}". Use firebase-production only.`,
    };
  }

  const urlBlockers = findLegalConfigBlockers().filter(
    (b) =>
      b.includes("example.com") ||
      b.includes(".example") ||
      b.includes("support email") ||
      b.includes("privacy:") ||
      b.includes("terms:") ||
      b.includes("accountDeletion:") ||
      b.includes("download:") ||
      b.includes("forbidden") ||
      b.includes("/auth")
  );
  if (urlBlockers.length > 0) {
    return {
      ok: false,
      code: "PRODUCTION_CONFIG_INVALID",
      stage: "CONFIG_LOADED",
      message: `Production build has incomplete or unsafe public/legal links (${urlBlockers.length} blocker(s)).`,
    };
  }

  if (
    process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN ||
    process.env.FIREBASE_APP_CHECK_DEBUG_TOKEN
  ) {
    return {
      ok: false,
      code: "PRODUCTION_CONFIG_INVALID",
      stage: "CONFIG_LOADED",
      message: "Production build forbids Firebase App Check debug tokens.",
    };
  }

  return { ok: true };
}

/** @deprecated Prefer evaluateProductionConfig + StartupError boundary. */
export function assertProductionConfig(): void {
  const result = evaluateProductionConfig();
  if (!result.ok) {
    throw new StartupError(result.code, result.stage, result.message);
  }
}
