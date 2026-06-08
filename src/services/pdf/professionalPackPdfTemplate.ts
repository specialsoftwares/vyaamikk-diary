import type { ProfessionalServicePack } from "@/domain/professionalPack";
import type { UserProfile } from "@/domain/types";
import type { Lang } from "@/i18n/types";
import { pdfLabel } from "@/services/pdf/pdfLabels";
import { formatINR } from "@/utils/money/inr";
import type { PdfLegalFooterLabels } from "./pdfLegalFooter";
import { pdfDocumentHeader, pdfIssuerBlock } from "./pdfComponents";
import { buildPdfHtmlDocument } from "./pdfDocumentShell";
import { formatPdfDate } from "./pdfDate";
import { pdfBriefNote, pdfKeyFactsBlock, pdfKvRow, pdfNotesBlock, pdfSection } from "./pdfSections";
import type { UserPdfBranding } from "./userPdfBranding";

const PRO_BRIEF_NOTE =
  "This is a user-created brief generated using Vyaamikk Diary.";

function row(label: string, value: string | null | undefined): string {
  return pdfKvRow(label, value);
}

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export function professionalPackPdfLabels(input: {
  t: TFn;
  uiLang?: Lang;
  reportTitle: string;
  matterType: string;
  category: string;
  legal: PdfLegalFooterLabels;
  profileTitle?: string;
}): ProfessionalPackPdfLabels {
  const { t, uiLang, reportTitle, matterType, category, legal, profileTitle } = input;
  const gu = uiLang === "gu";
  return {
    reportTitle,
    matterType,
    category,
    factsSection: t("proPack.pdf.factsSection"),
    linkedSection: t("proPack.pdf.linkedSection"),
    professionalSection: t("proPack.pdf.professionalSection"),
    notesSection: gu ? pdfLabel("notes", { uiLang: "gu" }) : t("proPack.pdf.notesSection"),
    disclaimer: t("proPack.pdf.disclaimer"),
    matterDate: gu ? pdfLabel("date", { uiLang: "gu" }) : t("proPack.pdf.matterDate"),
    dueDate: gu ? pdfLabel("dueDate", { uiLang: "gu" }) : t("proPack.pdf.dueDate"),
    status: gu ? pdfLabel("status", { uiLang: "gu" }) : t("proPack.pdf.status"),
    profileTitle,
    legal,
  };
}

export interface ProfessionalPackPdfLabels {
  reportTitle: string;
  matterType: string;
  category: string;
  factsSection: string;
  linkedSection: string;
  professionalSection: string;
  notesSection: string;
  disclaimer: string;
  matterDate: string;
  dueDate: string;
  status: string;
  profileTitle?: string;
  legal: PdfLegalFooterLabels;
}

export function buildProfessionalPackPdfHtml(input: {
  pack: ProfessionalServicePack;
  user: UserProfile;
  labels: ProfessionalPackPdfLabels;
  branding: UserPdfBranding;
  locale?: "en-IN" | "hi-IN";
  extraCss?: string;
}): string {
  const { pack, labels, branding, locale = "en-IN", extraCss = "" } = input;
  const formatLocale = "en-IN" as const;
  const generatedAtMs = Date.now();

  const keyFacts = [
    { label: "Brief type", value: labels.matterType },
    { label: "Category", value: labels.category },
    { label: labels.matterDate, value: formatPdfDate(pack.matterDate, formatLocale) },
    { label: labels.status, value: pack.status },
    ...(pack.dueDate
      ? [{ label: labels.dueDate, value: formatPdfDate(pack.dueDate, formatLocale) }]
      : []),
    { label: "Subject", value: pack.title },
  ];

  const factRows = Object.entries(pack.facts)
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => {
      const display =
        typeof v === "number" && /amount/i.test(k) ? formatINR(v) : String(v);
      return row(k, display);
    })
    .join("");

  const linkedBlock =
    pack.linkedEntryIds.length > 0
      ? pdfSection(
          labels.linkedSection,
          row("Linked records", pack.linkedEntryIds.join(", "))
        )
      : "";

  const profBlock =
    pack.professionalName || pack.professionalContact
      ? pdfSection(
          labels.professionalSection,
          row("Name", pack.professionalName) + row("Contact", pack.professionalContact)
        )
      : "";

  const body = `
  ${pdfDocumentHeader({
    title: labels.reportTitle,
    documentType: "Professional Brief",
    reference: pack.title,
    status: pack.status,
    recordDateMs: pack.matterDate,
    generatedAtMs,
    locale,
  })}
  ${pdfIssuerBlock({ branding, issuerLabel: labels.profileTitle, showUeid: false })}
  ${pdfKeyFactsBlock("Key details", keyFacts)}
  ${pdfSection(labels.factsSection, factRows)}
  ${linkedBlock}
  ${profBlock}
  ${pdfNotesBlock(labels.notesSection, pack.notes)}
  ${pdfBriefNote(PRO_BRIEF_NOTE)}`;

  return buildPdfHtmlDocument({
    locale: formatLocale,
    bodyHtml: body,
    extraCss,
    footer: {
      generatedAtMs,
      locale: formatLocale,
      pageLabel: labels.legal.page,
      fixed: true,
      showGenerated: false,
    },
  });
}
