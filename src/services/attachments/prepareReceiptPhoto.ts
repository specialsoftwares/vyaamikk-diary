/**
 * Turns a cash-receipt attachment into a short-lived PreparedReceiptPhoto.
 * dataUri stays in memory for the PDF HTML builder. It is not written to
 * Firestore, SQLite, navigation, the outbox, or logs.
 */

import * as FileSystem from "expo-file-system/legacy";

import type { AttachmentRef, BusinessCashGivenPayload, BusinessEntry } from "@/domain/businessEntry";
import { isObjectOwnedByUser } from "@/services/storage/userOwnedStoragePaths";

import { captureCashPhotoOwner, type SessionUidReader } from "./cashPhotoOwner";
import {
  cashPaidPhotoAttachment,
  hasCashPhotoReference,
  isOwnerScopedPhotoUri,
} from "./cashPaidPhotoRef";
import type { PreparedReceiptPhoto } from "./preparedReceiptPhoto";
import { decodeBase64, inspectReceiptBytes, type ReceiptByteReject } from "./receiptPhotoBytes";

type DownloadOutcome = "ok" | "offline" | "access_denied" | "missing";

export interface PrepareReceiptPhotoDeps {
  info(uri: string): Promise<{ exists: boolean; size?: number; mtimeMs?: number }>;
  readBase64(uri: string): Promise<string>;
  ensureDir(dir: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  remove(uri: string): Promise<void>;
  cacheDir(uid: string): string;
  downloadOwned(storagePath: string, destUri: string): Promise<DownloadOutcome>;
}

function storagePathFor(entry: BusinessEntry, attachment: AttachmentRef | null): string | null {
  const payload = entry.payload as BusinessCashGivenPayload;
  const fromPayload = payload.photoAttachmentStoragePath?.trim() || "";
  const fromAttachment = attachment?.storagePath?.trim() || "";
  return fromPayload || fromAttachment || null;
}

async function fromBytes(
  bytes: Uint8Array,
  expectedHash: string | null
): Promise<PreparedReceiptPhoto | "mismatch" | null> {
  const inspected = inspectReceiptBytes(bytes);
  if (!inspected.ok) {
    return { status: "unavailable", reason: inspected.reason };
  }
  if (expectedHash && expectedHash !== inspected.contentHash) return "mismatch";
  return {
    status: "ready",
    dataUri: inspected.dataUri,
    mime: inspected.mime,
    contentHash: inspected.contentHash,
    width: inspected.width,
    height: inspected.height,
  };
}

async function readValidated(
  deps: PrepareReceiptPhotoDeps,
  uri: string,
  expectedHash: string | null
): Promise<PreparedReceiptPhoto | "mismatch" | null> {
  const info = await deps.info(uri);
  if (!info.exists) return null;
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(await deps.readBase64(uri));
  } catch {
    return { status: "unavailable", reason: "decode_failed" };
  }
  return fromBytes(bytes, expectedHash);
}

function asUnavailable(value: PreparedReceiptPhoto | "mismatch" | null): PreparedReceiptPhoto | null {
  if (value && value !== "mismatch" && value.status === "unavailable") return value;
  return null;
}

