/**
 * Caller-visible save progress. "Synced" is not one of these values.
 * Remote acceptance stays on the existing cloudAccepted / remoteAccepted flag.
 */

export const COMPOSER_SAVE_STATUSES = [
  "local_saved",
  "waiting_sync",
  "syncing_photo",
  "preparing_pdf",
  "ready",
  "needs_attention",
] as const;

export type ComposerSaveStatus = (typeof COMPOSER_SAVE_STATUSES)[number];

export function deriveComposerSaveStatus(input: {
  localDurable: boolean;
  remoteAccepted: boolean;
  photo: "none" | "syncing" | "local" | "failed";
  pdf: "pending" | "preparing" | "ready" | "failed" | "skipped";
}): ComposerSaveStatus {
  if (!input.localDurable) return "needs_attention";
  if (input.photo === "syncing") return "syncing_photo";
  if (input.pdf === "preparing") return "preparing_pdf";
  if (input.photo === "failed" || input.pdf === "failed") return "needs_attention";
  if (input.pdf === "ready" || input.pdf === "skipped") return "ready";
  if (!input.remoteAccepted) return "waiting_sync";
  return "local_saved";
}

/** True only when the app's existing remote-accept flag is true. */
export function shouldDisplayRemoteSynced(remoteAccepted: boolean | undefined): boolean {
  return remoteAccepted === true;
}
