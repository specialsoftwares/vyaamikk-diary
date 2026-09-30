import { OFFLINE_PENDING_BANNER } from "./constants";
import type { CaptureProvenance } from "./types";

/**
 * SIMULATED in-process draft shape. This is not a SQLite outbox, not a
 * durable local file inventory, and not server registration.
 */

export interface OfflineCapture {
  receiptId: string;
  commandId: string;
  capturedAtClientUtc: string;
  reportedArrivalAt: string;
  reportedArrivalTimeZone: string;
  captureProvenance: CaptureProvenance;
  issuedNumber: null;
  serverRegisteredAtUtc: null;
  registrationStatus: "pending";
  banner: typeof OFFLINE_PENDING_BANNER;
  provisionalExport: true;
}

export function createOfflineCapture(input: {
  receiptId: string;
  commandId: string;
  capturedAtClientUtc: string;
  reportedArrivalAt: string;
  reportedArrivalTimeZone: string;
  lateEntry?: boolean;
}): OfflineCapture {
  return {
    receiptId: input.receiptId,
    commandId: input.commandId,
    capturedAtClientUtc: input.capturedAtClientUtc,
    reportedArrivalAt: input.reportedArrivalAt,
    reportedArrivalTimeZone: input.reportedArrivalTimeZone,
    captureProvenance: input.lateEntry ? "late_entry" : "offline",
    issuedNumber: null,
    serverRegisteredAtUtc: null,
    registrationStatus: "pending",
    banner: OFFLINE_PENDING_BANNER,
    provisionalExport: true,
  };
}
