/**
 * Offline access policy after last successful online session validation.
 * Final rule: 24h full offline → then read-only until online validation.
 */

export const OFFLINE_FULL_ACCESS_MS = 24 * 60 * 60 * 1000;

export type OfflineAccessMode = "online" | "offline_full" | "offline_read_only";

export function resolveOfflineAccessMode(input: {
  isOnline: boolean;
  lastSuccessfulOnlineValidationAt: number | null;
  now?: number;
}): OfflineAccessMode {
  if (input.isOnline) return "online";
  const last = input.lastSuccessfulOnlineValidationAt;
  if (last == null || last <= 0) return "offline_read_only";
  const now = input.now ?? Date.now();
  if (now - last <= OFFLINE_FULL_ACCESS_MS) return "offline_full";
  return "offline_read_only";
}

export function offlineMutationAllowed(mode: OfflineAccessMode): boolean {
  return mode === "online" || mode === "offline_full";
}

/** Actions always blocked offline regardless of 24h window. */
export const OFFLINE_ALWAYS_BLOCKED_ACTIONS = [
  "change_mobile",
  "change_email",
  "recovery",
  "account_deletion",
  "full_export",
  "bulk_sharing",
  "security_settings",
  "device_management",
  "logout",
] as const;

export type OfflineAlwaysBlockedAction = (typeof OFFLINE_ALWAYS_BLOCKED_ACTIONS)[number];

export function isOfflineAlwaysBlockedAction(action: string): boolean {
  return (OFFLINE_ALWAYS_BLOCKED_ACTIONS as readonly string[]).includes(action);
}
