import type { BusinessEntry, BusinessEntryType, PaymentRequestPayload } from "@/domain/businessEntry";
import { cashPaidPhotoAttachment } from "@/services/attachments/cashPaidPhotoService";
import { formatPaymentPeriodLine } from "@/utils/businessEntry/paymentPeriod";
import { paymentBankDetailsHasContent } from "@/utils/businessEntry/paymentBankDetails";
import {
  outwardHasItemPayload,
  outwardMovementPdfTitle,
} from "@/utils/businessEntry/outwardMovement";
import { formatPostalLocationLine } from "@/utils/location/postalDisplay";
import { parseIndianPostalFromStored } from "@/utils/location/postalForm";
import { formatPdfDate } from "./pdfDate";
import { pdfMoneyLine } from "./pdfMoney";
import {
  pdfKeyFactsBlock,
  pdfKvRow,
  pdfNotesBlock,
  pdfSection,
  type PdfKeyValue,
} from "./pdfSections";

function formatPdfPostalLine(rawPostal: unknown, legacy: string | null | undefined): string | null {
  const loc = parseIndianPostalFromStored(rawPostal);
  if (loc) return formatPostalLocationLine(loc);
  const leg = legacy?.trim();
  return leg || null;
}

function strVal(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function freightTypePdfLabel(type: unknown): string | null {
  if (type == null || type === "") return null;
  const map: Record<string, string> = {
    to_pay: "To Pay",
    paid: "Paid",
    tbb: "TBB",
    other: "Other",
  };
  return map[String(type)] ?? String(type);
}

const DOC_TYPE: Partial<Record<BusinessEntryType, string>> = {
  payment_request: "Payment Request",
  business_cash_given: "Cash Paid Record",
  material_dispatched: "Material Movement",
  material_received: "Material Movement",
  material_return: "Material Movement",
  outward_freight_details: "Material Movement",
  work_update_issue: "Work & Team",
  staff_matter: "Work & Team",
  reminder_purchase: "Reminder",
  reminder_email: "Reminder",
  reminder_gst_return: "Reminder",
  legacy: "Business Record",
};

const PDF_TITLES: Record<BusinessEntryType, string> = {
  letterhead_matter: "Letterhead Document",
  work_update_issue: "Work Update",
  staff_matter: "Staff Related Matter",
  business_cash_given: "Cash Paid Record",
  material_dispatched: "Goods Dispatch & Transport Record",
  material_received: "Material Receipt Record",
  material_return: "Return / Replacement Movement Record",
  payment_request: "Payment Request",
  outward_freight_details: "Transport / Freight Update",
  reminder_purchase: "Purchase Reminder",
  reminder_email: "Email Reminder",
  reminder_gst_return: "GST Filing Reminder",
  legacy: "Business Record",
};

export function businessEntryPdfTitle(entry: BusinessEntry): string {
  if (entry.entryType === "material_dispatched" || entry.entryType === "outward_freight_details") {
    return outwardMovementPdfTitle(entry);
  }
  return PDF_TITLES[entry.entryType] ?? "Business Record";
}

export function businessEntryDocumentType(entry: BusinessEntry): string | null {
  return DOC_TYPE[entry.entryType] ?? null;
}

function buildOutwardMovementBody(p: Record<string, unknown>, entryDate: number, locale: "en-IN" | "hi-IN"): string {
  const fromPostal = p.dispatchFromPostal ?? p.returnFromPostal;
  const toPostal = p.deliveryToPostal ?? p.returnToPostal;
  const fromLegacy = (p.dispatchLocation ?? p.dispatchFromLocation ?? p.fromLocation) as string | undefined;
  const toLegacy = (p.destination ?? p.deliveryLocation ?? p.toLocation) as string | undefined;
  const from = formatPdfPostalLine(fromPostal, fromLegacy);
  const to = formatPdfPostalLine(toPostal, toLegacy);
  const route = from && to ? `${from} → ${to}` : from || to;

  const keyFacts: PdfKeyValue[] = [
    { label: "Movement date", value: formatPdfDate(entryDate, locale) },
    { label: "Party", value: strVal(p.partyName) },
    { label: "Route", value: route },
    { label: "Bill / challan", value: strVal(p.invoiceChallan) ?? strVal(p.billNumber) },
    { label: "E-way Bill No.", value: strVal(p.ewayBillNumber) },
  ];

  const hasItem = outwardHasItemPayload(p);
  const boxes = p.totalBoxes != null && Number(p.totalBoxes) > 0 ? String(p.totalBoxes) : null;
  const weight =
    p.totalWeight != null && Number(p.totalWeight) > 0
      ? `${p.totalWeight} ${strVal(p.weightUnit) ?? "Kg"}`
      : null;

  const movementRows =
    pdfKvRow("Reference note", strVal(p.referenceNote)) +
    (route ? "" : pdfKvRow("From", from) + pdfKvRow("To", to));

  const itemRows = hasItem
    ? pdfKvRow("Item", strVal(p.materialName)) +
      pdfKvRow("Description", strVal(p.materialDescription)) +
      pdfKvRow("Quantity", `${p.quantity} ${strVal(p.unit)}`) +
      pdfKvRow("Boxes", boxes) +
      pdfKvRow("Weight", weight)
    : (boxes || weight ? pdfKvRow("Boxes", boxes) + pdfKvRow("Weight", weight) : "");

  const transportRows =
    pdfKvRow("Transporter", strVal(p.transporter) ?? strVal(p.transporterName)) +
    pdfKvRow("LR / GR no.", strVal(p.lrGrNumber)) +
    pdfKvRow("Vehicle no.", strVal(p.vehicleNumber)) +
    pdfKvRow("Freight type", freightTypePdfLabel(p.freightType)) +
    pdfKvRow(
      "Freight amount",
      p.freightAmount != null && Number(p.freightAmount) > 0
        ? pdfMoneyLine(Number(p.freightAmount), locale).split("(")[0].trim()
        : null
    ) +
    pdfKvRow("Contact", strVal(p.clarificationContactName)) +
    pdfKvRow("Mobile", strVal(p.clarificationContactMobile)) +
    pdfKvRow("CC copy", strVal(p.ccCopyInstruction)) +
    pdfKvRow("Remarks", strVal(p.remarks));

  return (
    pdfKeyFactsBlock("Key details", keyFacts) +
    (route ? `<div class="pdf-route-line">${route}</div>` : "") +
    pdfSection("Movement", movementRows) +
    pdfSection("Goods", itemRows) +
    pdfSection("Transport", transportRows)
  );
}

export function buildBusinessEntryBody(
  entry: BusinessEntry,
  labels: {
    notes: string;
    reminder: string;
    detailsSection: string;
    entryDate: string;
  },
  locale: "en-IN" | "hi-IN"
): string {
  const p = entry.payload as unknown as Record<string, unknown>;

  switch (entry.entryType) {
    case "payment_request": {
      const pay = p as unknown as PaymentRequestPayload;
      const keyFacts: PdfKeyValue[] = [
        { label: "Party", value: pay.partyName },
        { label: "Amount due", value: pdfMoneyLine(pay.pendingAmount, locale) },
        { label: "Invoice / bill", value: pay.invoiceNumber },
        { label: "Request date", value: formatPdfDate(entry.entryDate, locale) },
        { label: "Due date", value: pay.dueDate ? formatPdfDate(pay.dueDate, locale) : null },
        { label: "Contact", value: pay.contactPerson },
      ];
      let periodBlock = "";
      if (pay.includePaymentPeriodInPdf) {
        const periodLine = formatPaymentPeriodLine(
          pay.invoiceDate,
          pay.dueDate,
          locale === "hi-IN" ? "hi" : "en"
        );
        if (periodLine) {
          periodBlock = pdfSection("Payment terms", pdfKvRow("Period", periodLine));
        }
      }
      let bankBlock = "";
      if (
        pay.includeBankDetailsInPdf &&
        pay.bankDetails &&
        paymentBankDetailsHasContent(pay.bankDetails)
      ) {
        const b = pay.bankDetails;
        bankBlock = pdfSection(
          "Bank / payment details",
          pdfKvRow("Account holder", b.accountHolderName) +
            pdfKvRow("Bank", b.bankName) +
            pdfKvRow("Account no.", b.accountNumber) +
            pdfKvRow("IFSC", b.ifsc) +
            pdfKvRow("UPI ID", b.upiId) +
            pdfKvRow("Instruction", b.paymentInstruction)
        );
      }
      return (
        pdfKeyFactsBlock("Key details", keyFacts) +
        pdfNotesBlock("Payment request note", pay.requestNote) +
        bankBlock
      );
    }
    case "business_cash_given": {
      const keyFacts: PdfKeyValue[] = [
        { label: "Paid to", value: strVal(p.givenToName) },
        {
          label: "Amount",
          value: p.amount != null ? pdfMoneyLine(Number(p.amount), locale) : null,
        },
        {
          label: "Payment date",
          value: p.paymentDate ? formatPdfDate(Number(p.paymentDate), locale) : null,
        },
        { label: "Mode", value: "Cash" },
        { label: "Recorded on", value: formatPdfDate(entry.createdAt, locale) },
      ];
      const photoRef = cashPaidPhotoAttachment(entry.attachments);
      const photoBlock = photoRef
        ? pdfSection("Attachment", pdfKvRow("Receipt / proof", "Photo attachment available"))
        : "";
      return (
        pdfKeyFactsBlock("Key details", keyFacts) +
        pdfSection("Purpose", pdfKvRow("Purpose", strVal(p.purpose))) +
        (p.settlementStatus && p.settlementStatus !== "pending"
          ? pdfSection("Settlement", pdfKvRow("Status", String(p.settlementStatus)))
          : "") +
        photoBlock
      );
    }
    case "material_dispatched":
    case "outward_freight_details":
      return buildOutwardMovementBody(p, entry.entryDate, locale);
    case "material_received": {
      const keyFacts: PdfKeyValue[] = [
        { label: "Supplier", value: strVal(p.supplierName) },
        { label: "Received on", value: formatPdfDate(entry.entryDate, locale) },
        {
          label: "Item",
          value: strVal(p.materialName)
            ? `${p.materialName} — ${p.quantity} ${p.unit}`
            : null,
        },
        { label: "Quality", value: strVal(p.qualityStatus) },
      ];
      const fromLine = formatPdfPostalLine(p.dispatchFromPostal, null);
      const toLine = formatPdfPostalLine(p.receivedAtPostal, strVal(p.receivedLocation));
      const route =
        fromLine && toLine ? `${fromLine} → ${toLine}` : fromLine || toLine;
      return (
        pdfKeyFactsBlock("Key details", keyFacts) +
        pdfSection(
          "Receipt details",
          pdfKvRow("Route", route) +
            pdfKvRow("E-way Bill No.", strVal(p.ewayBillNumber)) +
            pdfKvRow("Invoice / bill", strVal(p.invoiceBill)) +
            pdfKvRow("Checked by", strVal(p.checkedBy)) +
            pdfKvRow("Issue note", strVal(p.issueNote))
        )
      );
    }
    case "material_return": {
      const from = formatPdfPostalLine(p.returnFromPostal, strVal(p.fromLocation));
      const to = formatPdfPostalLine(p.returnToPostal, strVal(p.toLocation));
      const route = from && to ? `${from} → ${to}` : from || to;
      const keyFacts: PdfKeyValue[] = [
        { label: "Party", value: strVal(p.partyName) },
        { label: "Reason", value: strVal(p.returnReason) },
        {
          label: "Item",
          value: strVal(p.materialName)
            ? `${p.materialName} — ${p.quantity} ${p.unit}`
            : null,
        },
        { label: "Movement date", value: formatPdfDate(entry.entryDate, locale) },
        { label: "Route", value: route },
      ];
      return (
        pdfKeyFactsBlock("Key details", keyFacts) +
        pdfSection(
          "Transport",
          pdfKvRow("LR / GR", strVal(p.lrGrNumber)) +
            pdfKvRow("Transporter", strVal(p.transporter)) +
            pdfKvRow("Vehicle", strVal(p.vehicleNumber)) +
            pdfKvRow("Remarks", strVal(p.remarks))
        )
      );
    }
    case "work_update_issue": {
      const keyFacts: PdfKeyValue[] = [
        { label: "Site / place", value: strVal(p.sitePlace) },
        { label: "Event date", value: formatPdfDate(entry.entryDate, locale) },
        { label: "Recorded on", value: formatPdfDate(entry.createdAt, locale) },
      ];
      return (
        pdfKeyFactsBlock("Key details", keyFacts) +
        pdfSection("Work update", pdfKvRow("Update", strVal(p.workDone))) +
        pdfSection("Follow-up", pdfKvRow("Note", strVal(p.issueProblem)))
      );
    }
    case "staff_matter": {
      const keyFacts: PdfKeyValue[] = [
        { label: "Staff / person", value: strVal(p.staffName) },
        { label: "Matter type", value: strVal(p.matterType) },
        { label: "Event date", value: formatPdfDate(entry.entryDate, locale) },
        { label: "Recorded on", value: formatPdfDate(entry.createdAt, locale) },
      ];
      return (
        pdfKeyFactsBlock("Key details", keyFacts) +
        pdfSection("Matter details", pdfKvRow("Details", strVal(p.matterDetails))) +
        pdfSection("Follow-up", pdfKvRow("Action required", strVal(p.actionRequired)))
      );
    }
    case "reminder_purchase":
      return pdfKeyFactsBlock("Key details", [
        { label: "Item / material", value: strVal(p.itemMaterial) },
        { label: "Reminder date", value: formatPdfDate(entry.entryDate, locale) },
      ]);
    case "reminder_email":
      return pdfKeyFactsBlock("Key details", [
        { label: "Purpose", value: strVal(p.purposeSubject) },
        { label: "Reminder date", value: formatPdfDate(entry.entryDate, locale) },
      ]);
    case "reminder_gst_return":
      return (
        pdfKeyFactsBlock("Key details", [
          { label: "Return type", value: strVal(p.returnType)?.toUpperCase() ?? null },
          { label: "Tax period", value: strVal(p.taxPeriod) },
          {
            label: "Due date",
            value: p.dueDate ? formatPdfDate(Number(p.dueDate), locale) : null,
          },
        ]) +
        pdfSection(
          "Compliance",
          pdfKvRow("GSTIN", strVal(p.gstin)) + pdfKvRow("Business", strVal(p.businessName))
        )
      );
    case "legacy":
      return pdfSection(
        labels.detailsSection,
        pdfKvRow("Category", strVal(p.category)) +
          pdfKvRow("Quantity", strVal(p.quantity)) +
          pdfKvRow("Issue", strVal(p.issue))
      );
    default:
      return "";
  }
}

export function buildBusinessEntryReminderBlock(
  entry: BusinessEntry,
  reminderLabel: string,
  locale: "en-IN" | "hi-IN"
): string {
  if (!entry.reminder) return "";
  return pdfSection(
    reminderLabel,
    pdfKvRow("Time", new Date(entry.reminder.at).toLocaleString(locale)) +
      pdfKvRow("Note", entry.reminder.note)
  );
}
