/**
 * Platform-neutral document-scanner boundary for letterhead import.
 *
 * Android: Google ML Kit Document Scanner (preferred).
 * iOS: not claimed supported here — return `unavailable` so callers fall back
 * to gallery / profile-logo paths without breaking startup.
 */

export type DocumentScanStatus =
  | "success"
  | "canceled"
  | "unavailable"
  | "error";

export interface DocumentScanSuccess {
  status: "success";
  /** Local file URI of the first JPEG page (reusable letterhead background). */
  localUri: string;
  pageCount: number;
}

export interface DocumentScanCanceled {
  status: "canceled";
}

export interface DocumentScanUnavailable {
  status: "unavailable";
  reason: "platform" | "play_services" | "module" | "unknown";
}

export interface DocumentScanError {
  status: "error";
  /** Stable code for logs — never photo contents. */
  code: string;
}

export type DocumentScanResult =
  | DocumentScanSuccess
  | DocumentScanCanceled
  | DocumentScanUnavailable
  | DocumentScanError;

export interface DocumentScannerOptions {
  /** Max pages — letterhead uses 1. */
  pageLimit?: number;
  /** Allow gallery import inside the scanner UI. */
  galleryImportAllowed?: boolean;
}

export interface DocumentScannerCapability {
  /** True when this build can attempt a native scan on the current platform. */
  canScan: boolean;
  platform: "android" | "ios" | "web" | "unknown";
  engine: "mlkit" | "none";
}

export interface DocumentScanner {
  getCapability(): DocumentScannerCapability;
  scan(options?: DocumentScannerOptions): Promise<DocumentScanResult>;
}
