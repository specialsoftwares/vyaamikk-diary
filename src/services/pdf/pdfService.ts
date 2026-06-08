/**
 * Generic PDF generation + sharing wrapper.
 *
 * Screens NEVER touch expo-print / expo-sharing / expo-file-system
 * directly — they call into this service. That keeps:
 *   • the privacy boundary clean (no PDF content is ever logged here),
 *   • the file-system interaction in one place (cleanup, error mapping),
 *   • the failure modes typed via AppError so the UI can branch.
 *
 * Used by both `diaryEntryPdfTemplate.ts` (entry exports) and
 * `letterheadPdfService.ts` (letterhead documents).
 */

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
// SDK 54 shipped a new expo-file-system API; we stick with the documented
// legacy entrypoint for now — it has the simple cacheDirectory + copyAsync
// + deleteAsync surface we need without the new File/Paths model.
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import { AppError, toAppError } from "@/domain/errors";
import { createLogger } from "@/utils/logger";
import { safePdfLogMeta } from "@/utils/pdfSafeLog";

const log = createLogger("pdf");

export interface GeneratePdfInput {
  /** Full self-contained HTML document, including <!DOCTYPE html>. */
  html: string;
  /**
   * Human-friendly base name (no extension). Used as the share-sheet
   * filename. Sanitized internally.
   */
  fileNameHint: string;
}

export interface GeneratedPdf {
  /** file:// URI of the generated PDF on disk. */
  uri: string;
  /** Sanitized filename, e.g. "Vyaamikk-Diary-Entry-2026-05-31.pdf". */
  fileName: string;
}

function sanitizeFileName(input: string): string {
  const cleaned = input
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9-_ ]+/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return cleaned.length > 0 ? `${cleaned}.pdf` : `Vyaamikk-Diary.pdf`;
}

export const pdfService = {
  /**
   * Render an HTML string to an A4 PDF on disk. Returns the file URI +
   * sanitized filename. Does NOT log any HTML content.
   */
  async generate(input: GeneratePdfInput): Promise<GeneratedPdf> {
    if (!input.html || input.html.length === 0) {
      throw new AppError("save_failed", "PDF content is empty.");
    }
    try {
      // expo-print honors @page CSS for A4 sizing, but we also pass the
      // dimensions explicitly so the print resolution matches A4 exactly.
      // 595 x 842 points = A4 at 72dpi.
      const { uri } = await Print.printToFileAsync({
        html: input.html,
        base64: false,
        width: 595,
        height: 842,
        margins: { left: 0, top: 0, right: 0, bottom: 0 },
      });
      log.info(
        "pdf generated",
        safePdfLogMeta({ fileNameHint: input.fileNameHint })
      );
      return { uri, fileName: sanitizeFileName(input.fileNameHint) };
    } catch (e) {
      log.warn("pdf generate failed");
      throw toAppError(e, "save_failed");
    }
  },

  /**
   * Open the native share sheet with the given PDF. On Android we copy
   * the file with the friendly name first so the share sheet shows
   * "Vyaamikk-Diary-Entry-….pdf" instead of a random Print* name.
   */
  async share(pdf: GeneratedPdf): Promise<void> {
    if (!(await Sharing.isAvailableAsync())) {
      throw new AppError("save_failed", "Sharing is not available on this device.");
    }
    try {
      const shareUri = await prepareForShare(pdf);
      await Sharing.shareAsync(shareUri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: pdf.fileName,
      });
      log.info("pdf shared");
    } catch (e) {
      log.warn("pdf share failed");
      // User cancellation throws too — we treat it as a soft failure;
      // upper layers decide whether to surface it.
      throw toAppError(e, "unknown");
    }
  },

  /**
   * Convenience: generate then share in one call. Cleans up the
   * generated file on best-effort after sharing closes.
   */
  async generateAndShare(input: GeneratePdfInput): Promise<void> {
    const pdf = await this.generate(input);
    try {
      await this.share(pdf);
    } finally {
      // Best-effort cleanup; failures here are not user-actionable.
      void deleteSafe(pdf.uri);
    }
  },
};

async function prepareForShare(pdf: GeneratedPdf): Promise<string> {
  if (Platform.OS !== "android") return pdf.uri;
  try {
    const cacheDir = FileSystem.cacheDirectory ?? "";
    if (!cacheDir) return pdf.uri;
    const target = `${cacheDir}${pdf.fileName}`;
    // Remove an old copy if present so Sharing always sees the latest.
    await deleteSafe(target);
    await FileSystem.copyAsync({ from: pdf.uri, to: target });
    return target;
  } catch {
    return pdf.uri;
  }
}

async function deleteSafe(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Ignore — temp files are cleaned by the OS eventually.
  }
}
