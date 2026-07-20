/**
 * Canonical Firebase Storage prefixes owned by a single Auth UID.
 * Mirror of `functions/src/deletion/userOwnedStoragePaths.ts` — keep identical.
 */

export const USER_STORAGE_CATEGORIES = ["letterhead", "attachments", "pdfs"] as const;
export type UserStorageCategory = (typeof USER_STORAGE_CATEGORIES)[number];

export function userStorageRootPrefix(uid: string): string {
  const safe = uid.trim();
  if (!safe) throw new Error("uid required for storage root");
  return `users/${safe}/`;
}

export function userStorageCategoryPrefix(uid: string, category: UserStorageCategory): string {
  return `${userStorageRootPrefix(uid)}${category}/`;
}

export function allUserOwnedStoragePrefixes(uid: string): string[] {
  return USER_STORAGE_CATEGORIES.map((c) => userStorageCategoryPrefix(uid, c));
}

export function isObjectOwnedByUser(uid: string, objectPath: string): boolean {
  const root = userStorageRootPrefix(uid);
  const path = objectPath.trim().replace(/^\/+/, "");
  if (!path.startsWith(root)) return false;
  if (path.includes("..")) return false;
  return path.length > root.length;
}

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
      notes: "Letterhead template images",
    },
    {
      category: "attachments",
      prefix: userStorageCategoryPrefix(id, "attachments"),
      ruleMatch: "users/{userId}/attachments/{recordId}/{fileName}",
      notes: "Record attachments / photos",
    },
    {
      category: "pdfs",
      prefix: userStorageCategoryPrefix(id, "pdfs"),
      ruleMatch: "users/{userId}/pdfs/{recordId}/{fileName}",
      notes: "Optional cloud PDF objects",
    },
  ];
}
