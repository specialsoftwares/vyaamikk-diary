import assert from "node:assert/strict";

import { GRIN_DOCUMENT_FOOTER } from "@/goodsEvidence/constants";
import { GrinFixtureRepository } from "@/services/grin/fixture";
import { buildGrinPackHtml, buildGrinReceiptHtml, type GrinPdfLabels } from "./grinPdfTemplate";

const labels: GrinPdfLabels = {
  title: "GOODS RECEIPT & INSPECTION NOTE",
  number: "GRIN no.",
  pendingNumber: "Pending registration",
  registrationTime: "Registered at",
  reportedArrival: "Reported arrival",
  supplier: "Supplier",
  gstin: "GSTIN",
  invoice: "Invoice",
  po: "Purchase order",
  ewb: "E-way bill",
  vehicle: "Vehicle",
  warehouse: "Warehouse",
  receivingEmployee: "Received by (attributed)",
  acknowledgement: "Acknowledgement",
  remarks: "Remarks",
  originalUnchanged: "Original issued note:",
  attributionNotSignature: "Attributed names are not verified signatures.",
  itcNotDetermined: "ITC eligibility is not determined",
  completeness: "Pack completeness",
  complete: "Complete",
  incomplete: "Incomplete",
  materialQty: "Quantity received",
  weight: "Net weight",
  packages: "Package count",
  coverage: "Coverage",
  bundledArtifacts: "Bundled artifacts",
  manifestPdfSummary: "Manifest and PDF summary — originals are not bundled",
  originalsNotBundled: "Original bytes are not included in this export.",
};

const repo = GrinFixtureRepository.seeded();
const record = repo.get("fixture-online-issued");
assert.ok(record);
const html = buildGrinReceiptHtml({ record, labels });
assert.match(html, /GOODS RECEIPT/);
assert.match(html, new RegExp(GRIN_DOCUMENT_FOOTER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.doesNotMatch(html, /grin\./);

const incomplete = repo.get("fixture-incomplete-pack-missing-original");
assert.ok(incomplete);
const pack = repo.exportPack(incomplete.receiptId);
assert.ok(pack);
assert.equal(pack.completenessLabel, "incomplete");
const packHtml = buildGrinPackHtml({ record: incomplete, pack, labels });
assert.match(packHtml, /Incomplete/);
assert.doesNotMatch(packHtml, />Complete</);
assert.match(packHtml, new RegExp(GRIN_DOCUMENT_FOOTER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(packHtml, /not_determined/);

console.log("grinPdfAdapter.test.ts: ok");
