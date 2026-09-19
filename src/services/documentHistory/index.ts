import type { BusinessEntry } from "@/domain/businessEntry";
import type { DocumentHistory, EditHistoryEntry, PdfGenerationHistoryEntry } from "@/domain/documentHistory";
import type { UpdateBusinessEntryInput } from "@/services/diary/types";
import type { BusinessEntryType } from "@/domain/businessEntry";
import { formatEntryDate } from "@/utils/date";
import { formatINR } from "@/utils/money/inr";
import { formatPdfGeneratedAt } from "@/services/pdf/pdfLayout";
import { escapeHtml } from "@/utils/escapeHtml";

export { createInitialDocumentHistory, normalizeDocumentHistory } from "./core";

export function recordPdfGeneration(
  history: DocumentHistory,
  generatedAt: number
): DocumentHistory {
  const versionNumber = history.versionNumber;
  const entry: PdfGenerationHistoryEntry = { generatedAt, versionNumber };
  return {
    ...history,
    firstGeneratedAt: history.firstGeneratedAt ?? generatedAt,
    lastGeneratedAt: generatedAt,
    pdfGenerationHistory: [...history.pdfGenerationHistory, entry],
  };
}

export function hasDocumentEdits(history: DocumentHistory): boolean {
  return history.editHistory.length > 0;
}

function formatEditFieldNames(fieldNames: string[], entryType?: BusinessEntryType): string {
  if (entryType === "business_cash_given") {
    const labels: Record<string, string> = {
      amount: "Amount",
      givenToName: "Paid to",
      purpose: "Purpose",
      paymentDate: "Cash paid date",
      entryDate: "Cash paid date",
      title: "Title",
      notes: "Notes",
    };
    return fieldNames.map((k) => labels[k] ?? k).join(", ");
  }
  return fieldNames.join(", ");
}

export function pdfDocumentHistoryHtml(
  history: DocumentHistory,
  labels: {
    sectionTitle: string;
    firstGenerated: string;
    lastEdited: string;
    version: string;
    changes: string;
  },
  locale = "en-IN",
  entryType?: BusinessEntryType
): string {
  if (!hasDocumentEdits(history)) return "";
  const firstGen = history.firstGeneratedAt
    ? formatPdfGeneratedAt(history.firstGeneratedAt, locale)
    : null;
  const lastEdit = history.lastEditedAt
    ? formatPdfGeneratedAt(history.lastEditedAt, locale)
    : null;
  const lastEditEntry = history.editHistory[history.editHistory.length - 1];
  const changeNames = lastEditEntry
    ? formatEditFieldNames(lastEditEntry.fieldNames, entryType)
    : "";

  const parts: string[] = [];
  if (firstGen) parts.push(`${labels.firstGenerated} ${firstGen}`);
  if (lastEdit) parts.push(`${labels.lastEdited} ${lastEdit}`);
  parts.push(`${labels.version} ${history.versionNumber}`);
  if (changeNames) parts.push(`${labels.changes}: ${changeNames}`);

  const narrative = escapeHtml(parts.join(". ") + ".");

  return `<div class="pdf-document-history">
    <div class="pdf-document-history-title">${escapeHtml(labels.sectionTitle)}</div>
    <p class="pdf-document-history-narrative">${narrative}</p>
  </div>`;
}

function row(label: string, value: string): string {
  return `<tr><th>${escapeHtml(label)}</th><td>${value}</td></tr>`;
}

function maskAccount(num: string): string {
  const digits = num.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `****${digits.slice(-4)}`;
}

function paymentPayloadLines(p: Record<string, unknown>): string[] {
  const lines: string[] = [];
  if (p.partyName) lines.push(`Party: ${p.partyName}`);
  if (p.invoiceNumber) lines.push(`Invoice: ${p.invoiceNumber}`);
  if (p.pendingAmount != null) lines.push(`Pending: ${formatINR(Number(p.pendingAmount))}`);
  if (p.invoiceDate) lines.push(`Invoice date: ${formatEntryDate(Number(p.invoiceDate))}`);
  if (p.dueDate) lines.push(`Due: ${formatEntryDate(Number(p.dueDate))}`);
  if (p.contactPerson) lines.push(`Contact: ${p.contactPerson}`);
  if (p.requestNote) lines.push(`Note: ${String(p.requestNote).slice(0, 120)}`);
  if (p.includeBankDetailsInPdf && p.bankDetails) {
    const b = p.bankDetails as Record<string, unknown>;
    if (b.bankName) lines.push(`Bank: ${b.bankName}`);
    if (b.accountNumber) lines.push(`A/c: ${maskAccount(String(b.accountNumber))}`);
  }
  return lines;
}

