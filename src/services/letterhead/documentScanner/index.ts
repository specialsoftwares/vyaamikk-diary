import { Platform } from "react-native";

import { createAndroidMlKitDocumentScanner } from "./androidMlKitScanner";
import { createUnavailableDocumentScanner } from "./unavailableScanner";
import type { DocumentScanner, DocumentScannerCapability, DocumentScanResult } from "./types";

export type {
  DocumentScanResult,
  DocumentScanner,
  DocumentScannerCapability,
  DocumentScannerOptions,
  DocumentScanStatus,
} from "./types";

let cached: DocumentScanner | null = null;

/**
 * Returns the platform document scanner. Android uses ML Kit; other platforms
 * return an explicit unavailable capability (gallery / logo paths remain).
 */
export function getDocumentScanner(): DocumentScanner {
  if (cached) return cached;
  cached =
    Platform.OS === "android"
      ? createAndroidMlKitDocumentScanner()
      : createUnavailableDocumentScanner();
  return cached;
}

export function getDocumentScannerCapability(): DocumentScannerCapability {
  return getDocumentScanner().getCapability();
}

export async function scanLetterheadDocument(
  options?: Parameters<DocumentScanner["scan"]>[0]
): Promise<DocumentScanResult> {
  return getDocumentScanner().scan(options);
}

/** Test-only. */
export function setDocumentScannerForTests(scanner: DocumentScanner | null): void {
  cached = scanner;
}
