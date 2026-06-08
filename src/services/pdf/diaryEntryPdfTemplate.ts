/**
 * HTML template for legacy / generic diary entry PDF export.
 */

import type { BusinessEntry } from "@/domain/businessEntry";
import type { LegacyPayload } from "@/domain/businessEntry";
import type { UserProfile } from "@/domain/types";
import type { PdfLegalFooterLabels } from "./pdfLegalFooter";
import { pdfDocumentHeader, pdfIssuerBlock } from "./pdfComponents";
import { buildPdfHtmlDocument } from "./pdfDocumentShell";
import { formatPdfDate, formatPdfDateTime } from "./pdfDate";
import { pdfKeyFactsBlock, pdfKvRow, pdfNotesBlock, pdfSection } from "./pdfSections";
import type { UserPdfBranding } from "./userPdfBranding";
export interface BuildEntryPdfInput {
  entry: BusinessEntry;
  user: UserProfile;
  branding: UserPdfBranding;
  categoryLabel: string;
  labels: EntryPdfLabels;
  locale?: "en-IN" | "hi-IN";
  legal: PdfLegalFooterLabels;
}

export interface EntryPdfLabels {
  reportTitle: string;
  profileTitle?: string;
  userName: string;
  ueid: string;
  business: string;
  mobile: string;
  entrySection: string;
  title: string;
  category: string;
  entryDate: string;
  createdAt: string;
  updatedAt: string;
  metaSection: string;
  location: string;
  geo: string;
  quantity: string;
  issue: string;
  tags: string;
  notesSection: string;
  reminderSection: string;
  reminderTime: string;
  reminderNote: string;
}

export function buildEntryPdfHtml(input: BuildEntryPdfInput): string {
  const { entry, user, labels, branding, legal, locale = "en-IN" } = input;
  const generatedAtMs = Date.now();
  const legacy =
    entry.entryType === "legacy"
      ? (entry.payload as LegacyPayload)
      : ({
          category: entry.entryType,
          quantity: null,
          issue: null,
          tags: [],
          locationName: entry.location?.name ?? null,
          geo: entry.location?.geo ?? null,
        } as LegacyPayload);
  const locationName = legacy.locationName ?? entry.location?.name ?? null;
  const geo = legacy.geo ?? entry.location?.geo ?? null;
  const quantity = legacy.quantity;
  const issue = legacy.issue;
  const tags = legacy.tags ?? [];

  const keyFacts = [
    { label: labels.title, value: entry.title },
    { label: labels.category, value: input.categoryLabel },
    { label: labels.entryDate, value: formatPdfDate(entry.entryDate, locale) },
    { label: labels.createdAt, value: formatPdfDateTime(entry.createdAt, locale) },
  ];

  const metaRows =
    (locationName ? pdfKvRow(labels.location, locationName) : "") +
    (geo
      ? pdfKvRow(
          labels.geo,
          `${geo.latitude.toFixed(5)}, ${geo.longitude.toFixed(5)}` +
            (geo.accuracy != null ? ` (±${Math.round(geo.accuracy)} m)` : "")
        )
      : "") +
    (quantity ? pdfKvRow(labels.quantity, quantity) : "") +
    (issue ? pdfKvRow(labels.issue, issue) : "") +
    (tags.length > 0
      ? pdfKvRow(labels.tags, tags.map((tag: string) => `#${tag}`).join(", "))
      : "");

  const body = `
  ${pdfDocumentHeader({
    title: labels.reportTitle,
    documentType: "Diary Entry",
    reference: entry.title,
    recordDateMs: entry.entryDate,
    generatedAtMs,
    locale,
  })}
  ${pdfIssuerBlock({ branding, issuerLabel: labels.profileTitle, showUeid: false })}
  ${pdfKeyFactsBlock("Key details", keyFacts)}
  ${metaRows ? pdfSection(labels.metaSection, metaRows) : ""}
  ${pdfNotesBlock(labels.notesSection, entry.notes)}
  ${
    entry.reminder
      ? pdfSection(
          labels.reminderSection,
          pdfKvRow(labels.reminderTime, formatPdfDateTime(entry.reminder.at, locale)) +
            (entry.reminder.note ? pdfKvRow(labels.reminderNote, entry.reminder.note) : "")
        )
      : ""}`;

  return buildPdfHtmlDocument({
    locale,
    bodyHtml: body,
    footer: {
      generatedAtMs,
      locale,
      pageLabel: legal.page,
      fixed: true,
      showGenerated: false,
    },
  });
}
