/**
 * Canonical Firebase Storage prefixes owned by a single Auth UID.
 * Keep in sync with mobile `src/services/storage/userOwnedStoragePaths.ts`
 * and `storage.rules` (`users/{userId}/letterhead|attachments|pdfs/...`).
 *
 * GRIN evidence lives under `users/{uid}/grinEvidence/` and is listed in
 * `grinCleanupLists.ts`, not here. Do not add `grinEvidence` to this array
 * as P8 enablement: diary purge is first-level only and this list is not
 * flag-gated, so appending here would miss nested Firestore and could
 * delete live GRIN storage while INCLUDE_GRIN_IN_ACCOUNT_PURGE is false.
 * Enablement is the flag + recursive helper in runFinalAccountPurge.
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
const OPAQUE_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** 24 characters from the application random source. No caller text is mixed in. */
export function opaqueStorageId(random: () => number = Math.random): string {
  let id = "";
  for (let i = 0; i < 24; i += 1) {
    id += OPAQUE_ALPHABET[Math.floor(random() * OPAQUE_ALPHABET.length)];
  }
  return id;
}

export function opaqueStorageObjectName(id: string, extension: string): string {
  if (!/^[0-9a-z]{24}$/.test(id)) throw new Error("storage_object_id_invalid");
  const ext = extension.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!ext || ext.length > 8) throw new Error("storage_object_extension_invalid");
  return `${id}.${ext}`;
}

export function isOpaqueStorageObjectName(name: string): boolean {
  return /^[0-9a-z]{24}\.[a-z0-9]{1,8}$/.test(name);
}

/**
 * New object path. `displayName` is returned for the record and is not placed
 * in the path. An existing object is opened by the path already stored on it.
 */
export function allocateOpaqueUserStoragePath(input: {
  userId: string;
  category: UserStorageCategory;
  recordId?: string;
  displayName?: string | null;
  extension: string;
  random?: () => number;
}): { storagePath: string; objectName: string; displayName: string } {
  const userId = input.userId.trim();
  const recordId = input.recordId?.trim() ?? "";
  if (!userId) throw new Error("uid required for storage root");
  if (input.category !== "letterhead" && !recordId) throw new Error("record id required");
  if (objectNameEmbedsPrivateContent(userId) || objectNameEmbedsPrivateContent(recordId)) {
    throw new Error("storage_name_embeds_private_content");
  }
  const objectName = opaqueStorageObjectName(opaqueStorageId(input.random), input.extension);
  const storagePath = input.category === "letterhead"
    ? `${userStorageCategoryPrefix(userId, "letterhead")}${objectName}`
    : `${userStorageCategoryPrefix(userId, input.category)}${recordId}/${objectName}`;
  const displayName = input.displayName?.trim() || objectName;
  return { storagePath, objectName, displayName };
}

/** An email or international phone is private content and cannot be an object name. */
export function objectNameEmbedsPrivateContent(name: string): boolean {
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(name)) return true;
  if (/\+\d{8,}/.test(name)) return true;
  return false;
}

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
