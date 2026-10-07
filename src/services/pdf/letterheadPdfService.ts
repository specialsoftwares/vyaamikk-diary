/**
 * Letterhead PDF composition service — resolves Storage-backed images then
 * delegates to the pure HTML composer (`letterheadPdfHtml`).
 */

import type {
  LetterheadConfig,
  LetterheadDocumentInput,
} from "@/services/letterhead";
import { resolveLetterheadImageSource } from "@/services/letterhead/letterheadImageResolver";

import { assertEnglishOnlyPdf, clearEnglishOnlyPdfContext } from "@/services/pdf/pdfLabels";

import {
  composeLetterheadHtml,
  type LetterheadPdfLabels,
} from "./letterheadPdfHtml";

export type { LetterheadPdfLabels } from "./letterheadPdfHtml";

export interface BuildLetterheadHtmlInput {
  config: LetterheadConfig;
  doc: LetterheadDocumentInput;
  labels: LetterheadPdfLabels;
  locale?: "en-IN" | "hi-IN";
}

export interface BuildLetterheadHtmlResult {
  html: string;
  warnings: string[];
}

export async function buildLetterheadHtml(
  input: BuildLetterheadHtmlInput
): Promise<BuildLetterheadHtmlResult> {
  assertEnglishOnlyPdf("letterheadPdfService");
  try {
    const isGenerated =
      input.config.sourceType === "generated_layout" &&
      Boolean(input.config.generatedLayout);
    const { uri: templateSrc } = isGenerated
      ? { uri: null as string | null }
      : await resolveLetterheadImageSource(input.config);
    return composeLetterheadHtml({
      ...input,
      templateSrc,
    });
  } finally {
    clearEnglishOnlyPdfContext();
  }
}
