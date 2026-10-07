/**
 * Firestore-backed letterhead repository (shared-dev / production).
 *
 * Document layout:
 *   users/{uid}/config/letterhead
 *
 * The letterhead template image is stored in Firebase Storage when available;
 * legacy documents may still carry an inline base64 `imageDataUri`. Signature
 * and stamp assets remain inline data URIs for now.
 */

import { deleteDoc, deleteField, doc, getDoc, setDoc } from "firebase/firestore";

import { AppError } from "@/domain/errors";
import { getFirebaseDb } from "@/config/firebase";
import { createLogger } from "@/utils/logger";
import {
  isUserStorageAvailable,
  uploadLetterheadImage,
} from "@/services/storage/userStorage";

import { resolveLetterheadImageSource } from "./letterheadImageResolver";
import type { LetterheadConfig, LetterheadRepository } from "./types";

const log = createLogger("letterhead/firebase");

const APPROX_DOC_LIMIT_BYTES = 950_000; // leave headroom under the 1 MB cap

function configDocRef(userId: string) {
  return doc(getFirebaseDb(), "users", userId, "config", "letterhead");
}

function hasTemplateImage(data: Partial<LetterheadConfig>): boolean {
  if (data.sourceType === "generated_layout" && data.generatedLayout) {
    return true;
  }
  return Boolean(
    data.letterheadImageStoragePath?.trim() || data.imageDataUri?.trim()
  );
}

function mapConfigFromFirestore(
  userId: string,
  data: Partial<LetterheadConfig>
): LetterheadConfig {
  return {
    userId,
    sourceType: data.sourceType ?? "imported_image",
    generatedLayout: data.generatedLayout ?? null,
    imageWidth: Number(data.imageWidth ?? 0),
    imageHeight: Number(data.imageHeight ?? 0),
    imageDataUri: data.imageDataUri ?? null,
    letterheadImageStoragePath: data.letterheadImageStoragePath ?? null,
    letterheadImageDownloadUrl: data.letterheadImageDownloadUrl ?? null,
    letterheadImageUpdatedAt: data.letterheadImageUpdatedAt ?? null,
    letterheadStorageMigratedAt: data.letterheadStorageMigratedAt ?? null,
    margins: data.margins ?? { topPct: 25, bottomPct: 15, leftPct: 12, rightPct: 12 },
    signatureDataUri: data.signatureDataUri ?? null,
    stampDataUri: data.stampDataUri ?? null,
    defaultSenderName: data.defaultSenderName ?? null,
    defaultSenderTitle: data.defaultSenderTitle ?? null,
    defaultComplimentaryClose: data.defaultComplimentaryClose ?? null,
    repeatTemplateAllPages: data.repeatTemplateAllPages ?? true,
    createdAt: Number(data.createdAt ?? Date.now()),
    updatedAt: Number(data.updatedAt ?? Date.now()),
  };
}

