import { Platform } from "react-native";

import type { DocumentScanner, DocumentScannerCapability, DocumentScanResult } from "./types";

/** Explicit non-support — does not break startup or claim iOS scanning. */
export function createUnavailableDocumentScanner(): DocumentScanner {
  const platform =
    Platform.OS === "ios" || Platform.OS === "android" || Platform.OS === "web"
      ? Platform.OS
      : "unknown";

  return {
    getCapability(): DocumentScannerCapability {
      return { canScan: false, platform, engine: "none" };
    },
    async scan(): Promise<DocumentScanResult> {
      return { status: "unavailable", reason: "platform" };
    },
  };
}
