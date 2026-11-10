import type { LetterheadConfig } from "./types";
import { getActiveBackend } from "@/config/env";
import { shouldOpenContentSeals } from "@/constants/contentSeal";
import { readOwnedObject, readProtectedLocalUri } from "@/services/storage/userStorage";

export type LetterheadImageSourceKind = "storage" | "base64" | null;

export interface ResolvedLetterheadImage {
  uri: string | null;
  source: LetterheadImageSourceKind;
  /** Milliseconds when a storage ticket stops working. Absent for a local image. */
  expiresAt?: number;
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
  if (storagePath && shouldOpenContentSeals(getActiveBackend())) {
    const opened = await readProtectedLocalUri(storagePath);
    if (opened.kind === "opened") return { uri: opened.uri, source: "storage" };
    if (opened.kind === "unavailable") return { uri: null, source: "storage" };
  }
  if (storagePath) {
    const opened = await readOwnedObject(storagePath);
    if (opened.ok) {
      return { uri: opened.ticket.url, source: "storage", expiresAt: opened.ticket.expiresAt };
    }
    return { uri: null, source: "storage" };
  }

  const legacy = config.imageDataUri?.trim();
  if (legacy) {
    return { uri: legacy, source: "base64" };
  }

  return { uri: null, source: null };
}
