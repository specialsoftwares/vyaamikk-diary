import { GRIN_DOCUMENT_FOOTER } from "@/goodsEvidence/constants";
import { buildPdfHtmlDocument } from "@/services/pdf/pdfDocumentShell";
import { escapeHtml } from "@/utils/escapeHtml";
import type { GrinFixtureRecord } from "@/services/grin/fixture/types";
import type { GrinPackExport } from "@/services/grin/fixture/types";

export type GrinPdfLabels = {
  title: string;
  number: string;
  pendingNumber: string;
  registrationTime: string;
  reportedArrival: string;
  supplier: string;
  gstin: string;
  invoice: string;
  po: string;
  ewb: string;
  vehicle: string;
  warehouse: string;
  receivingEmployee: string;
  acknowledgement: string;
  remarks: string;
  originalUnchanged: string;
  attributionNotSignature: string;
  itcNotDetermined: string;
  completeness: string;
  complete: string;
  incomplete: string;
  materialQty: string;
  weight: string;
  packages: string;
};

export function grinPdfLabelsFromT(
  t: (key: string, vars?: Record<string, string | number>) => string
): GrinPdfLabels {
  return {
    title: t("grin.pdf.title"),
    number: t("grin.pdf.number"),
    pendingNumber: t("grin.pdf.pendingNumber"),
    registrationTime: t("grin.pdf.registrationTime"),
    reportedArrival: t("grin.pdf.reportedArrival"),
    supplier: t("grin.pdf.supplier"),
    gstin: t("grin.pdf.gstin"),
    invoice: t("grin.pdf.invoice"),
    po: t("grin.pdf.po"),
    ewb: t("grin.pdf.ewb"),
    vehicle: t("grin.pdf.vehicle"),
    warehouse: t("grin.pdf.warehouse"),
    receivingEmployee: t("grin.pdf.receivingEmployee"),
    acknowledgement: t("grin.pdf.acknowledgement"),
    remarks: t("grin.pdf.remarks"),
    originalUnchanged: t("grin.pdf.originalUnchanged"),
    attributionNotSignature: t("grin.attributionNotSignature"),
    itcNotDetermined: t("grin.pack.itcNotDetermined"),
    completeness: t("grin.pack.completeness"),
    complete: t("grin.pack.complete"),
    incomplete: t("grin.pack.incomplete"),
    materialQty: t("grin.field.receivedQty"),
    weight: t("grin.field.netWeight"),
    packages: t("grin.field.packageCount"),
  };
}

function opt(value: { kind: string; value?: string; reason?: string; gstin?: string }): string {
  if (value.kind === "present" && value.value) return value.value;
  if (value.kind === "registered" && value.gstin) return value.gstin;
  if (value.kind === "unknown" && value.reason) return value.reason;
  return "—";
}

function row(label: string, value: string): string {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
}

