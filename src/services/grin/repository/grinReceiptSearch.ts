/**
 * Owner-scoped GRIN receipt search helpers (application list projection).
 * Does not query other owners. Does not invent issued numbers or batch/lot.
 */

import {
  addQuantity,
  availableCustody,
  compareDecimal,
  quantity,
  subtractQuantity,
  type Quantity,
} from "@/goodsEvidence/quantities";
import type { GrinConfirmedProjection } from "@/goodsEvidence/ports";
import type { ImmutableGrin } from "@/goodsEvidence/types";

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

export type GrinReturnEligibilityReason =
  | "eligible"
  | "unconfirmed"
  | "voided"
  | "incomplete"
  | "refused_at_gate"
  | "no_lines";

export type GrinReturnEligibility =
  | { ok: true; reason: "eligible" }
  | { ok: false; reason: Exclude<GrinReturnEligibilityReason, "eligible"> };

/**
 * Eligibility for return — not a local-list filter masquerading as admission.
 * Backend quantity/version validation remains authoritative on submit.
 */
export function returnEligibilityForRecord(
  record: GrinApplicationRecord | null,
  confirmed: GrinConfirmedProjection | null
): GrinReturnEligibility {
  if (!record || record.projection !== "readable") {
    return { ok: false, reason: "incomplete" };
  }
  if (!confirmed || confirmed.eventVersion < 1) {
    return { ok: false, reason: "unconfirmed" };
  }
  if (confirmed.events.some((event) => event.type === "void_with_reason")) {
    return { ok: false, reason: "voided" };
  }
  if (confirmed.effective.custody === "refused_at_gate") {
    return { ok: false, reason: "refused_at_gate" };
  }
  if (!confirmed.effective.lines.length) {
    return { ok: false, reason: "no_lines" };
  }
  return { ok: true, reason: "eligible" };
}

export type GrinReturnableLineView = {
  lineId: string;
  description: string;
  unit: string;
  originallyReceived: string;
  confirmedReturned: string | null;
  pendingReturn: string | null;
  availableRemaining: string | null;
  batchLotLabel: "not_recorded";
};

function sumReturnQtyFromEvents(
  confirmed: GrinConfirmedProjection | null,
  lineId: string,
  unit: string
): Quantity | null {
  if (!confirmed) return null;
  let total: Quantity | null = null;
  for (const event of confirmed.events) {
    if (event.type !== "return_dispatched") continue;
    if (event.typedChanges.lineId !== lineId) continue;
    const raw = event.typedChanges.returnQty;
    if (!raw || typeof raw !== "object") continue;
    const q = raw as Quantity;
    if (typeof q.value !== "string" || typeof q.unit !== "string") continue;
    if (q.unit !== unit) continue;
    total = total ? addQuantity(total, quantity(q.value, q.unit)) : quantity(q.value, q.unit);
  }
  return total;
}

/**
 * Build returnable line views from a readable application record.
 * Remaining balance is display-only — server admits quantities.
 */
export function returnableLinesFromRecord(
  record: GrinApplicationRecord,
  options: {
    queuedByLine: (lineId: string) => { value: string; unit: string } | null;
    confirmed?: GrinConfirmedProjection | null;
  }
): GrinReturnableLineView[] {
  const confirmed = options.confirmed ?? null;
  return record.effective.lines.map((line) => {
    const queued = options.queuedByLine(line.lineId);
    const received = line.physicallyReceived;
    const confirmedQty = sumReturnQtyFromEvents(confirmed, line.lineId, line.unit);
    let availableRemaining: string | null = null;
    if (received && confirmed) {
      try {
        const ledgers = {
          physicalReceived: received,
          qcAllocated: quantity("0", line.unit),
          acceptedForStock: quantity("0", line.unit),
          dispatchedReturn: confirmedQty ?? quantity("0", line.unit),
          supplierAcknowledged: quantity("0", line.unit),
        };
        let avail = availableCustody(ledgers);
        const pending = queued && queued.unit === avail.unit ? quantity(queued.value, queued.unit) : null;
        if (pending) {
          avail =
            compareDecimal(avail.value, pending.value) >= 0
              ? subtractQuantity(avail, pending)
              : quantity("0", avail.unit);
        }
        availableRemaining = `${avail.value} ${avail.unit}`;
      } catch {
        availableRemaining = null;
      }
    }
    return {
      lineId: line.lineId,
      description: line.description || line.lineId,
      unit: line.unit,
      originallyReceived: received ? `${received.value} ${received.unit}` : "—",
      confirmedReturned: confirmedQty ? `${confirmedQty.value} ${confirmedQty.unit}` : confirmed ? `0 ${line.unit}` : null,
      pendingReturn: queued ? `${queued.value} ${queued.unit}` : null,
      availableRemaining,
      batchLotLabel: "not_recorded" as const,
    };
  });
}

export type OptionalArrivalDateParse =
  | { ok: true; kind: "blank" }
  | { ok: true; kind: "date"; localDate: string }
  | { ok: false; kind: "invalid" };

/** Validate real calendar dates (incl. leap years). Blank ≠ invalid nonempty. */
export function parseOptionalArrivalDate(dateYmd: string | null | undefined): OptionalArrivalDateParse {
  const raw = (dateYmd ?? "").trim();
  if (!raw) return { ok: true, kind: "blank" };
  if (!isValidCalendarYmd(raw)) return { ok: false, kind: "invalid" };
  return { ok: true, kind: "date", localDate: raw };
}

function isValidCalendarYmd(raw: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/**
 * @deprecated Prefer parseOptionalArrivalDate + reportedArrivalPrecision.
 * Kept for callers that only need a null-on-invalid calendar date string.
 * Does not invent noon/midnight timestamps.
 */
export function reportedArrivalFromOptionalDate(dateYmd: string | null | undefined): string | null {
  const parsed = parseOptionalArrivalDate(dateYmd);
  if (!parsed.ok || parsed.kind === "blank") return null;
  return parsed.localDate;
}

export function formatReportedArrivalDisplay(
  grin: Pick<ImmutableGrin, "reportedArrivalAt" | "reportedArrivalTimeZone" | "reportedArrivalPrecision">,
  notRecordedLabel: string
): string {
  const precision = grin.reportedArrivalPrecision;
  if (precision === "unknown") return notRecordedLabel;
  if (precision === "date") {
    return `${grin.reportedArrivalAt} (${grin.reportedArrivalTimeZone}, date only)`;
  }
  if (precision === "instant") {
    return `${grin.reportedArrivalAt} (${grin.reportedArrivalTimeZone})`;
  }
  // Legacy opaque — show stored value without inventing precision claims.
  return `${grin.reportedArrivalAt} (${grin.reportedArrivalTimeZone})`;
}
