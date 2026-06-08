import type { BusinessEntry } from "@/domain/businessEntry";

/**
 * V1 conflict rule: never silently overwrite local edits.
 * If remote is newer by updatedAt and versionNumber differs, flag conflict.
 */
export function detectEntryConflict(
  local: BusinessEntry,
  remote: BusinessEntry
): boolean {
  const localV = local.documentHistory?.versionNumber ?? 1;
  const remoteV = remote.documentHistory?.versionNumber ?? 1;
  if (localV !== remoteV) return true;
  const localAt = local.updatedAt ?? 0;
  const remoteAt = remote.updatedAt ?? 0;
  if (remoteAt > localAt + 2000) return true;
  return false;
}