export function buildGrinReceiptHtml(input: {
  record: GrinFixtureRecord;
  labels: GrinPdfLabels;
  locale?: "en-IN" | "hi-IN";
}): string {
  const { record, labels } = input;
  const grin = record.effective;
  const original = record.original;
  const number = grin.issuedNumber ?? labels.pendingNumber;
  const supplierName = opt(grin.supplier.name);
  const gstin = grin.supplier.registration.kind === "registered" ? grin.supplier.registration.gstin : "—";
  const invoice =
    grin.commercial.supplierInvoiceNumber.kind === "present"
      ? grin.commercial.supplierInvoiceNumber.value
      : "—";
  const lines = grin.lines
    .map((line) => {
      const weight = line.netWeight ? `${line.netWeight.value} ${line.netWeight.unit}` : "—";
      const packs = line.packageCount ? `${line.packageCount.value} ${line.packageCount.unit}` : "—";
      return `<tr>
        <td>${escapeHtml(line.description)}</td>
        <td>${escapeHtml(`${line.physicallyReceived.value} ${line.physicallyReceived.unit}`)}</td>
        <td>${escapeHtml(weight)}</td>
        <td>${escapeHtml(packs)}</td>
      </tr>`;
    })
    .join("");

  const body = `
    <h1>${escapeHtml(labels.title)}</h1>
    <p class="legal-strip">${escapeHtml(GRIN_DOCUMENT_FOOTER)}</p>
    <table class="meta">
      ${row(labels.number, number)}
      ${row(labels.registrationTime, grin.serverRegisteredAtUtc ?? "—")}
      ${row(labels.reportedArrival, `${grin.reportedArrivalAt} (${grin.reportedArrivalTimeZone})`)}
      ${row(labels.supplier, supplierName)}
      ${row(labels.gstin, gstin)}
      ${row(labels.invoice, invoice)}
      ${row(labels.po, opt(grin.commercial.purchaseOrderNumber))}
      ${row(labels.ewb, grin.ewb.kind === "present" ? grin.ewb.ebn : grin.ewb.kind)}
      ${row(labels.vehicle, opt(grin.transport.vehicleNumber))}
      ${row(labels.warehouse, opt(grin.warehouse))}
      ${row(labels.receivingEmployee, opt(grin.receivingEmployeeAttributed))}
      ${row(labels.acknowledgement, grin.acknowledgement.outcome)}
      ${row(labels.remarks, opt(grin.remarks))}
    </table>
    <p>${escapeHtml(labels.originalUnchanged)} ${escapeHtml(original.issuedNumber ?? labels.pendingNumber)}</p>
    <p>${escapeHtml(labels.attributionNotSignature)}</p>
    <p>${escapeHtml(labels.itcNotDetermined)}</p>
    <table class="items">
      <thead><tr>
        <th>${escapeHtml(labels.title)}</th>
        <th>${escapeHtml(labels.materialQty)}</th>
        <th>${escapeHtml(labels.weight)}</th>
        <th>${escapeHtml(labels.packages)}</th>
      </tr></thead>
      <tbody>${lines}</tbody>
    </table>
  `;

  return buildPdfHtmlDocument({
    locale: input.locale ?? "en-IN",
    bodyHtml: body,
    extraCss: `.legal-strip { font-size: 8pt; color: #5c5f7a; margin: 8pt 0 12pt; }`,
  });
}

export function buildGrinPackHtml(input: {
  record: GrinFixtureRecord;
  pack: GrinPackExport;
  labels: GrinPdfLabels;
  locale?: "en-IN" | "hi-IN";
}): string {
  const { pack, labels, record } = input;
  const completeness = pack.completenessLabel === "complete" ? labels.complete : labels.incomplete;
  const reasons = pack.manifest.incompleteReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("");
  const body = `
    <h1>${escapeHtml(labels.title)}</h1>
    <p class="legal-strip">${escapeHtml(GRIN_DOCUMENT_FOOTER)}</p>
    <table class="meta">
      ${row(labels.number, record.effective.issuedNumber ?? labels.pendingNumber)}
      ${row(labels.completeness, completeness)}
      ${row(labels.itcNotDetermined, pack.itcDisposition)}
    </table>
    ${pack.invoiceReferenceIsNotRetainedInvoice ? `<p>${escapeHtml("Invoice reference is not a retained invoice.")}</p>` : ""}
    ${pack.challanIsNotInvoice ? `<p>${escapeHtml("A challan is not an invoice.")}</p>` : ""}
    ${pack.missingOriginal ? `<p>${escapeHtml("Missing original — pack is incomplete.")}</p>` : ""}
    ${reasons ? `<ul>${reasons}</ul>` : ""}
  `;
  return buildPdfHtmlDocument({
    locale: input.locale ?? "en-IN",
    bodyHtml: body,
    extraCss: `.legal-strip { font-size: 8pt; color: #5c5f7a; margin: 8pt 0 12pt; }`,
  });
}
