import { escapeHtml } from "@/utils/escapeHtml";

export interface PdfKeyValue {
  label: string;
  value: string | null | undefined;
}

export function pdfHasContent(rows: string): boolean {
  return rows.replace(/\s+/g, "") !== "";
}

export function pdfKvRow(label: string, value: string | null | undefined): string {
  if (value == null || String(value).trim() === "") return "";
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(String(value))}</td></tr>`;
}

export function pdfMetaTable(rows: string): string {
  if (!pdfHasContent(rows)) return "";
  return `<table class="meta meta-compact">${rows}</table>`;
}

export function pdfSection(title: string, rows: string): string {
  if (!pdfHasContent(rows)) return "";
  return `<div class="pdf-section">
    <div class="pdf-section-label">${escapeHtml(title)}</div>
    ${pdfMetaTable(rows)}
  </div>`;
}

export function pdfKeyFactsBlock(title: string, facts: PdfKeyValue[]): string {
  const cells = facts
    .filter((f) => f.value != null && String(f.value).trim() !== "")
    .map(
      (f) =>
        `<div class="pdf-key-fact"><span class="k">${escapeHtml(f.label)}</span><span class="v">${escapeHtml(String(f.value))}</span></div>`
    )
    .join("");
  if (!cells) return "";
  return `<div class="pdf-key-facts">
    <div class="pdf-key-facts-title">${escapeHtml(title)}</div>
    <div class="pdf-key-facts-grid">${cells}</div>
  </div>`;
}

export function pdfNotesBlock(title: string, text: string | null | undefined): string {
  const body = text?.trim();
  if (!body) return "";
  return `<div class="pdf-section">
    <div class="pdf-section-label">${escapeHtml(title)}</div>
    <div class="notes notes-compact">${escapeHtml(body)}</div>
  </div>`;
}

export function pdfBriefNote(text: string): string {
  return `<div class="pdf-brief-note">${escapeHtml(text)}</div>`;
}
