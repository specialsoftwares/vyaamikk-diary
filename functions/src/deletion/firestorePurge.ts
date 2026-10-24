/**
 * Bounded purge of explicitly owned subcollections.
 * Missing intermediate parents are listed with showMissing, one page at a time.
 * The public listDocuments() helper is not used: it auto-paginates the whole collection.
 */

import type { Firestore } from "firebase-admin/firestore";

export const USER_SUBCOLLECTIONS = [
  "entries",
  "professionalPacks",
  "letterheadDocs",
  "customerCreditRecords",
  "purchaseOrders",
  "config",
  "counters",
  "_saveLocks",
  "trustedDevices",
  "partyLedgerProjections",
  "partyLedgerBuckets",
  "partyLedgerCommands",
  "partyLedgerCheckpoints",
  "processingPurposes",
  "processingPurposeEvents",
] as const;

/** Left in place. GRIN remains on its own flag; billing status is not diary content. */
export const RETAINED_USER_SUBCOLLECTIONS = [
  "subscription",
  "goodsEvidenceAdmission",
  "goodsEvidenceLedgers",
  "goodsEvidenceUploadControl",
  "goodsEvidenceStorage",
  "grinEvidenceObjectKeys",
  "grinEvidenceDerivativeKeys",
] as const;

const PAGE = 100;
const MAX_BATCHES_PER_ATTEMPT = 10;
const MAX_NESTED_DEPTH = 4;

export type PurgeHold = "depth_exceeded" | "unknown_collection" | "cursor_unowned";

export type FirestorePurgeCursor = {
  parentPath: string;
  collectionId: string;
  pageToken: string;
};

export type PurgePage = { ids: string[]; nextPageToken?: string };

export type PurgePorts = {
  listPage(parentPath: string, collectionId: string, pageToken?: string): Promise<PurgePage>;
  childCollections(path: string): Promise<string[]>;
  rootCollections(uid: string): Promise<string[]>;
  deleteDocs(paths: string[]): Promise<void>;
};

export type PurgeResult = {
  deleted: number;
  exhausted: boolean;
  hold?: PurgeHold;
  holdDetail?: string;
  cursor?: FirestorePurgeCursor;
};

type Walk = {
  deleted: number;
  batches: number;
  maxBatches: number;
  ports: PurgePorts;
  beforePage?: (cursor: FirestorePurgeCursor | null) => Promise<void>;
  onBatch?: () => Promise<void>;
};

const PURGE = new Set<string>(USER_SUBCOLLECTIONS);
const RETAIN = new Set<string>(RETAINED_USER_SUBCOLLECTIONS);

function projectIdOf(db: Firestore): string {
  const id = (db as { projectId?: string }).projectId;
  if (!id) throw new Error("firestore_project_unavailable");
  return id;
}

/** One ListDocuments page, including documents that exist only as parents. */
export async function listDocumentIdsPage(
  db: Firestore,
  parentPath: string,
  collectionId: string,
  pageToken?: string
): Promise<PurgePage> {
  const projectId = projectIdOf(db);
  const databaseId = (db as { databaseId?: string }).databaseId || "(default)";
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const url = new URL(
    `${host ? `http://${host}` : "https://firestore.googleapis.com"}/v1/projects/${projectId}/databases/${databaseId}/documents/${parentPath}/${collectionId}`
  );
  url.searchParams.set("pageSize", String(PAGE));
  url.searchParams.set("showMissing", "true");
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  const headers: Record<string, string> = {};
  if (host) {
    // The emulator enforces Rules on the REST list. This token is the
    // emulator owner and is never sent to production.
    headers.Authorization = "Bearer owner";
  } else {
    const { GoogleAuth } = await import("google-auth-library");
    const token = await new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/datastore"],
    }).getAccessToken();
    if (!token) throw new Error("firestore_list_unauthorised");
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`firestore_list_failed_${response.status}`);
  const body = (await response.json()) as {
    documents?: { name?: string }[];
    nextPageToken?: string;
  };
  const prefix = `/documents/${parentPath}/${collectionId}/`;
  const ids = (body.documents ?? []).map((document) => {
    const name = document.name ?? "";
    const at = name.lastIndexOf(prefix);
    return at >= 0 ? name.slice(at + prefix.length) : name.split("/").pop() ?? "";
  }).filter((id) => id.length > 0 && !id.includes("/"));
  return { ids, nextPageToken: body.nextPageToken || undefined };
}

export function adminPurgePorts(db: Firestore): PurgePorts {
  return {
    listPage: (parentPath, collectionId, pageToken) =>
      listDocumentIdsPage(db, parentPath, collectionId, pageToken),
    async childCollections(path) {
      const cols = await db.doc(path).listCollections();
      return cols.map((col) => col.id);
    },
    async rootCollections(uid) {
      const cols = await db.doc(`users/${uid}`).listCollections();
      return cols.map((col) => col.id);
    },
    async deleteDocs(paths) {
      if (paths.length === 0) return;
      const batch = db.batch();
      for (const path of paths) batch.delete(db.doc(path));
      await batch.commit();
    },
  };
}

