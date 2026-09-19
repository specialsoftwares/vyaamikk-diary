/**
 * Dual-SDK App Check bootstrap. Failures are reported, not used to crash
 * startup, because backend enforcement is off. Production debug tokens are
 * forbidden. Native getToken is never copied into JS CustomProvider.
 *
 * Startup awaits bounded provider initialize only. Optional token probes run
 * detached and cannot replace a newer attempt's report.
 */

import { evaluateNativeToJsCustomProvider } from "./customProviderBridge";
import { initializeJsAppCheck } from "./jsAppCheck";
import {
  initializeNativeAppCheck,
  probeNativeAppCheckTokens,
  type AppCheckClock,
  type NativeAppCheckPort,
} from "./nativeAppCheck";
import {
  APP_CHECK_CUSTOM_PROVIDER_BRIDGE_FAILURE,
  setLastAppCheckInitReport,
  type AppCheckInitReport,
} from "./appCheckTypes";

function debugTokenPresent(): boolean {
  return Boolean(
    process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN ||
      process.env.FIREBASE_APP_CHECK_DEBUG_TOKEN
  );
}

let appCheckAttempt = 0;
const diagnosticByAttempt = new Map<number, Promise<AppCheckInitReport>>();

export function __resetAppCheckAttemptsForTests(): void {
  appCheckAttempt = 0;
  diagnosticByAttempt.clear();
  setLastAppCheckInitReport(null);
}

export function getAppCheckDiagnosticPromise(attempt?: number): Promise<AppCheckInitReport> | null {
  if (attempt != null) return diagnosticByAttempt.get(attempt) ?? null;
  return diagnosticByAttempt.get(appCheckAttempt) ?? null;
}

function publishIfCurrent(attempt: number, report: AppCheckInitReport): void {
  if (attempt !== appCheckAttempt) return;
  setLastAppCheckInitReport(report);
}

export async function initializeAppCheckLayer(input: {
  isProduction: boolean;
  getJsApp?: () => unknown;
  nativePort?: NativeAppCheckPort;
  importJsSdk?: Parameters<typeof initializeJsAppCheck>[0]["importSdk"];
  clock?: AppCheckClock;
  initBudgetMs?: number;
  /** Test-only: also wait for the detached getToken(false) diagnostic. */
  awaitDiagnosticProbe?: boolean;
}): Promise<AppCheckInitReport> {
  const attempt = ++appCheckAttempt;
  const debug = debugTokenPresent();
  const productionDebugTokenForbidden = input.isProduction && debug;
  const native = productionDebugTokenForbidden
    ? { status: "failed" as const, provider: "debug" as const, tokenObtained: false, appId: null }
    : await initializeNativeAppCheck({
        isProduction: input.isProduction,
        debugTokenPresent: debug,
        port: input.nativePort,
        clock: input.clock,
        initBudgetMs: input.initBudgetMs,
      });
  const js = input.getJsApp
    ? await initializeJsAppCheck({
        isProduction: input.isProduction,
        getApp: input.getJsApp,
        importSdk: input.importJsSdk,
      })
    : {
        status: "not_attempted" as const,
        provider: "none" as const,
        customProviderBridgeAccepted: false as const,
        bridgeFailure: APP_CHECK_CUSTOM_PROVIDER_BRIDGE_FAILURE,
        sdkModulePresent: false,
        customProviderApiPresent: false,
        initializeAppCheckApiPresent: false,
        recaptchaProviderPresent: false,
        jsAppId: null,
        initializeAppCheckCalled: false as const,
      };
  const bridge = evaluateNativeToJsCustomProvider({
    nativeTokenPresent: native.tokenObtained,
    jsAppId: js.jsAppId,
    nativeAppId: native.appId,
  });
  const report: AppCheckInitReport = {
    native: native.status,
    js: js.status,
    nativeProvider: native.provider,
    jsProvider: js.provider,
    debugTokenConfigured: debug,
    productionDebugTokenForbidden,
    customProviderBridgeAccepted: false,
    bridgeFailure: bridge.failure,
    nativeTokenObtained: native.tokenObtained,
    jsAppId: js.jsAppId,
    nativeAppId: native.appId,
    jsCustomProviderApiPresent: js.customProviderApiPresent,
    jsInitializeApiPresent: js.initializeAppCheckApiPresent,
    initializeAppCheckCalledOnJs: false,
  };
  publishIfCurrent(attempt, report);

  const diagnostic = (async () => {
    if (productionDebugTokenForbidden || typeof native.probe !== "function") {
      return report;
    }
    if (native.status !== "initialized") return report;
    try {
      const probed = await native.probe(false);
      const next: AppCheckInitReport = {
        ...report,
        nativeTokenObtained: probed.tokenObtained,
        bridgeFailure: evaluateNativeToJsCustomProvider({
          nativeTokenPresent: probed.tokenObtained,
          jsAppId: js.jsAppId,
          nativeAppId: native.appId,
        }).failure,
      };
      publishIfCurrent(attempt, next);
      return next;
    } catch {
      return report;
    }
  })();
  diagnosticByAttempt.set(attempt, diagnostic);
  void diagnostic.catch(() => undefined);

  if (input.awaitDiagnosticProbe) {
    return diagnostic;
  }
  return report;
}

/** Opt-in force-refresh after startup. Never called automatically on boot. */
export async function runAppCheckForceRefreshProbe(port: NativeAppCheckPort): Promise<void> {
  const attempt = appCheckAttempt;
  try {
    await probeNativeAppCheckTokens({ port, forceRefresh: true });
  } catch {
    // Unenforced diagnostic.
  }
  void attempt;
}
