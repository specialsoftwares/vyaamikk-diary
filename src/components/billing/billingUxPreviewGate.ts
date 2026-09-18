import { env } from "@/config/env";

/**
 * Billing presentation lab. Never a purchase, restore, or quota path.
 * Must stay false for store-or-standalone / production binaries.
 */
export function isBillingUxPreviewEnabled(): boolean {
  const dev = typeof __DEV__ !== "undefined" && __DEV__ === true;
  if (!dev) return false;
  if (env.runtimeKind === "store-or-standalone") return false;
  if (env.isProduction && env.runtimeKind !== "development-client" && env.runtimeKind !== "expo-go") {
    return false;
  }
  return true;
}
