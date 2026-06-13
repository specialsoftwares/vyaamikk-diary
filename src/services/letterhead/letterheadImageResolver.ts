import type { LetterheadConfig } from "./types";
import { getDownloadUrlForPath } from "@/services/storage/userStorage";

export type LetterheadImageSourceKind = "storage" | "base64" | null;

export interface ResolvedLetterheadImage {
  uri: string | null;
  source: LetterheadImageSourceKind;
}

type LetterheadImageFields = Pick<
  LetterheadConfig,
  "imageDataUri" | "letterheadImageStoragePath" | "letterheadImageDownloadUrl"
>;

/**
 * Resolve the best URI for rendering a letterhead template image.
 * Prefers Firebase Storage; falls back to legacy inline base64.
 */
export async function resolveLetterheadImageSource(
  config: LetterheadImageFields
): Promise<ResolvedLetterheadImage> {
  const storagePath = config.letterheadImageStoragePath?.trim();
  if (storagePath) {
    const cached = config.letterheadImageDownloadUrl?.trim();
    if (cached) {
      return { uri: cached, source: "storage" };
    }
    const url = await getDownloadUrlForPath(storagePath);
    if (url) {
      return { uri: url, source: "storage" };
    }
    return { uri: null, source: "storage" };
  }

  const legacy = config.imageDataUri?.trim();
  if (legacy) {
    return { uri: legacy, source: "base64" };
  }

  return { uri: null, source: null };
}
