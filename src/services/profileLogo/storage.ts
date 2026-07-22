import * as FileSystem from "expo-file-system/legacy";

import { AppError } from "@/domain/errors";
import type { ProfileLogoRef } from "@/domain/types";
import { createLogger } from "@/utils/logger";

const log = createLogger("profileLogo");

/** ~512 KB decoded — keeps PDFs and profile docs light. */
export const MAX_PROFILE_LOGO_BYTES = 512 * 1024;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface PickedLogoAsset {
  uri: string;
  base64?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
}

function logoPath(uid: string, ext: string): string {
  const base = FileSystem.documentDirectory ?? "";
  return `${base}profile-logos/${uid}.${ext}`;
}

function extFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

async function ensureDir(): Promise<void> {
  const dir = `${FileSystem.documentDirectory ?? ""}profile-logos`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

async function deleteIfExists(uri: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (e) {
    log.warn("delete logo file", e);
  }
}

/**
 * Copy or write picker output to a stable document-directory file.
 * Throws on oversize / unsupported type — never pretends success.
 */
export async function persistProfileLogoFromPicker(
  uid: string,
  asset: PickedLogoAsset
): Promise<ProfileLogoRef> {
  const mime =
    asset.mimeType ??
    (asset.fileName?.toLowerCase().endsWith(".png")
      ? "image/png"
      : asset.fileName?.toLowerCase().endsWith(".webp")
        ? "image/webp"
        : "image/jpeg");

  if (!ALLOWED_MIME.has(mime)) {
    if (mime.includes("heic") || mime.includes("heif")) {
      throw new AppError(
        "unknown",
        "HEIC images could not be processed. Please choose a JPG or PNG."
      );
    }
    throw new AppError("unknown", "Unsupported image type. Use JPEG or PNG.");
  }

  if (asset.base64) {
    const approxBytes = Math.ceil((asset.base64.length * 3) / 4);
    if (approxBytes > MAX_PROFILE_LOGO_BYTES) {
      throw new AppError(
        "unknown",
        "Image is too large. Please choose a smaller logo (under 500 KB)."
      );
    }
  }

  await ensureDir();
  const ext = extFromMime(mime);
  const dest = logoPath(uid, ext);
  await deleteIfExists(dest);

  if (asset.base64) {
    await FileSystem.writeAsStringAsync(dest, asset.base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } else if (asset.uri) {
    await FileSystem.copyAsync({ from: asset.uri, to: dest });
    const info = await FileSystem.getInfoAsync(dest);
    if (info.exists && "size" in info && info.size != null && info.size > MAX_PROFILE_LOGO_BYTES) {
      await deleteIfExists(dest);
      throw new AppError(
        "unknown",
        "Image is too large. Please choose a smaller logo (under 500 KB)."
      );
    }
  } else {
    throw new AppError("unknown", "Could not read the selected image.");
  }

  const verify = await FileSystem.getInfoAsync(dest);
  if (!verify.exists) {
    throw new AppError("unknown", "Logo file could not be saved.");
  }

  return {
    localUri: dest,
    mimeType: mime,
    updatedAt: Date.now(),
  };
}

export async function removeProfileLogoFile(ref: ProfileLogoRef | null): Promise<void> {
  if (!ref?.localUri) return;
  await deleteIfExists(ref.localUri);
}

/** Read logo for PDF embedding; returns null if file missing or unreadable. */
export async function readProfileLogoDataUri(ref: ProfileLogoRef): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(ref.localUri);
    if (!info.exists) return null;
    const base64 = await FileSystem.readAsStringAsync(ref.localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!base64) return null;
    return `data:${ref.mimeType};base64,${base64}`;
  } catch (e) {
    log.warn("readProfileLogoDataUri", e);
    return null;
  }
}

export function profileLogoInitials(
  displayName: string | null,
  businessName: string | null,
  fallback: string
): string {
  const source = (businessName?.trim() || displayName?.trim() || fallback).trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}
