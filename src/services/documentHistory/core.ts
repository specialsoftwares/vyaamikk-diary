import type {
  DocumentHistory,
  EditHistoryEntry,
  PdfGenerationHistoryEntry,
} from "@/domain/documentHistory";
import { emptyDocumentHistory } from "@/domain/documentHistory";

/** Node-safe history parse. PDF layout / React Native stay out of this module. */
export function normalizeDocumentHistory(raw: unknown): DocumentHistory {
  if (!raw || typeof raw !== "object") return emptyDocumentHistory();
  const r = raw as Record<string, unknown>;
  const editHistory = Array.isArray(r.editHistory)
    ? (r.editHistory as EditHistoryEntry[]).filter(
        (e) => e && typeof e.editedAt === "number" && Array.isArray(e.fieldNames)
      )
    : [];
  const pdfGenerationHistory = Array.isArray(r.pdfGenerationHistory)
    ? (r.pdfGenerationHistory as PdfGenerationHistoryEntry[]).filter(
        (e) => e && typeof e.generatedAt === "number"
      )
    : [];
  return {
    firstGeneratedAt:
      r.firstGeneratedAt == null ? null : Number(r.firstGeneratedAt),
    lastGeneratedAt: r.lastGeneratedAt == null ? null : Number(r.lastGeneratedAt),
    lastEditedAt: r.lastEditedAt == null ? null : Number(r.lastEditedAt),
    versionNumber: Math.max(1, Number(r.versionNumber) || 1),
    editHistory,
    pdfGenerationHistory,
  };
}

export function createInitialDocumentHistory(): DocumentHistory {
  return emptyDocumentHistory();
}
