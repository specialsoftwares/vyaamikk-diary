/**
 * Canonical Firebase Storage prefixes owned by a single Auth UID.
 * Keep in sync with mobile `src/services/storage/userOwnedStoragePaths.ts`
 * and `storage.rules` (`users/{userId}/letterhead|attachments|pdfs/...`).
 *
 * Profile logos are device-local only (not uploaded to Storage).
 * Generated PDF file URIs are stripped before Firestore sync; optional
 * cloud PDF objects use `users/{uid}/pdfs/...` when uploaded.
 */

export const USER_STORAGE_CATEGORIES = ["letterhead", "attachments", "pdfs"] as const;
export type UserStorageCategory = (typeof USER_STORAGE_CATEGORIES)[number];

/** Root prefix for all deletable user-owned objects. */
export function userStorageRootPrefix(uid: string): string {
  const safe = uid.trim();
  if (!safe) throw new Error("uid required for storage root");
  return `users/${safe}/`;
}

export function userStorageCategoryPrefix(uid: string, category: UserStorageCategory): string {
  return `${userStorageRootPrefix(uid)}${category}/`;
}

/** Every supported user-owned prefix that final deletion must empty. */
export function allUserOwnedStoragePrefixes(uid: string): string[] {
  return USER_STORAGE_CATEGORIES.map((c) => userStorageCategoryPrefix(uid, c));
}

/**
 * True only when `objectPath` is strictly under `users/{uid}/...`
 * (prevents cross-user deletes and root/bucket wipes).
 */
export function isObjectOwnedByUser(uid: string, objectPath: string): boolean {
  const root = userStorageRootPrefix(uid);
  const path = objectPath.trim().replace(/^\/+/, "");
  if (!path.startsWith(root)) return false;
  if (path.includes("..")) return false;
  // Must have at least one character after the root (no deleting the abstract root alone).
  return path.length > root.length;
}

/** Reject paths that are not deterministically tied to this uid. */
export function assertObjectOwnedByUser(uid: string, objectPath: string): void {
  if (!isObjectOwnedByUser(uid, objectPath)) {
    throw new Error("storage_path_not_owned_by_user");
  }
}

export type StoragePathInventoryEntry = {
  category: UserStorageCategory;
  prefix: string;
  ruleMatch: string;
  notes: string;
};

export function describeUserStorageInventory(uid: string): StoragePathInventoryEntry[] {
  const id = uid.trim() || "{uid}";
  return [
    {
      category: "letterhead",
      prefix: userStorageCategoryPrefix(id, "letterhead"),
      ruleMatch: "users/{userId}/letterhead/{fileName}",
      notes: "Letterhead template images uploaded via userStorage.uploadLetterhead*",
    },
    {
      category: "attachments",
      prefix: userStorageCategoryPrefix(id, "attachments"),
      ruleMatch: "users/{userId}/attachments/{recordId}/{fileName}",
      notes: "Cash-paid / record photos; nested recordId folders",
    },
    {
      category: "pdfs",
      prefix: userStorageCategoryPrefix(id, "pdfs"),
      ruleMatch: "users/{userId}/pdfs/{recordId}/{fileName}",
      notes: "Optional cloud PDF uploads when enabled; local pdfUri not synced",
    },
  ];
}
