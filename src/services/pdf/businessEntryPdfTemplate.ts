import type { BusinessEntry } from "@/domain/businessEntry";
import type { UserProfile } from "@/domain/types";
import type { Lang } from "@/i18n/types";
import { pdfLabel } from "@/services/pdf/pdfLabels";
import { pdfDocumentHistoryHtml } from "@/services/documentHistory";
import {
  buildBusinessEntryBody,
  buildBusinessEntryReminderBlock,
  businessEntryDocumentType,
  businessEntryPdfTitle,
} from "./businessEntryPdfBodies";
import { pdfDocumentHeader, pdfIssuerBlock } from "./pdfComponents";
import { buildPdfHtmlDocument } from "./pdfDocumentShell";
import { defaultPdfLegalFooterLabels, type PdfLegalFooterLabels } from "./pdfLegalFooter";
import { pdfNotesBlock } from "./pdfSections";
import type { UserPdfBranding } from "./userPdfBranding";

export function businessEntryPdfLabels(
  t: (key: string, vars?: Record<string, string | number>) => string,
  legal?: PdfLegalFooterLabels,
  uiLang?: Lang
): BusinessPdfLabels {
  if (uiLang === "gu") {
    return {
      profileTitle: t("pdf.userProfileTitle"),
      ueid: t("pdf.entryUeid"),
      userName: t("pdf.entryUserName"),
      business: t("pdf.entryBusiness"),
      entryDate: pdfLabel("date", { uiLang: "gu" }),
      notes: pdfLabel("notes", { uiLang: "gu" }),
      reminder: pdfLabel("reminder", { uiLang: "gu" }),
      detailsSection: pdfLabel("details", { uiLang: "gu" }),
      historySectionTitle: t("pdf.documentHistoryTitle"),
      historyFirstGenerated: t("pdf.historyFirstGenerated"),
      historyLastEdited: t("pdf.historyLastEdited"),
      historyVersion: t("pdf.historyVersion"),
      historyChanges: t("pdf.historyChanges"),
      legal,
    };
  }
  return {
    profileTitle: t("pdf.userProfileTitle"),
    ueid: t("pdf.entryUeid"),
    userName: t("pdf.entryUserName"),
    business: t("pdf.entryBusiness"),
    entryDate: t("pdf.entryEntryDate"),
    notes: t("pdf.entryNotesSection"),
    reminder: t("pdf.entryReminderSection"),
    detailsSection: t("pdf.entryDetailsSection"),
    historySectionTitle: t("pdf.documentHistoryTitle"),
    historyFirstGenerated: t("pdf.historyFirstGenerated"),
    historyLastEdited: t("pdf.historyLastEdited"),
    historyVersion: t("pdf.historyVersion"),
    historyChanges: t("pdf.historyChanges"),
    legal,
  };
}

export interface BusinessPdfLabels {
  entryDate: string;
  notes: string;
  reminder: string;
  detailsSection: string;
  profileTitle?: string;
  userName?: string;
  business?: string;
  ueid?: string;
  historySectionTitle: string;
  historyFirstGenerated: string;
  historyLastEdited: string;
  historyVersion: string;
  historyChanges: string;
  legal?: PdfLegalFooterLabels;
}

export function buildBusinessEntryPdfHtml(input: {
  entry: BusinessEntry;
  user: UserProfile;
  labels: BusinessPdfLabels;
  branding: UserPdfBranding;
  /** Data formatting locale — always en-IN for amounts/dates in PDF body. */
  locale?: "en-IN" | "hi-IN";
  extraCss?: string;
}): string {
  const { entry, labels, branding, extraCss } = input;
  const locale = "en-IN";
  const legal = labels.legal ?? defaultPdfLegalFooterLabels();
  const generatedAtMs = Date.now();
  const title = businessEntryPdfTitle(entry);
  const docType = businessEntryDocumentType(entry);
  const reference = entry.title?.trim() || null;

  const header = pdfDocumentHeader({
    title,
    documentType: docType,
    reference,
    recordDateMs: entry.entryDate,
    generatedAtMs,
    locale,
  });

  const issuer = pdfIssuerBlock({
    branding,
    issuerLabel: labels.profileTitle ?? "Issued by",
    showUeid: false,
  });

  const historyBlock = pdfDocumentHistoryHtml(
    entry.documentHistory,
    {
      sectionTitle: labels.historySectionTitle,
      firstGenerated: labels.historyFirstGenerated,
      lastEdited: labels.historyLastEdited,
      version: labels.historyVersion,
      changes: labels.historyChanges,
    },
    locale,
    entry.entryType
  );

  const body = buildBusinessEntryBody(
    entry,
    {
      notes: labels.notes,
      reminder: labels.reminder,
      detailsSection: labels.detailsSection,
      entryDate: labels.entryDate,
    },
    locale
  );

  const notesBlock =
    entry.notes && entry.notes.trim() && entry.entryType !== "payment_request"
      ? pdfNotesBlock(labels.notes, entry.notes)
      : "";

  const reminderBlock = buildBusinessEntryReminderBlock(entry, labels.reminder, locale);

  const contentHtml = `${header}${issuer}${historyBlock}${body}${notesBlock}${reminderBlock}`;

  return buildPdfHtmlDocument({
    locale,
    bodyHtml: contentHtml,
    extraCss,
    footer: {
      generatedAtMs,
      locale,
      pageLabel: legal.page,
      fixed: true,
      showGenerated: false,
    },
  });
}