export async function prepareReceiptPhoto(input: {
  uid: string;
  entry: BusinessEntry;
  readSessionUid?: SessionUidReader;
  deps?: PrepareReceiptPhotoDeps;
}): Promise<PreparedReceiptPhoto> {
  if (!hasCashPhotoReference(input.entry)) return { status: "none" };

  const owner = captureCashPhotoOwner(input.uid, input.readSessionUid);
  const deps = input.deps ?? defaultPrepareDeps(input.uid, owner.assertStillOwner);
  const attachment = cashPaidPhotoAttachment(input.entry.attachments);
  const expectedHash =
    attachment?.contentHash?.trim() ||
    (attachment?.revision && !attachment.revision.includes(":") && attachment.revision !== "unversioned"
      ? attachment.revision.trim()
      : null);

  owner.assertStillOwner();

  if (attachment?.uri && isOwnerScopedPhotoUri(input.uid, attachment.uri)) {
    const local = await readValidated(deps, attachment.uri, expectedHash);
    owner.assertStillOwner();
    if (local && local !== "mismatch") return local;
    const rejected = asUnavailable(local);
    if (rejected?.status === "unavailable" && rejected.reason === "too_large") return rejected;
  }

  if (expectedHash) {
    const cacheDir = deps.cacheDir(input.uid);
    for (const ext of ["jpg", "png"]) {
      const cached = `${cacheDir}/${expectedHash}.${ext}`;
      const hit = await readValidated(deps, cached, expectedHash);
      owner.assertStillOwner();
      if (hit && hit !== "mismatch") return hit;
    }
  }

  const storagePath = storagePathFor(input.entry, attachment);
  if (!storagePath) {
    return { status: "unavailable", reason: "missing_local" };
  }
  if (!isObjectOwnedByUser(input.uid, storagePath)) {
    return { status: "unavailable", reason: "access_denied" };
  }

  const cacheDir = deps.cacheDir(input.uid);
  await deps.ensureDir(cacheDir);
  owner.assertStillOwner();
  const staging = `${cacheDir}/incoming-${Date.now()}.bin`;
  let staged = false;
  try {
    const downloaded = await deps.downloadOwned(storagePath, staging);
    owner.assertStillOwner();
    if (downloaded === "access_denied") return { status: "unavailable", reason: "access_denied" };
    if (downloaded === "missing") return { status: "unavailable", reason: "missing_local" };
    if (downloaded !== "ok") return { status: "unavailable", reason: "offline" };
    staged = true;
    const prepared = await readValidated(deps, staging, expectedHash);
    owner.assertStillOwner();
    if (!prepared || prepared === "mismatch") {
      return { status: "unavailable", reason: prepared === "mismatch" ? "decode_failed" : "missing_local" };
    }
    if (prepared.status === "unavailable") return prepared;
    const ext = prepared.mime === "image/png" ? "png" : "jpg";
    const finalPath = `${cacheDir}/${prepared.contentHash}.${ext}`;
    const info = await deps.info(finalPath);
    if (!info.exists) {
      await deps.move(staging, finalPath);
      staged = false;
    }
    owner.assertStillOwner();
    return prepared;
  } catch (e) {
    const reason: ReceiptByteReject | "access_denied" | "offline" =
      e && typeof e === "object" && (e as { code?: string }).code === "owner_changed"
        ? "access_denied"
        : "offline";
    return { status: "unavailable", reason };
  } finally {
    if (staged) {
      try {
        await deps.remove(staging);
      } catch {
        // Staging cleanup is best-effort and must not log the path.
      }
    }
  }
}

function defaultPrepareDeps(
  uid: string,
  assertStillOwner: () => void
): PrepareReceiptPhotoDeps {
  const root = () => FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? "";
  return {
    cacheDir(ownerUid: string) {
      return `${root()}receipt-photo-cache/${ownerUid}`;
    },
    async ensureDir(dir: string) {
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    },
    async info(uri: string) {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) return { exists: false };
      return {
        exists: true,
        size: "size" in info ? info.size : undefined,
        mtimeMs:
          "modificationTime" in info && typeof info.modificationTime === "number"
            ? Math.round(info.modificationTime * 1000)
            : undefined,
      };
    },
    async readBase64(uri: string) {
      return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    },
    async move(from: string, to: string) {
      await FileSystem.moveAsync({ from, to });
    },
    async remove(uri: string) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    },
    async downloadOwned(storagePath: string, destUri: string) {
      if (!isObjectOwnedByUser(uid, storagePath)) return "access_denied";
      assertStillOwner();
      try {
        const { getDownloadUrlForPath } = await import("@/services/storage/userStorage");
        const url = await getDownloadUrlForPath(storagePath);
        assertStillOwner();
        if (!url) return "offline";
        const result = await FileSystem.downloadAsync(url, destUri);
        if (result.status === 401 || result.status === 403) return "access_denied";
        if (result.status !== 200) return "offline";
        return "ok";
      } catch {
        return "offline";
      }
    },
  };
}
