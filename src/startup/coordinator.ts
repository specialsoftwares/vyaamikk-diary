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
 * Fail-closed startup. Failures become StartupOutcome.ok=false — they must
 * never escape as unhandled throws that kill the Android process.
 *
 * Critical path (must finish before routing): production config, native
 * Firebase probe, JS Firebase init, local DB open/migrate. Auth restore
 * continues under the native splash after this returns and providers mount.
 *
 * Independent JS Firebase init and SQLite open run concurrently. PIN database
 * warm, PDF generation, dashboard statistics, and analytics must not run here.
 *
 * Heavy native modules (Firebase JS, SQLite) are loaded via dynamic import so
 * Node unit tests can exercise config guards without loading react-native.
 */
export async function runStartupCoordinator(options?: {
  /** Test hook: skip native DB/Firebase side effects. */
  skipNativeSideEffects?: boolean;
  /**
   * Test seam: App Check layer used after JS Firebase is ready.
   * Production always uses initializeAppCheckLayer (bounded init, detached probes).
   */
  initializeAppCheckLayerForTests?: (input: {
    isProduction: boolean;
    getJsApp?: () => unknown;
  }) => Promise<unknown>;
}): Promise<StartupOutcome> {
  const checkpoints: StartupStage[] = [];
  const skipNative = options?.skipNativeSideEffects === true;
  checkpoint(checkpoints, "BOOT");

  try {
    const providers = decideRootDataProviders();
    if (
      !providers.mountLocalDb ||
      !providers.mountAuth ||
      !providers.mountSubscription ||
      !providers.mountSync ||
      !providers.mountAppFeedback
    ) {
      throw new StartupError(
        "PROVIDER_TREE_INVALID",
        "BOOT",
        "Root LocalDb/Auth/Subscription/Sync/AppFeedback providers must always mount."
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

    // JS Firebase and local SQLite are independent. Start both during the
    // native splash instead of waiting for one before the other. Do not
    // block this path on PIN warm, PDFs, dashboard stats, or analytics.
    const jsFirebaseTask = (async (): Promise<boolean> => {
      const runAppCheckTestSeam = async (): Promise<void> => {
        if (!options?.initializeAppCheckLayerForTests) return;
        try {
          await options.initializeAppCheckLayerForTests({
            isProduction: env.isProduction,
          });
        } catch {
          // Unenforced diagnostic seam.
        }
      };

      if (isFirebaseConfigured()) {
        if (!skipNative) {
          try {
            const { getFirebaseApp } = await import("@/config/firebase");
            const { getApps } = await import("firebase/app");
            const app = getFirebaseApp();
            const ready = Boolean(app) || getApps().length > 0;
            if (ready) {
              try {
                const initLayer =
                  options?.initializeAppCheckLayerForTests ??
                  (await import("@/services/appCheck/bootstrap")).initializeAppCheckLayer;
                await initLayer({
                  isProduction: env.isProduction,
                  getJsApp: () => app,
                });
              } catch {
                // Unenforced. Do not fail JS Firebase init on App Check.
              }
            }
            if (ready && env.firebase.projectId.length === 0) {
              throw new StartupError(
                "FIREBASE_PROJECT_MISMATCH",
                "JS_FIREBASE_READY",
                "JS Firebase project id is empty after configuration check."
              );
            }
            return ready;
          } catch (e) {
            throw toStartupError(e, "FIREBASE_JS_INIT_FAILED", "JS_FIREBASE_READY");
          }
        }
        await runAppCheckTestSeam();
        return true;
      }
      await runAppCheckTestSeam();
      if (env.isProduction) {
        throw new StartupError(
          "FIREBASE_JS_MISSING",
          "JS_FIREBASE_READY",
          "JS Firebase public config markers are missing from the release bundle."
        );
      }
      return false;
    })();

    const localDbTask = (async (): Promise<void> => {
      if (!skipNative) {
        try {
          const { initializeLocalDatabase } = await import("@/localDb/init");
          await initializeLocalDatabase();
        } catch (e) {
          throw toStartupError(e, "LOCAL_DB_MIGRATE_FAILED", "LOCAL_DB_OPENED");
        }
      }
    })();

    const [jsReady] = await Promise.all([jsFirebaseTask, localDbTask]);
    checkpoint(checkpoints, "JS_FIREBASE_READY");
    checkpoint(checkpoints, "LOCAL_DB_OPENED");
    checkpoint(checkpoints, "LOCAL_DB_MIGRATED");

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
