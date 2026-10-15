import type { DocumentRevision } from "@/services/attachments/preparedReceiptPhoto";
import { documentRevisionKey } from "@/services/attachments/cashVoucherRevision";

const readyKeyByEntry = new Map<string, string>();
const renderInFlight = new Set<string>();

export function markPdfRevisionReady(entryId: string, revision: DocumentRevision): void {
  readyKeyByEntry.set(entryId, documentRevisionKey(revision));
}

export function pdfRevisionReadyKey(entryId: string): string | null {
  return readyKeyByEntry.get(entryId) ?? null;
}

export function canShareDocumentRevision(input: {
  pdfUri: string | null | undefined;
  readyKey: string | null | undefined;
  expectedKey: string;
}): boolean {
  return Boolean(input.pdfUri && input.readyKey && input.readyKey === input.expectedKey);
}

export function beginPdfRender(entryId: string): boolean {
  if (renderInFlight.has(entryId)) return false;
  renderInFlight.add(entryId);
  return true;
}

export function endPdfRender(entryId: string): void {
  renderInFlight.delete(entryId);
}

export function isPdfRenderInFlight(entryId: string): boolean {
  return renderInFlight.has(entryId);
}

export function resetPdfRevisionGateForTests(): void {
  readyKeyByEntry.clear();
  renderInFlight.clear();
}
