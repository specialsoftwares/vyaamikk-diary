/**
 * Runtime-aware environment resolution.
 *
 * Bundled EXPO_PUBLIC_* values come from Metro / EAS at bundle time. This module
 * maps them to an effective app mode and backend based on the actual runtime
 * (Expo Go vs development client vs store build) so a local `.env` with
 * APP_MODE=development cannot silently serve local-mock to a production dev client.
 */

export type AppMode = "development" | "production";

export type ActiveBackend =
  | "firebase-production"
  | "firebase-shared-dev"
  | "local-mock"
  | "not-configured";

export type RuntimeKind =
  | "expo-go"
  | "development-client"
  | "store-or-standalone"
  | "web-dev"
  | "web-production";

export interface RuntimeSignals {
  appOwnership: string | null;
  isDev: boolean;
  platform: "ios" | "android" | "web" | string;
}

export class RuntimeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeConfigurationError";
  }
}

export function isProductionLikeRuntime(runtime: RuntimeKind): boolean {
  return runtime === "development-client" || runtime === "store-or-standalone";
}

export function detectRuntimeKind(signals: RuntimeSignals): RuntimeKind {
  if (signals.platform === "node") {
    return "web-dev";
  }
  if (signals.platform === "web") {
    return signals.isDev ? "web-dev" : "web-production";
  }
  if (signals.appOwnership === "expo") {
    return "expo-go";
  }
  if (signals.isDev) {
    return "development-client";
  }
  return "store-or-standalone";
}

export interface ParsedBundledMode {
  mode: AppMode;
  rawWasEmpty: boolean;
  rawWasInvalid: boolean;
}

export function parseBundledAppMode(
  raw: string,
  runtime: RuntimeKind
): ParsedBundledMode {
  const trimmed = raw.trim();
  if (trimmed === "production") {
    return { mode: "production", rawWasEmpty: false, rawWasInvalid: false };
  }
  if (trimmed === "" || trimmed === "development") {
    return { mode: "development", rawWasEmpty: trimmed === "", rawWasInvalid: false };
  }
  if (runtime === "expo-go" || runtime === "web-dev") {
    return { mode: "development", rawWasEmpty: false, rawWasInvalid: true };
  }
  throw new RuntimeConfigurationError(
    `Invalid EXPO_PUBLIC_APP_MODE "${raw}". Supported values: development, production.`
  );
}

export function resolveEffectiveAppMode(
  bundled: AppMode,
  runtime: RuntimeKind,
  rawWasEmpty: boolean,
  signals?: RuntimeSignals
): AppMode {
  if (runtime === "expo-go") {
    const isDev = signals?.isDev ?? (typeof __DEV__ !== "undefined" ? __DEV__ : false);
    if (!isDev) {
      throw new RuntimeConfigurationError(
        "Expo Go local-mock backend requires __DEV__. Refusing to start."
      );
    }
    return "development";
  }
  if (runtime === "web-dev") {
    return bundled;
  }
  if (isProductionLikeRuntime(runtime) || runtime === "web-production") {
    if (bundled !== "production") {
      const detail = rawWasEmpty
        ? "EXPO_PUBLIC_APP_MODE is missing (defaults to development)."
        : `EXPO_PUBLIC_APP_MODE=${bundled}.`;
      throw new RuntimeConfigurationError(
        `Production-like runtime requires EXPO_PUBLIC_APP_MODE=production (${detail}) ` +
          "For Metro with a production dev client, run: npm run start:prod-dev-client"
      );
    }
    return "production";
  }
  return bundled;
}

export function resolveActiveBackend(
  effectiveMode: AppMode,
  devBackendRaw: string,
  firebaseConfigured: boolean,
  runtime: RuntimeKind
): ActiveBackend {
  if (runtime === "expo-go") {
    return "local-mock";
  }
  if (isProductionLikeRuntime(runtime) || runtime === "web-production") {
    return effectiveMode === "production"
      ? firebaseConfigured
        ? "firebase-production"
        : "not-configured"
      : "local-mock";
  }
  if (runtime === "web-dev" && effectiveMode === "development") {
    if (devBackendRaw === "shared-dev" && firebaseConfigured) {
      return "firebase-shared-dev";
    }
    return "local-mock";
  }
  if (effectiveMode === "production") {
    return firebaseConfigured ? "firebase-production" : "not-configured";
  }
  return "local-mock";
}

export interface ResolvedEnvironment {
  runtime: RuntimeKind;
  bundledAppMode: AppMode;
  effectiveAppMode: AppMode;
  isProduction: boolean;
  isDevelopment: boolean;
  getActiveBackend: () => ActiveBackend;
}

export function buildResolvedEnvironment(input: {
  bundledAppModeRaw: string;
  devBackendRaw: string;
  firebaseConfigured: boolean;
  signals: RuntimeSignals;
}): ResolvedEnvironment {
  const runtime = detectRuntimeKind(input.signals);
  const parsed = parseBundledAppMode(input.bundledAppModeRaw, runtime);
  const effectiveAppMode = resolveEffectiveAppMode(
    parsed.mode,
    runtime,
    parsed.rawWasEmpty,
    input.signals
  );

  const getActiveBackend = (): ActiveBackend =>
    resolveActiveBackend(
      effectiveAppMode,
      input.devBackendRaw,
      input.firebaseConfigured,
      runtime
    );

  return {
    runtime,
    bundledAppMode: parsed.mode,
    effectiveAppMode,
    isProduction: effectiveAppMode === "production",
    isDevelopment: effectiveAppMode === "development",
    getActiveBackend,
  };
}

export function assertRuntimeBackendIsolation(resolved: ResolvedEnvironment): void {
  const backend = resolved.getActiveBackend();

  if (resolved.runtime === "expo-go") {
    if (backend !== "local-mock") {
      throw new RuntimeConfigurationError(
        `Expo Go must use local-mock backend only (resolved "${backend}").`
      );
    }
    if (resolved.effectiveAppMode !== "development") {
      throw new RuntimeConfigurationError(
        "Expo Go must run in development mode with local-mock only."
      );
    }
    return;
  }

  if (isProductionLikeRuntime(resolved.runtime)) {
    if (resolved.effectiveAppMode !== "production") {
      throw new RuntimeConfigurationError(
        "Development client and store builds require EXPO_PUBLIC_APP_MODE=production."
      );
    }
    if (backend === "local-mock" || backend === "firebase-shared-dev") {
      throw new RuntimeConfigurationError(
        `Production-like runtime cannot use backend "${backend}". ` +
          "Use firebase-production only."
      );
    }
  }
}

export function formatRuntimeDiagnostics(resolved: ResolvedEnvironment, projectId: string) {
  return {
    runtime: resolved.runtime,
    bundledAppMode: resolved.bundledAppMode,
    effectiveAppMode: resolved.effectiveAppMode,
    activeBackend: resolved.getActiveBackend(),
    firebaseProjectId: projectId.length > 0 ? projectId : "(not set)",
  };
}