function cashPayloadLines(p: Record<string, unknown>): string[] {
  const lines: string[] = [];
  if (p.amount != null) lines.push(`Amount: ${formatINR(Number(p.amount))}`);
  if (p.givenToName) lines.push(`Paid to: ${p.givenToName}`);
  if (p.purpose) lines.push(`Purpose: ${String(p.purpose).slice(0, 120)}`);
  if (p.paymentDate) lines.push(`Cash paid: ${formatEntryDate(Number(p.paymentDate))}`);
  return lines;
}

function genericPayloadLines(entryType: string, p: Record<string, unknown>): string[] {
  if (entryType === "business_cash_given") return cashPayloadLines(p);
  if (entryType === "payment_request") return paymentPayloadLines(p);
  const skip = new Set(["linkedDispatchUpdatedAt"]);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(p)) {
    if (skip.has(k) || v == null || v === "") continue;
    if (typeof v === "object") continue;
    lines.push(`${k}: ${String(v).slice(0, 80)}`);
  }
  return lines.slice(0, 12);
}

export function buildBusinessEntryEditDiff(
  before: BusinessEntry,
  after: BusinessEntry
): Omit<EditHistoryEntry, "editedAt" | "versionNumber"> | null {
  const fieldNames: string[] = [];
  if (before.title !== after.title) fieldNames.push("title");
  if (before.entryDate !== after.entryDate) fieldNames.push("entryDate");
  if ((before.notes ?? "") !== (after.notes ?? "")) fieldNames.push("notes");

  const bp = before.payload as unknown as Record<string, unknown>;
  const ap = after.payload as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(bp), ...Object.keys(ap)]);
  for (const k of keys) {
    if (JSON.stringify(bp[k]) !== JSON.stringify(ap[k])) {
      fieldNames.push(k);
    }
  }

  if (fieldNames.length === 0) return null;

  let changedFields = fieldNames;
  if (
    before.entryType === "business_cash_given" &&
    changedFields.includes("paymentDate") &&
    changedFields.includes("entryDate")
  ) {
    changedFields = changedFields.filter((k) => k !== "entryDate");
  }

  const displayNames = changedFields.map((k) =>
    before.entryType === "business_cash_given"
      ? formatEditFieldNames([k], before.entryType)
      : k
  );

  const prevLines = [...genericPayloadLines(before.entryType, bp)];
  const nextLines = [...genericPayloadLines(after.entryType, ap)];
  if (before.title !== after.title) {
    prevLines.unshift(`Title: ${before.title}`);
    nextLines.unshift(`Title: ${after.title}`);
  }

  return {
    fieldNames: displayNames,
    previousSummary: prevLines.slice(0, 6).join("; ") || "—",
    newSummary: nextLines.slice(0, 6).join("; ") || "—",
  };
}

export function applyBusinessEntryEditAudit(
  existing: BusinessEntry,
  input: UpdateBusinessEntryInput
): BusinessEntry {
  const now = Date.now();
  const next: BusinessEntry = {
    ...existing,
    title: input.title?.trim() ?? existing.title,
    entryDate: input.entryDate ?? existing.entryDate,
    notes: input.notes === undefined ? existing.notes : input.notes?.trim() || null,
    location: input.location === undefined ? existing.location : input.location,
    attachments: input.attachments ?? existing.attachments,
    payload: input.payload ?? existing.payload,
    status: input.status ?? existing.status,
    reminder: input.reminder === undefined ? existing.reminder : input.reminder,
    pdfUri: input.pdfUri === undefined ? existing.pdfUri : input.pdfUri,
    updatedAt: now,
    documentHistory: existing.documentHistory,
  };

  const diff = buildBusinessEntryEditDiff(existing, next);
  if (!diff) return next;

  const newVersion = existing.documentHistory.versionNumber + 1;
  const editEntry: EditHistoryEntry = {
    editedAt: now,
    versionNumber: newVersion,
    editedByUeid: existing.ueid,
    ...diff,
  };

  return {
    ...next,
    documentHistory: {
      ...existing.documentHistory,
      lastEditedAt: now,
      versionNumber: newVersion,
      editHistory: [...existing.documentHistory.editHistory, editEntry],
    },
  };
}
