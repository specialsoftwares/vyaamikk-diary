import { AUTH_SECONDARY_ACTIVE } from "@/actionSystem/authSecondaryActive";

const MARKER = "[VYD_STAGE2_ACTION_SYSTEM]";

let loggedOnce = false;

/**
 * DEV-only runtime provenance for Stage 2 physical review.
 * Console marker only — no user-facing UI.
 */
export function logStage2ActionSystemProvenance(surface: string): void {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  if (loggedOnce) return;
  loggedOnce = true;
  // Unique Stage 2 fingerprint — must appear in device logcat after hard reload.
  console.log(
    `${MARKER} secondaryActive=${AUTH_SECONDARY_ACTIVE.fg} fill=${AUTH_SECONDARY_ACTIVE.fill} surface=${surface}`
  );
}
