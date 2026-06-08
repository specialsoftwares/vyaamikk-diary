import { env, getActiveBackend, isFirebaseConfigured } from "@/config/env";
import { findLegalConfigBlockers } from "@/config/legal";

/**
 * Fail fast on production builds that would run mock auth, local-only storage,
 * or placeholder legal URLs / support email.
 */
export function assertProductionConfig(): void {
  if (!env.isProduction) return;

  if (!isFirebaseConfigured()) {
    throw new Error(
      "Production build requires EXPO_PUBLIC_FIREBASE_* configuration. Refusing to start in not-configured mode."
    );
  }

  const backend = getActiveBackend();
  if (backend !== "firebase-production") {
    throw new Error(
      `Production build cannot use backend "${backend}". Use real Firebase Auth + Firestore only.`
    );
  }

  const urlBlockers = findLegalConfigBlockers().filter(
    (b) => b.includes("example.com") || b.includes(".example") || b.includes("support email")
  );
  if (urlBlockers.length > 0) {
    throw new Error(
      `Production build has placeholder legal URLs or support email:\n${urlBlockers.join("\n")}`
    );
  }
}
