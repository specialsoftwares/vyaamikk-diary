import type { BusinessEntry } from "@/domain/businessEntry";
import {
  applyBusinessEntryEditAudit,
  recordPdfGeneration,
} from "@/services/documentHistory";
import type { UpdateBusinessEntryInput } from "./types";

/** User-facing field patch with immutable audit trail applied. */
export function mergeBusinessEntryUpdate(
  existing: BusinessEntry,
  input: UpdateBusinessEntryInput
): BusinessEntry {
  return applyBusinessEntryEditAudit(existing, input);
}

/** After PDF is generated, attach URI and append generation history. */
export function mergeEntryPdfGeneration(
  entry: BusinessEntry,
  pdfUri: string,
  generatedAt = Date.now()
): BusinessEntry {
  return {
    ...entry,
    pdfUri,
    updatedAt: generatedAt,
    documentHistory: recordPdfGeneration(entry.documentHistory, generatedAt),
  };
}