export const firebaseLetterheadRepository: LetterheadRepository = {
  async get(userId) {
    if (!userId) return null;
    const snap = await getDoc(configDocRef(userId));
    if (!snap.exists()) return null;
    const data = snap.data() as Partial<LetterheadConfig>;
    if (!hasTemplateImage(data)) return null;

    const config = mapConfigFromFirestore(userId, data);
    const resolved = await resolveLetterheadImageSource(config);
    if (resolved.uri) {
      config.imageDataUri = resolved.uri;
    }
    return config;
  },

  async save(userId, patch) {
    if (!userId) throw new AppError("permission_denied", "Not signed in.");

    const now = Date.now();
    const snap = await getDoc(configDocRef(userId));
    const existingData = snap.exists()
      ? (snap.data() as Partial<LetterheadConfig>)
      : null;
    const existing = existingData ? mapConfigFromFirestore(userId, existingData) : null;

    const incomingImage = patch.imageDataUri?.trim() ?? "";
    const isDataUri = /^data:[^;]+;base64,/i.test(incomingImage);
    const isLocalFile =
      incomingImage.startsWith("file:") ||
      incomingImage.startsWith("content:") ||
      (incomingImage.startsWith("/") && !incomingImage.startsWith("//"));
    const hasNewImage = Boolean(incomingImage) && (isDataUri || isLocalFile);
    const useStorage = hasNewImage && isUserStorageAvailable();

    if (!useStorage && isDataUri) {
      const approxSize =
        incomingImage.length +
        (patch.signatureDataUri?.length ?? 0) +
        (patch.stampDataUri?.length ?? 0) +
        256;
      if (approxSize > APPROX_DOC_LIMIT_BYTES) {
        throw new AppError(
          "save_failed",
          "Letterhead image is too large. Try a smaller image (under ~700 KB)."
        );
      }
    } else {
      const approxSize =
        (patch.signatureDataUri?.length ?? 0) +
        (patch.stampDataUri?.length ?? 0) +
        256;
      if (approxSize > APPROX_DOC_LIMIT_BYTES) {
        throw new AppError(
          "save_failed",
          "Signature or stamp image is too large. Try a smaller image."
        );
      }
    }

    const isGeneratedSave =
      patch.sourceType === "generated_layout" && Boolean(patch.generatedLayout);

    let letterheadImageStoragePath =
      existing?.letterheadImageStoragePath ?? null;
    let letterheadImageDownloadUrl = existing?.letterheadImageDownloadUrl ?? null;
    let letterheadImageUpdatedAt = existing?.letterheadImageUpdatedAt ?? null;
    let imageDataUri: string | null | ReturnType<typeof deleteField> =
      hasNewImage
        ? incomingImage
        : existing?.imageDataUri || null;

    if (isGeneratedSave) {
      // Generated templates are layout + optional small logo — clear page image.
      letterheadImageStoragePath = null;
      letterheadImageDownloadUrl = null;
      letterheadImageUpdatedAt = null;
      imageDataUri = null;
    } else if (useStorage && incomingImage) {
      const uploaded = await uploadLetterheadImage(userId, incomingImage);
      letterheadImageStoragePath = uploaded.storagePath;
      letterheadImageDownloadUrl = uploaded.downloadUrl ?? null;
      letterheadImageUpdatedAt = now;
      imageDataUri = deleteField();
    }

    const next: LetterheadConfig = {
      ...patch,
      sourceType: isGeneratedSave
        ? "generated_layout"
        : patch.sourceType === "imported_image"
          ? "imported_image"
          : existing?.sourceType ?? "imported_image",
      generatedLayout: isGeneratedSave
        ? patch.generatedLayout ?? null
        : patch.sourceType === "imported_image"
          ? null
          : existing?.generatedLayout ?? null,
      signatureDataUri: patch.signatureDataUri ?? null,
      stampDataUri: patch.stampDataUri ?? null,
      defaultSenderName: patch.defaultSenderName ?? null,
      defaultSenderTitle: patch.defaultSenderTitle ?? null,
      defaultComplimentaryClose: patch.defaultComplimentaryClose ?? null,
      repeatTemplateAllPages: patch.repeatTemplateAllPages ?? true,
      userId,
      imageDataUri:
        typeof imageDataUri === "string" || imageDataUri == null
          ? imageDataUri
          : null,
      letterheadImageStoragePath,
      letterheadImageDownloadUrl,
      letterheadImageUpdatedAt,
      letterheadStorageMigratedAt: existing?.letterheadStorageMigratedAt ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const firestorePayload: Record<string, unknown> = { ...next };
    if (useStorage && incomingImage) {
      firestorePayload.imageDataUri = deleteField();
    }

    await setDoc(configDocRef(userId), firestorePayload, { merge: false });
    log.info("letterhead saved (firebase)");

    if (useStorage && letterheadImageDownloadUrl) {
      next.imageDataUri = letterheadImageDownloadUrl;
    } else if (typeof imageDataUri === "string") {
      next.imageDataUri = imageDataUri;
    }

    return next;
  },

  async remove(userId) {
    if (!userId) return;
    try {
      await deleteDoc(configDocRef(userId));
      log.info("letterhead removed (firebase)");
    } catch (e) {
      log.warn("remove failed", e);
      throw new AppError("delete_failed", "Could not remove letterhead.");
    }
  },
};
