import type { PdfFileNameInput } from "./pdfFileNames";
import type { UserPdfBranding } from "./userPdfBranding";
import type { UserProfile } from "@/domain/types";

export type PdfGenerateTestInput = {
  html: string;
  fileNameHint: string;
  fileName?: PdfFileNameInput;
};

export type PdfGenerateTestResult = {
  uri: string;
  fileName: string;
};

export type PdfGenerateFn = (input: PdfGenerateTestInput) => Promise<PdfGenerateTestResult>;

export type PdfBrandingFn = (user: UserProfile) => Promise<UserPdfBranding> | UserPdfBranding;

let generateHook: PdfGenerateFn | null = null;
let brandingHook: PdfBrandingFn | null = null;

/** Node/CI seam. Production PDF generation still goes through pdfService. */
export function setPdfGenerateHookForTests(hook: PdfGenerateFn | null): void {
  generateHook = hook;
}

export function pdfGenerateHook(): PdfGenerateFn | null {
  return generateHook;
}

export function setPdfBrandingHookForTests(hook: PdfBrandingFn | null): void {
  brandingHook = hook;
}

export function pdfBrandingHook(): PdfBrandingFn | null {
  return brandingHook;
}
