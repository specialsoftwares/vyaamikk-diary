/**
 * GRIN PDF adapter. Reuses pdfGenerateHook / pdfService.
 * Does not rewrite the diary, purchase-order, or credit PDF coordinator.
 */

import { pdfGenerateHook } from "@/services/pdf/pdfGenerateHook";
import { pdfService } from "@/services/pdf/pdfService";
import type { GrinApplicationPackExport } from "@/services/grin/repository";
import {
  buildGrinPackHtml,
  buildGrinReceiptHtml,
  grinPdfLabelsFromT,
  type GrinPdfLabels,
  type GrinPdfReceiptSource,
} from "./grinPdfTemplate";

export async function generateGrinReceiptPdf(input: {
  record: GrinPdfReceiptSource;
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale?: "en-IN" | "hi-IN";
  labels?: GrinPdfLabels;
}): Promise<{ uri: string; fileName: string }> {
  const labels = input.labels ?? grinPdfLabelsFromT(input.t);
  const html = buildGrinReceiptHtml({
    record: input.record,
    labels,
    locale: input.locale,
  });
  const fileNameHint = input.record.effective.issuedNumber ?? input.record.receiptId;
  const hooked = pdfGenerateHook();
  if (hooked) return hooked({ html, fileNameHint });
  return pdfService.generate({ html, fileNameHint });
}

export async function generateGrinPackPdf(input: {
  record: GrinPdfReceiptSource;
  pack: GrinApplicationPackExport;
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale?: "en-IN" | "hi-IN";
  labels?: GrinPdfLabels;
}): Promise<{ uri: string; fileName: string }> {
  const labels = input.labels ?? grinPdfLabelsFromT(input.t);
  const html = buildGrinPackHtml({
    record: input.record,
    pack: input.pack,
    labels,
    locale: input.locale,
  });
  const completeness = input.pack.completenessLabel === "complete" ? "complete" : "incomplete";
  const fileNameHint = `${input.record.receiptId}-evidence-pack-${completeness}`;
  const hooked = pdfGenerateHook();
  if (hooked) return hooked({ html, fileNameHint });
  return pdfService.generate({ html, fileNameHint });
}

export { grinPdfLabelsFromT, buildGrinReceiptHtml, buildGrinPackHtml };
export type { GrinPdfLabels, GrinPdfReceiptSource };
