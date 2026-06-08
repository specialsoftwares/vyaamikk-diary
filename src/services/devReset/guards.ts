import { env, getActiveBackend, isFirebaseConfigured } from "@/config/env";

/** Exact phrase required before any dev reset runs. */
export const DEV_RESET_CONFIRM_PHRASE = "RESET VYAAMIKK DIARY DEV DATA";

export type DevResetScope = "local" | "firebase" | "targeted";

export class DevResetRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DevResetRefusedError";
  }
}

/** Heuristic — block Firebase projects that look like production. */
export function looksLikeProductionFirebaseProject(projectId: string): boolean {
  const id = projectId.trim().toLowerCase();
  if (!id) return true;
  return (
    id.includes("production") ||
    /^prod[-.]/.test(id) ||
    /[-.]prod$/.test(id) ||
    id === "vyaamikk-diary-prod"
  );
}

/** Shared-dev may use the primary project id during development — allow explicit dev reset. */
export function isFirebaseDevResetAllowedForProject(projectId: string): boolean {
  if (!env.isDevelopment) return false;
  if (getActiveBackend() !== "firebase-shared-dev") return false;
  if (looksLikeProductionFirebaseProject(projectId)) return false;
  return Boolean(projectId.trim());
}

export function resolveDevBackendLabel(): string {
  return getActiveBackend();
}

/** Throws if reset must not run (production mode/backend or bad confirmation). */
export function assertDevResetAllowed(confirmation?: string | null): void {
  if (typeof __DEV__ !== "undefined" && !__DEV__) {
    throw new DevResetRefusedError("Dev reset is only available in development builds.");
  }
  if (env.isProduction) {
    throw new DevResetRefusedError(
      "Dev reset refused: EXPO_PUBLIC_APP_MODE=production. Use a development build."
    );
  }
  const backend = getActiveBackend();
  if (backend === "firebase-production") {
    throw new DevResetRefusedError(
      "Dev reset refused: active backend is firebase-production."
    );
  }
  if (backend === "not-configured") {
    throw new DevResetRefusedError(
      "Dev reset refused: backend not configured for this build."
    );
  }
  if (!confirmation || confirmation.trim() !== DEV_RESET_CONFIRM_PHRASE) {
    throw new DevResetRefusedError(
      `Confirmation phrase required. Type exactly: ${DEV_RESET_CONFIRM_PHRASE}`
    );
  }
}

/** Node/CLI variant — no __DEV__ check (scripts are dev-only entry points). */
export function assertDevResetAllowedForCli(
  confirmation: string | undefined,
  opts?: { allowWithoutDevFlag?: boolean }
): void {
  if (process.env.EXPO_PUBLIC_APP_MODE === "production") {
    throw new DevResetRefusedError(
      "Dev reset refused: EXPO_PUBLIC_APP_MODE=production."
    );
  }
  const backend =
    process.env.EXPO_PUBLIC_APP_MODE === "production"
      ? isFirebaseConfigured()
        ? "firebase-production"
        : "not-configured"
      : isFirebaseConfigured()
        ? "firebase-shared-dev"
        : "local-mock";

  if (backend === "firebase-production") {
    throw new DevResetRefusedError("Dev reset refused: production Firebase backend.");
  }
  if (!opts?.allowWithoutDevFlag && process.env.NODE_ENV === "production") {
    throw new DevResetRefusedError("Dev reset refused: NODE_ENV=production.");
  }
  if (!confirmation || confirmation.trim() !== DEV_RESET_CONFIRM_PHRASE) {
    throw new DevResetRefusedError(
      `Confirmation phrase required. Pass --confirm "${DEV_RESET_CONFIRM_PHRASE}"`
    );
  }
}

export function assertFirebaseDevResetAllowed(
  confirmation: string | undefined,
  projectId: string
): void {
  assertDevResetAllowedForCli(confirmation);
  if (!isFirebaseConfigured()) {
    throw new DevResetRefusedError("Firebase is not configured — nothing to reset remotely.");
  }
  if (!isFirebaseDevResetAllowedForProject(projectId)) {
    throw new DevResetRefusedError(
      `Dev reset refused: Firebase project "${projectId}" is not allowed for remote wipe in this build.`
    );
  }
  if (getActiveBackend() === "firebase-production") {
    throw new DevResetRefusedError("Dev reset refused: firebase-production backend.");
  }
}
