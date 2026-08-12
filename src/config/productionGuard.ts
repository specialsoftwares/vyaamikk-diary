/**
 * Backward-compatible production guard entry.
 * Implementation lives in src/startup/guards.ts (structured, non-crashing).
 */
export {
  assertProductionConfig,
  evaluateProductionConfig,
  evaluateRuntimeBackendIsolation,
} from "@/startup/guards";