async function purgeCollection(
  parentPath: string,
  collectionId: string,
  depth: number,
  state: Walk,
  resume?: FirestorePurgeCursor
): Promise<PurgeResult> {
  if (depth > MAX_NESTED_DEPTH) {
    return { deleted: state.deleted, exhausted: false, hold: "depth_exceeded", holdDetail: `${parentPath}/${collectionId}` };
  }
  let pageToken = resume?.parentPath === parentPath && resume.collectionId === collectionId
    ? resume.pageToken
    : undefined;
  for (;;) {
    if (state.batches >= state.maxBatches) {
      return {
        deleted: state.deleted,
        exhausted: false,
        cursor: { parentPath, collectionId, pageToken: pageToken ?? "" },
      };
    }
    const cursor = pageToken ? { parentPath, collectionId, pageToken } : null;
    if (state.beforePage) await state.beforePage(cursor);
    const page = await state.ports.listPage(parentPath, collectionId, pageToken);
    if (page.ids.length === 0 && !page.nextPageToken) {
      return { deleted: state.deleted, exhausted: true };
    }
    for (const id of page.ids) {
      const path = `${parentPath}/${collectionId}/${id}`;
      const children = await state.ports.childCollections(path);
      for (const child of children) {
        const nested = await purgeCollection(path, child, depth + 1, state);
        if (!nested.exhausted || nested.hold) return nested;
      }
    }
    await state.ports.deleteDocs(page.ids.map((id) => `${parentPath}/${collectionId}/${id}`));
    state.deleted += page.ids.length;
    state.batches += 1;
    if (state.onBatch) await state.onBatch();
    if (!page.nextPageToken) return { deleted: state.deleted, exhausted: true };
    pageToken = page.nextPageToken;
  }
}

function cursorOwnedByUser(uid: string, cursor: FirestorePurgeCursor): boolean {
  const userPath = `users/${uid}`;
  const parent = cursor.parentPath;
  if (parent !== userPath && !parent.startsWith(`${userPath}/`)) return false;
  if (parent.includes("..") || parent.includes("//")) return false;
  const collectionId = cursor.collectionId;
  if (!collectionId || collectionId.includes("/") || collectionId === "." || collectionId === "..") return false;
  if (parent === userPath) return true;
  const rest = parent.slice(userPath.length + 1).split("/");
  return rest.length % 2 === 0 && rest.every((part) => part.length > 0 && part !== "." && part !== "..");
}

export async function purgeUserSubcollectionsFully(
  db: Firestore,
  uid: string,
  options?: {
    onBatch?: () => Promise<void>;
    beforePage?: (cursor: FirestorePurgeCursor | null) => Promise<void>;
    ports?: PurgePorts;
    cursor?: FirestorePurgeCursor | null;
    maxBatches?: number;
  }
): Promise<PurgeResult> {
  const ports = options?.ports ?? adminPurgePorts(db);
  const state: Walk = {
    deleted: 0,
    batches: 0,
    maxBatches: options?.maxBatches ?? MAX_BATCHES_PER_ATTEMPT,
    ports,
    beforePage: options?.beforePage,
    onBatch: options?.onBatch,
  };
  const userPath = `users/${uid}`;
  if (options?.cursor && !cursorOwnedByUser(uid, options.cursor)) {
    return { deleted: 0, exhausted: false, hold: "cursor_unowned", holdDetail: "cursor_outside_user" };
  }
  if (options?.cursor && options.cursor.parentPath !== userPath) {
    const depth = options.cursor.parentPath.split("/").length / 2;
    const nested = await purgeCollection(
      options.cursor.parentPath,
      options.cursor.collectionId,
      depth,
      state,
      options.cursor
    );
    if (!nested.exhausted || nested.hold) return nested;
  }
  let resumeTop = options?.cursor?.parentPath === userPath;
  for (const sub of USER_SUBCOLLECTIONS) {
    if (resumeTop && options?.cursor?.collectionId !== sub) continue;
    const result = await purgeCollection(
      userPath,
      sub,
      1,
      state,
      resumeTop ? options?.cursor ?? undefined : undefined
    );
    resumeTop = false;
    if (!result.exhausted || result.hold) return result;
  }
  const roots = await ports.rootCollections(uid);
  if (roots.length > 50) {
    return { deleted: state.deleted, exhausted: false, hold: "unknown_collection", holdDetail: "too_many_collections" };
  }
  for (const name of roots) {
    if (PURGE.has(name) || RETAIN.has(name)) continue;
    return { deleted: state.deleted, exhausted: false, hold: "unknown_collection", holdDetail: name };
  }
  for (const sub of USER_SUBCOLLECTIONS) {
    const page = await ports.listPage(userPath, sub);
    if (page.ids.length > 0) return { deleted: state.deleted, exhausted: false };
  }
  return { deleted: state.deleted, exhausted: true };
}
