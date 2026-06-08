import type { BusinessEntry, OutwardFreightPayload } from "@/domain/businessEntry";
import { formatEntryDate } from "@/utils/date";

type FreightLabels = {
  dispatchUpdate: string;
  billNo: string;
  billDate: string;
  lrNo: string;
  deliveryLocation: string;
  totalBoxes: string;
  totalWeight: string;
  freightType: string;
  ccCopy: string;
  clarification: string;
  freightTypeToPay: string;
  freightTypePaid: string;
  freightTypeTbb: string;
  freightTypeOther: string;
  ccAttach: string;
  ccNotAttached: string;
  ccNotApplicable: string;
};

function freightTypeLabel(
  type: OutwardFreightPayload["freightType"],
  labels: FreightLabels
): string {
  switch (type) {
    case "to_pay":
      return labels.freightTypeToPay;
    case "paid":
      return labels.freightTypePaid;
    case "tbb":
      return labels.freightTypeTbb;
    default:
      return labels.freightTypeOther;
  }
}

function ccLabel(
  cc: OutwardFreightPayload["ccCopyInstruction"],
  labels: FreightLabels
): string {
  switch (cc) {
    case "attach":
      return labels.ccAttach;
    case "not_attached":
      return labels.ccNotAttached;
    default:
      return labels.ccNotApplicable;
  }
}

/** WhatsApp-friendly dispatch update — omits blank optional lines. */
export function formatFreightShareMessage(
  entry: BusinessEntry,
  labels: FreightLabels
): string {
  const p = entry.payload as unknown as OutwardFreightPayload;
  const heading = p.dispatchTitle?.trim() || p.billNumber;
  const lines: string[] = [`🚚 ${labels.dispatchUpdate} – ${heading}`, "", `📄 ${labels.billNo}: ${p.billNumber}`];
  if (p.billDate) {
    lines.push(`🗓️ ${labels.billDate}: ${formatEntryDate(p.billDate)}`);
  }
  if (p.lrGrNumber?.trim()) {
    lines.push(`📑 ${labels.lrNo}: ${p.lrGrNumber.trim()}`);
  }
  lines.push(`📍 ${labels.deliveryLocation}: ${p.deliveryLocation}`);
  if (p.dispatchFromLocation?.trim()) {
    lines.push(`📤 ${p.dispatchFromLocation.trim()}`);
  }
  lines.push(
    `📦 ${labels.totalBoxes}: ${p.totalBoxes}`,
    `⚖️ ${labels.totalWeight}: ${p.totalWeight} ${p.weightUnit}`,
    `💳 ${labels.freightType}: ${freightTypeLabel(p.freightType, labels)}`,
    `❌ ${labels.ccCopy}: ${ccLabel(p.ccCopyInstruction, labels)}`
  );
  if (p.transporterName?.trim()) {
    lines.push(`🚛 ${p.transporterName.trim()}`);
  }
  if (p.vehicleNumber?.trim()) {
    lines.push(`🔢 ${p.vehicleNumber.trim()}`);
  }
  lines.push(
    "",
    `${labels.clarification}`,
    `${p.clarificationContactName} — ${p.clarificationContactMobile}`
  );
  if (p.remarks?.trim()) {
    lines.push("", p.remarks.trim());
  }
  return lines.join("\n");
}
