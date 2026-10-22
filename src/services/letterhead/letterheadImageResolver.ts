import type { LetterheadConfig } from "./types";
import { getActiveBackend } from "@/config/env";
import { shouldSealProductionWrites } from "@/constants/contentSeal";
import { getDownloadUrlForPath, readProtectedLocalUri } from "@/services/storage/userStorage";

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
  if (storagePath && shouldSealProductionWrites(getActiveBackend())) {
    const opened = await readProtectedLocalUri(storagePath);
    if (opened.kind === "opened") return { uri: opened.uri, source: "storage" };
    if (opened.kind === "unavailable") return { uri: null, source: "storage" };
  }
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
