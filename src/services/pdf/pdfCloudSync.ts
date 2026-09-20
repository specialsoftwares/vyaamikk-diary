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

function omitUndefinedDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitUndefinedDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (nested === undefined) continue;
      out[key] = omitUndefinedDeep(nested);
    }
    return out;
  }
  return value;
}

export function letterheadDocToCloudStorage(
  doc: Omit<LetterheadDocument, "id"> | LetterheadDocument
): Record<string, unknown> {
  const { pdfUri: _omit, ...rest } = doc;
  return omitUndefinedDeep({ ...rest, pdfUri: null }) as Record<string, unknown>;
}
