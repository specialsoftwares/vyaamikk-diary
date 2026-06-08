/**
 * Ensures PDF file URIs are never written to remote backends.
 * Only document metadata (timestamps, version history) may sync.
 */

import type { BusinessEntry } from "@/domain/businessEntry";
import type { LetterheadDocument } from "@/services/letterhead/types";
import type { ProfessionalServicePack } from "@/domain/professionalPack";

import { entryToStorage } from "@/services/diary/normalize";
import { packToStorage } from "@/services/professionalPack/normalize";

/** Strip device-local PDF path before Firestore / shared-dev sync. */
export function entryToCloudStorage(entry: BusinessEntry): Record<string, unknown> {
  const stored = entryToStorage(entry);
  stored.pdfUri = null;
  return stored;
}

export function packToCloudStorage(pack: ProfessionalServicePack): Record<string, unknown> {
  const stored = packToStorage(pack);
  stored.pdfUri = null;
  return stored;
}

export function letterheadDocToCloudStorage(
  doc: Omit<LetterheadDocument, "id"> | LetterheadDocument
): Record<string, unknown> {
  const { pdfUri: _omit, ...rest } = doc;
  return { ...rest, pdfUri: null };
}
