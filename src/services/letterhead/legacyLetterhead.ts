/**
 * Read-only compatibility for letters and drafts saved before Letterhead
 * creation was removed. This does not create, edit, or generate a PDF.
 */

import type { LetterheadDocumentInput } from "./types";

export type StoredPdfState = "none" | "missing" | "present";

export function classifyStoredPdf(pdfUri: string | null | undefined, fileExists: boolean): StoredPdfState {
  if (!pdfUri || !pdfUri.trim()) return "none";
  return fileExists ? "present" : "missing";
}

/** Old editor routes must land on the saved-letter list, never a blank editor. */
export function retiredLetterheadFallsBackToHistory(leaf: string | undefined): boolean {
  return leaf === "letterhead" || leaf === "index" || leaf === "setup" || leaf === "generate" || !leaf;
}

export function legacyReaderParams(params: {
  draftId?: string;
  documentId?: string;
  editDocId?: string;
}): { draftId?: string; documentId?: string } {
  const documentId = params.documentId?.trim() || params.editDocId?.trim() || undefined;
  const draftId = params.draftId?.trim() || undefined;
  return { draftId, documentId };
}

export function legacyLetterVisibleTo(recordUserId: string, sessionUserId: string): boolean {
  return recordUserId.length > 0 && recordUserId === sessionUserId;
}

/** Text already stored on the letter. Does not read the live template or logo. */
export function legacyLetterFields(input: LetterheadDocumentInput): { key: string; value: string }[] {
  const rows: { key: string; value: string }[] = [
    { key: "title", value: input.title ?? "" },
    { key: "reference", value: input.reference ?? "" },
    { key: "recipientName", value: input.recipientName ?? "" },
    { key: "recipientDesignation", value: input.recipientDesignation ?? "" },
    { key: "recipientCompany", value: input.recipientCompany ?? "" },
    { key: "recipientAddress", value: input.recipientAddress ?? "" },
    { key: "subject", value: input.subject ?? "" },
    { key: "salutation", value: input.salutation ?? "" },
    { key: "body", value: input.body ?? "" },
    { key: "closing", value: input.closing ?? "" },
    { key: "name", value: input.name ?? "" },
    { key: "designation", value: input.designation ?? "" },
    { key: "place", value: input.place ?? "" },
  ];
  return rows.filter((row) => row.value.trim().length > 0);
}
