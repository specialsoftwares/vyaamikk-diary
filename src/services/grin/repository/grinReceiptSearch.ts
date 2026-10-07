/**
 * Owner-scoped GRIN receipt search helpers (application list projection).
 * Does not query other owners. Does not invent issued numbers or batch/lot.
 */

import type { GrinApplicationListItem, GrinApplicationRecord } from "./types";

export type GrinReceiptSearchHit = {
  receiptId: string;
  displayNumber: string | null;
  supplierName: string | null;
  reportedArrivalAt: string | null;
  localState: GrinApplicationListItem["localState"];
  projection: GrinApplicationListItem["projection"];
};

export function filterOwnerReceipts(
  items: GrinApplicationListItem[],
  query: string
): GrinReceiptSearchHit[] {
  const q = query.trim().toLowerCase();
  const mapped = items.map((item) => ({
    receiptId: item.receiptId,
    displayNumber: item.displayNumber,
    supplierName: item.supplierName,
    reportedArrivalAt: item.reportedArrivalAt,
    localState: item.localState,
    projection: item.projection,
  }));
  if (!q) return mapped;
  return mapped.filter((hit) => {
    const hay = [
      hit.receiptId,
      hit.displayNumber ?? "",
      hit.supplierName ?? "",
      hit.reportedArrivalAt ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export type GrinReturnableLineView = {
  lineId: string;
  description: string;
  unit: string;
  originallyReceived: string;
  /** Queued/pending return qty text when known; null if none. */
  pendingOrReturned: string | null;
  /** Batch/lot is not on current line schema — always not recorded for now. */
  batchLotLabel: "not_recorded";
};

/**
 * Build returnable line views from a readable application record.
 * Remaining balance is NOT admitted by the client — server validates.
 * Pending queued returns are shown separately when provided by the repo.
 */
export function returnableLinesFromRecord(
  record: GrinApplicationRecord,
  queuedByLine: (lineId: string) => { value: string; unit: string } | null
): GrinReturnableLineView[] {
  return record.effective.lines.map((line) => {
    const queued = queuedByLine(line.lineId);
    const received = line.physicallyReceived;
    return {
      lineId: line.lineId,
      description: line.description || line.lineId,
      unit: line.unit,
      originallyReceived: received ? `${received.value} ${received.unit}` : "—",
      pendingOrReturned: queued ? `${queued.value} ${queued.unit}` : null,
      batchLotLabel: "not_recorded",
    };
  });
}

/** Optional UI date (YYYY-MM-DD) → ISO string at noon Asia/Kolkata (date precision only). */
export function reportedArrivalFromOptionalDate(dateYmd: string | null | undefined): string | null {
  const raw = (dateYmd ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  // Noon IST — not a claimed exact arrival clock time.
  return `${raw}T12:00:00.000+05:30`;
}
