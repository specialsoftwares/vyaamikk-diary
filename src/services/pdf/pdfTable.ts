import { escapeHtml } from "@/utils/escapeHtml";

export interface PdfTableColumn {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  width?: string;
}

export function pdfDataTable(
  columns: PdfTableColumn[],
  rows: Array<Record<string, string | number | null | undefined>>
): string {
  if (rows.length === 0) return "";
  const head = columns
    .map((c) => {
      const cls = [
        c.align === "right" ? "pdf-t-right" : "",
        c.align === "center" ? "pdf-t-center" : "",
        c.width ? `pdf-t-w-${c.key}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<th${cls ? ` class="${cls}"` : ""}${c.width ? ` style="width:${c.width}"` : ""}>${escapeHtml(c.label)}</th>`;
    })
    .join("");
  const body = rows
    .map((row) => {
      const cells = columns
        .map((c) => {
          const raw = row[c.key];
          const val = raw == null ? "" : String(raw);
          const cls = c.align === "right" ? ' class="pdf-t-right"' : c.align === "center" ? ' class="pdf-t-center"' : "";
          return `<td${cls}>${escapeHtml(val)}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table class="pdf-data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export const PDF_TABLE_CSS = `
  table.pdf-data-table {
    width: 100%;
    border-collapse: collapse;
    margin: 4pt 0 8pt;
    table-layout: fixed;
  }
  table.pdf-data-table th {
    background: #f3f4fb;
    color: #3b41c5;
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3pt;
    text-align: left;
    padding: 5pt 6pt;
    border: 1pt solid #e6e8f0;
    vertical-align: top;
  }
  table.pdf-data-table td {
    padding: 5pt 6pt;
    border: 1pt solid #e6e8f0;
    font-size: 8.5pt;
    color: #0f1226;
    vertical-align: top;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  table.pdf-data-table tr { page-break-inside: avoid; }
  .pdf-t-right { text-align: right; }
  .pdf-t-center { text-align: center; }
`;
