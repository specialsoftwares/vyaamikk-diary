/**
 * Bounded-page Firebase Storage purge for user-owned prefixes.
 * Uses Admin bucket.list({ prefix, maxResults, pageToken }) — never unbounded listAll.
 */

import {
  allUserOwnedStoragePrefixes,
  assertObjectOwnedByUser,
  isObjectOwnedByUser,
} from "./userOwnedStoragePaths";

export type StorageFileLike = {
  name: string;
  delete: () => Promise<unknown>;
};

export type StorageBucketLike = {
  getFiles: (query: {
    prefix: string;
    maxResults: number;
    pageToken?: string;
  }) => Promise<
    | [StorageFileLike[], unknown?, { pageToken?: string }?]
    | [StorageFileLike[], unknown?, unknown?]
  >;
};

export type StoragePurgeResult = {
  deleted: number;
  pages: number;
  verifiedEmpty: boolean;
};

const PAGE_SIZE = 100;
/** Max list pages per prefix per invocation (continuation via job retry). */
const MAX_PAGES_PER_PREFIX = 50;
/** Extra verification passes to catch objects uploaded mid-purge. */
const VERIFY_PASSES = 2;

export async function deleteOwnedFile(
  uid: string,
  file: StorageFileLike
): Promise<"deleted" | "missing" | "skipped_unowned"> {
  if (!isObjectOwnedByUser(uid, file.name)) {
    return "skipped_unowned";
  }
  try {
    await file.delete();
    return "deleted";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/no such object|not found|404/i.test(msg)) return "missing";
    throw e;
  }
}

export async function purgePrefixPaged(
  bucket: StorageBucketLike,
  uid: string,
  prefix: string,
  opts?: { maxPages?: number; pageSize?: number }
): Promise<{ deleted: number; pages: number; exhausted: boolean }> {
  assertObjectOwnedByUser(uid, `${prefix}x`); // prefix must be under user root
  if (!prefix.startsWith(`users/${uid.trim()}/`)) {
    throw new Error("storage_path_not_owned_by_user");
  }

  const maxPages = opts?.maxPages ?? MAX_PAGES_PER_PREFIX;
  const pageSize = opts?.pageSize ?? PAGE_SIZE;
  let pageToken: string | undefined;
  let deleted = 0;
  let pages = 0;

  while (pages < maxPages) {
    pages += 1;
    const [files, , apiResponse] = await bucket.getFiles({
      prefix,
      maxResults: pageSize,
      pageToken,
    });

    for (const file of files) {
      const outcome = await deleteOwnedFile(uid, file);
      if (outcome === "deleted" || outcome === "missing") deleted += 1;
      if (outcome === "skipped_unowned") {
        throw new Error("storage_path_not_owned_by_user");
      }
    }

    const token =
      apiResponse &&
      typeof apiResponse === "object" &&
      apiResponse !== null &&
      "pageToken" in apiResponse
        ? String((apiResponse as { pageToken?: string }).pageToken ?? "")
        : "";
    pageToken = token || undefined;
    if (!pageToken) {
      return { deleted, pages, exhausted: true };
    }
  }

  return { deleted, pages, exhausted: false };
}

export async function countOwnedFilesUnderPrefix(
  bucket: StorageBucketLike,
  uid: string,
  prefix: string,
  pageSize = PAGE_SIZE
): Promise<number> {
  if (!prefix.startsWith(`users/${uid.trim()}/`)) {
    throw new Error("storage_path_not_owned_by_user");
  }
  let pageToken: string | undefined;
  let count = 0;
  let guard = 0;
  do {
    guard += 1;
    if (guard > 200) break;
    const [files, , apiResponse] = await bucket.getFiles({
      prefix,
      maxResults: pageSize,
      pageToken,
    });
    for (const f of files) {
      if (isObjectOwnedByUser(uid, f.name)) count += 1;
    }
    const token =
      apiResponse &&
      typeof apiResponse === "object" &&
      apiResponse !== null &&
      "pageToken" in apiResponse
        ? String((apiResponse as { pageToken?: string }).pageToken ?? "")
        : "";
    pageToken = token || undefined;
  } while (pageToken);
  return count;
}

/**
 * Delete all supported user-owned prefixes, then verify empty (repeat passes).
 */
export async function purgeAllUserOwnedStorage(
  bucket: StorageBucketLike,
  uid: string
): Promise<StoragePurgeResult> {
  let deleted = 0;
  let pages = 0;

  for (let pass = 0; pass < VERIFY_PASSES; pass += 1) {
    for (const prefix of allUserOwnedStoragePrefixes(uid)) {
      // Loop until prefix exhausted (multiple max-page chunks).
      for (;;) {
        const result = await purgePrefixPaged(bucket, uid, prefix);
        deleted += result.deleted;
        pages += result.pages;
        if (result.exhausted) break;
      }
    }
  }

  let remaining = 0;
  for (const prefix of allUserOwnedStoragePrefixes(uid)) {
    remaining += await countOwnedFilesUnderPrefix(bucket, uid, prefix);
  }

  return {
    deleted,
    pages,
    verifiedEmpty: remaining === 0,
  };
}
