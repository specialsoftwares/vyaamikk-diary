import { env } from "@/config/env";

/**
 * Presentation-only onboarding preview. Never a mock auth path.
 * Must stay false for store-or-standalone / production binaries.
 */
export function isOnboardingUxPreviewEnabled(): boolean {
  const dev = typeof __DEV__ !== "undefined" && __DEV__ === true;
  if (!dev) return false;
  if (env.runtimeKind === "store-or-standalone") return false;
  if (env.isProduction && env.runtimeKind !== "development-client" && env.runtimeKind !== "expo-go") {
    return false;
  }
  return true;
}
