/** Shared visual tokens for Vyaamikk business PDFs (non-letterhead, non-PO). */

export const PDF_ATTRIBUTION = "Created using Vyaamikk Diary.";

export const PDF_COLORS = {
  ink: "#0f1226",
  inkMuted: "#5c5f7a",
  inkSubtle: "#9ca3af",
  brand: "#3b41c5",
  brandDark: "#2a2f9a",
  border: "#e6e8f0",
  surface: "#f8f9fc",
  surfaceAccent: "#f3f4fb",
  white: "#ffffff",
} as const;

/** Core document CSS — imported by pdfPageStyles and standalone builders (e.g. Customer Credit). */
export const PDF_THEME_CSS = `
  .pdf-doc { width: 100%; }
  .pdf-doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12pt;
    padding-bottom: 10pt;
    margin-bottom: 12pt;
    border-bottom: 1.5pt solid ${PDF_COLORS.brand};
  }
  .pdf-doc-header-main { flex: 1; min-width: 0; }
  .pdf-doc-type {
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.55pt;
    color: ${PDF_COLORS.inkMuted};
    margin-bottom: 3pt;
  }
  .pdf-doc-title {
    font-size: 15pt;
    font-weight: 700;
    color: ${PDF_COLORS.brandDark};
    line-height: 1.25;
    margin: 0;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  .pdf-doc-meta {
    text-align: right;
    font-size: 8.5pt;
    color: ${PDF_COLORS.inkMuted};
    flex-shrink: 0;
    line-height: 1.45;
  }
  .pdf-doc-meta strong {
    display: block;
    font-size: 9pt;
    color: ${PDF_COLORS.ink};
    font-weight: 700;
  }
  .pdf-status-chip {
    display: inline-block;
    margin-top: 4pt;
    padding: 2pt 8pt;
    border-radius: 10pt;
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.35pt;
    background: ${PDF_COLORS.surfaceAccent};
    color: ${PDF_COLORS.brandDark};
  }
  .pdf-issuer {
    display: flex;
    align-items: flex-start;
    gap: 10pt;
    margin-bottom: 12pt;
    padding: 8pt 10pt;
    background: ${PDF_COLORS.surface};
    border: 1pt solid ${PDF_COLORS.border};
    border-radius: 4pt;
  }
  .pdf-issuer-logo {
    width: 44pt;
    height: 44pt;
    object-fit: contain;
    border-radius: 4pt;
    flex-shrink: 0;
  }
  .pdf-issuer-body { flex: 1; min-width: 0; }
  .pdf-issuer-label {
    font-size: 7pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5pt;
    color: ${PDF_COLORS.inkMuted};
    margin-bottom: 2pt;
  }
  .pdf-issuer-name {
    font-size: 10.5pt;
    font-weight: 700;
    color: ${PDF_COLORS.ink};
    word-wrap: break-word;
  }
  .pdf-issuer-line {
    font-size: 8.5pt;
    color: ${PDF_COLORS.inkMuted};
    margin-top: 1pt;
    word-wrap: break-word;
  }
  .pdf-key-facts {
    margin-bottom: 12pt;
    padding: 8pt 10pt;
    background: ${PDF_COLORS.surfaceAccent};
    border: 1pt solid ${PDF_COLORS.border};
    border-radius: 4pt;
    page-break-inside: avoid;
  }
  .pdf-key-facts-title {
    font-size: 7pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5pt;
    color: ${PDF_COLORS.brand};
    margin-bottom: 6pt;
  }
  .pdf-key-facts-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4pt 12pt;
  }
  .pdf-key-fact {
    font-size: 8.5pt;
    line-height: 1.4;
    min-width: 0;
  }
  .pdf-key-fact .k {
    display: block;
    font-size: 7pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3pt;
    color: ${PDF_COLORS.inkMuted};
    margin-bottom: 1pt;
  }
  .pdf-key-fact .v {
    color: ${PDF_COLORS.ink};
    font-weight: 600;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  .pdf-section {
    margin-top: 10pt;
    page-break-inside: avoid;
  }
  .pdf-section-label {
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5pt;
    color: ${PDF_COLORS.brand};
    margin-bottom: 4pt;
    padding-bottom: 2pt;
    border-bottom: 1pt solid ${PDF_COLORS.border};
  }
  .pdf-brief-note {
    margin-top: 10pt;
    padding: 6pt 8pt;
    font-size: 8pt;
    color: ${PDF_COLORS.inkMuted};
    border-left: 2pt solid ${PDF_COLORS.border};
    line-height: 1.4;
  }
  .pdf-route-line {
    font-size: 9.5pt;
    font-weight: 600;
    color: ${PDF_COLORS.ink};
    margin: 2pt 0 6pt;
    word-wrap: break-word;
  }
`;
