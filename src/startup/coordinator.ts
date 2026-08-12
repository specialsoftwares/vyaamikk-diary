import { env, getActiveBackend, isFirebaseConfigured } from "@/config/env";
import { decideRootDataProviders } from "@/config/rootDataProviders";
import { buildDiagnostics, probeNativeFirebaseDefaultApp } from "./diagnostics";
import { StartupError, toStartupError } from "./errors";
import { evaluateProductionConfig } from "./guards";
import type { StartupOutcome, StartupStage } from "./types";

function checkpoint(list: StartupStage[], stage: StartupStage): void {
  if (!list.includes(stage)) list.push(stage);
}

/**
 * Sequential, try/catch startup. Failures become StartupOutcome.ok=false —
 * they must never escape as unhandled throws that kill the Android process.
 *
 * Heavy native modules (Firebase JS, SQLite) are loaded via dynamic import so
 * Node unit tests can exercise config guards without loading react-native.
 */
export async function runStartupCoordinator(options?: {
  /** Test hook: skip native DB/Firebase side effects. */
  skipNativeSideEffects?: boolean;
}): Promise<StartupOutcome> {
  const checkpoints: StartupStage[] = [];
  const skipNative = options?.skipNativeSideEffects === true;
  checkpoint(checkpoints, "BOOT");

  try {
    const providers = decideRootDataProviders();
    if (
      !providers.mountLocalDb ||
      !providers.mountAuth ||
      !providers.mountSync ||
      !providers.mountAppFeedback
    ) {
      throw new StartupError(
        "PROVIDER_TREE_INVALID",
        "BOOT",
        "Root LocalDb/Auth/Sync/AppFeedback providers must always mount."
      );
    }

    const configGuard = evaluateProductionConfig();
    if (!configGuard.ok) {
      throw new StartupError(configGuard.code, configGuard.stage, configGuard.message);
    }
    checkpoint(checkpoints, "CONFIG_LOADED");
    checkpoint(checkpoints, "RUNTIME_RESOLVED");

    if (env.isProduction && getActiveBackend() !== "firebase-production") {
      throw new StartupError(
        "LOCAL_MOCK_FORBIDDEN",
        "RUNTIME_RESOLVED",
        `Preview/production cannot use backend "${getActiveBackend()}".`
      );
    }

    const nativeApp = skipNative ? ("unknown" as const) : probeNativeFirebaseDefaultApp();
    if (env.isProduction && nativeApp === false) {
      throw new StartupError(
        "FIREBASE_NATIVE_MISSING",
        "NATIVE_FIREBASE_READY",
        "Native Firebase default app is missing (google-services not applied)."
      );
    }
    checkpoint(checkpoints, "NATIVE_FIREBASE_READY");

    let jsReady = false;
    if (isFirebaseConfigured()) {
      if (!skipNative) {
        try {
          const { getFirebaseApp } = await import("@/config/firebase");
          const { getApps } = await import("firebase/app");
          const app = getFirebaseApp();
          jsReady = Boolean(app) || getApps().length > 0;
          if (jsReady && env.firebase.projectId.length === 0) {
            throw new StartupError(
              "FIREBASE_PROJECT_MISMATCH",
              "JS_FIREBASE_READY",
              "JS Firebase project id is empty after configuration check."
            );
          }
        } catch (e) {
          throw toStartupError(e, "FIREBASE_JS_INIT_FAILED", "JS_FIREBASE_READY");
        }
      } else {
        jsReady = true;
      }
    } else if (env.isProduction) {
      throw new StartupError(
        "FIREBASE_JS_MISSING",
        "JS_FIREBASE_READY",
        "JS Firebase public config markers are missing from the release bundle."
      );
    }
    checkpoint(checkpoints, "JS_FIREBASE_READY");

    if (!skipNative) {
      try {
        const { initializeLocalDatabase } = await import("@/localDb/init");
        await initializeLocalDatabase();
        checkpoint(checkpoints, "LOCAL_DB_OPENED");
        checkpoint(checkpoints, "LOCAL_DB_MIGRATED");
      } catch (e) {
        throw toStartupError(e, "LOCAL_DB_MIGRATE_FAILED", "LOCAL_DB_OPENED");
      }
    } else {
      checkpoint(checkpoints, "LOCAL_DB_OPENED");
      checkpoint(checkpoints, "LOCAL_DB_MIGRATED");
    }

    checkpoint(checkpoints, "AUTH_HYDRATED");
    checkpoint(checkpoints, "SYNC_READY");
    checkpoint(checkpoints, "ROUTER_READY");

    return {
      ok: true,
      checkpoints,
      diagnostics: buildDiagnostics({
        failedStage: "ROUTER_READY",
        errorCode: "UNKNOWN",
        message: "ok",
        checkpoints,
        jsFirebaseInitialized: jsReady,
        nativeFirebaseDefaultApp: nativeApp,
        backend: getActiveBackend(),
      }),
    };
  } catch (e) {
    const err = toStartupError(e, "UNKNOWN", "BOOT");
    return {
      ok: false,
      diagnostics: buildDiagnostics({
        failedStage: err.stage,
        errorCode: err.code,
        message: err.message,
        checkpoints,
        backend: (() => {
          try {
            return getActiveBackend();
          } catch {
            return "unknown";
          }
        })(),
      }),
    };
  }
}
