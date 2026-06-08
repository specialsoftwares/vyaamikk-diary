/**
 * Immutable audit trail for PDF-capable records.
 * Users cannot edit this block via composer forms or update APIs.
 */

export interface EditHistoryEntry {
  editedAt: number;
  versionNumber: number;
  fieldNames: string[];
  previousSummary: string;
  newSummary: string;
  /** UEID on the entry at edit time (audit attribution). */
  editedByUeid?: string | null;
}

export interface PdfGenerationHistoryEntry {
  generatedAt: number;
  versionNumber: number;
}

export interface DocumentHistory {
  /** Set on first successful PDF generation — never cleared. */
  firstGeneratedAt: number | null;
  lastGeneratedAt: number | null;
  lastEditedAt: number | null;
  versionNumber: number;
  editHistory: EditHistoryEntry[];
  pdfGenerationHistory: PdfGenerationHistoryEntry[];
}

export function emptyDocumentHistory(): DocumentHistory {
  return {
    firstGeneratedAt: null,
    lastGeneratedAt: null,
    lastEditedAt: null,
    versionNumber: 1,
    editHistory: [],
    pdfGenerationHistory: [],
  };
}
