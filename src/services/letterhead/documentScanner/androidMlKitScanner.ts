/**
 * Android adapter: Google ML Kit Document Scanner via
 * `@infinitered/react-native-mlkit-document-scanner` (Expo module).
 *
 * Configured for letterhead import:
 * - pageLimit 1
 * - gallery import enabled
 * - JPEG only (no PDF → rasterize)
 * - BASE_WITH_FILTER (crop/rotate/filters; no FULL aggressive cleaning)
 */

import { Platform } from "react-native";

import type {
  DocumentScanner,
  DocumentScannerCapability,
  DocumentScannerOptions,
  DocumentScanResult,
} from "./types";

export function createAndroidMlKitDocumentScanner(): DocumentScanner {
  return {
    getCapability(): DocumentScannerCapability {
      if (Platform.OS !== "android") {
        return { canScan: false, platform: Platform.OS as "ios" | "web", engine: "none" };
      }
      return { canScan: true, platform: "android", engine: "mlkit" };
    },

    async scan(options?: DocumentScannerOptions): Promise<DocumentScanResult> {
      if (Platform.OS !== "android") {
        return { status: "unavailable", reason: "platform" };
      }

      try {
        const mlkit = await import("@infinitered/react-native-mlkit-document-scanner");
        const result = await mlkit.launchDocumentScannerAsync({
          pageLimit: options?.pageLimit ?? 1,
          galleryImportAllowed: options?.galleryImportAllowed ?? true,
          scannerMode: mlkit.ScannerModeOptions.BASE_WITH_FILTER,
          resultFormats: mlkit.ResultFormatOptions.JPEG,
        });

        if (result.canceled) {
          return { status: "canceled" };
        }

        const page = result.pages?.[0]?.trim();
        if (!page) {
          return { status: "error", code: "empty_pages" };
        }

        return {
          status: "success",
          localUri: page,
          pageCount: result.pages?.length ?? 1,
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (/UnavailabilityError|not available|null/i.test(message)) {
          return { status: "unavailable", reason: "module" };
        }
        if (/play.?services|GoogleApi|SERVICE_INVALID|SERVICE_MISSING/i.test(message)) {
          return { status: "unavailable", reason: "play_services" };
        }
        return { status: "error", code: "scan_failed" };
      }
    },
  };
}
