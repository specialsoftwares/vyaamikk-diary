import assert from "node:assert/strict";

import { GRIN_DOCUMENT_FOOTER, OFFLINE_PENDING_BANNER } from "@/goodsEvidence/constants";
import { mayMarkComplete } from "@/goodsEvidence/evidencePack";

import {
  GRIN_FIXTURE_REPOSITORY_LABEL,
  GRIN_PRICING_QUOTA_BLOCKER,
  GrinFixtureRepository,
} from "./index";

assert.match(GRIN_FIXTURE_REPOSITORY_LABEL, /FAKE \/ WAVE-1 FIXTURE: GrinFixtureRepository/);
assert.match(GRIN_PRICING_QUOTA_BLOCKER, /does not invent a price/);
assert.equal(GrinFixtureRepository.label, GRIN_FIXTURE_REPOSITORY_LABEL);
assert.equal(GrinFixtureRepository.wave, "wave1-labelled-fakes");

const repo = GrinFixtureRepository.seeded();
const items = repo.list();
assert.ok(items.some((item) => item.receiptId === "fixture-offline-pending"));
assert.ok(items.some((item) => item.receiptId === "fixture-gate-refused"));
assert.ok(items.some((item) => item.receiptId === "fixture-received-then-rejected"));
assert.ok(items.some((item) => item.receiptId === "fixture-partial-return"));
assert.ok(items.some((item) => item.receiptId === "fixture-full-return"));
assert.ok(items.some((item) => item.receiptId === "fixture-ewb-cancelled-complete"));
assert.ok(items.some((item) => item.receiptId === "fixture-ewb-unknown"));
assert.ok(items.some((item) => item.receiptId === "fixture-amended-history"));
assert.ok(items.some((item) => item.receiptId === "fixture-incomplete-pack-missing-original"));
assert.ok(items.some((item) => item.receiptId === "fixture-invoice-reference-only"));
assert.ok(items.some((item) => item.receiptId === "fixture-challan-not-invoice"));

const offline = repo.get("fixture-offline-pending");
assert.ok(offline);
assert.equal(offline.effective.issuedNumber, null);
assert.equal(offline.localState, "queued");
assert.equal(offline.fixtureKind, "GrinFixtureRecord");

const pendingItem = items.find((item) => item.receiptId === "fixture-offline-pending");
assert.equal(pendingItem?.offlinePending, true);

const gate = repo.get("fixture-gate-refused");
assert.equal(gate?.gateRefusal, "refused_at_gate");
assert.equal(gate?.original.custody, "refused_at_gate");

const receivedRejected = repo.get("fixture-received-then-rejected");
assert.equal(receivedRejected?.gateRefusal, "received_then_rejected");
assert.equal(receivedRejected?.original.custody, "received");
assert.equal(receivedRejected?.view.qcStatus, "rejected");

const partial = repo.get("fixture-partial-return");
assert.equal(partial?.view.custody, "partially_returned");
assert.equal(partial?.lineLedgers.line_1?.dispatchedReturn.unit, "bags");
assert.notEqual(partial?.lineLedgers.line_1?.dispatchedReturn.unit, partial?.effective.lines[0]?.netWeight?.unit);
assert.notEqual(partial?.lineLedgers.line_1?.dispatchedReturn.unit, partial?.effective.lines[0]?.packageCount?.unit);
assert.equal(partial?.original.lines[0]?.physicallyReceived.value, "40");

const full = repo.get("fixture-full-return");
assert.equal(full?.view.custody, "returned");

const ewb = repo.get("fixture-ewb-cancelled-complete");
assert.equal(ewb?.ewbHistories.portal[0]?.status, "cancelled");
assert.ok(ewb?.ewbHistories.movementEvents.some((evt) => evt.movement === "arrived_received"));
assert.notEqual(ewb?.ewbHistories.portal[0]?.status, "generated_active");

const unknown = repo.get("fixture-ewb-unknown");
assert.equal(unknown?.effective.ewb.kind, "unknown");

const amended = repo.get("fixture-amended-history");
assert.equal(amended?.original.locationBin.kind, "present");
if (amended?.original.locationBin.kind === "present") {
  assert.equal(amended.original.locationBin.value, "Bay A");
}
if (amended?.effective.locationBin.kind === "present") {
  assert.equal(amended.effective.locationBin.value, "Bay B");
}
assert.ok(amended?.events.some((event) => event.type === "field_amended"));

const missingOriginal = repo.exportPack("fixture-incomplete-pack-missing-original");
assert.ok(missingOriginal);
assert.equal(missingOriginal.completenessLabel, "incomplete");
assert.equal(missingOriginal.itcDisposition, "not_determined");
assert.equal(missingOriginal.missingOriginal, true);
assert.equal(mayMarkComplete(missingOriginal.manifest), false);

const invoiceRef = repo.exportPack("fixture-invoice-reference-only");
assert.equal(invoiceRef?.completenessLabel, "incomplete");
assert.equal(invoiceRef?.invoiceReferenceIsNotRetainedInvoice, true);
assert.equal(mayMarkComplete(invoiceRef!.manifest), false);

const challan = repo.exportPack("fixture-challan-not-invoice");
assert.equal(challan?.challanIsNotInvoice, true);
assert.equal(challan?.completenessLabel, "incomplete");

const issuedPack = repo.exportPack("fixture-online-issued");
assert.ok(issuedPack);
assert.equal(issuedPack.completenessLabel, "complete");
assert.equal(mayMarkComplete(issuedPack.manifest), true);
assert.equal(issuedPack.manifest.itcDisposition, "not_determined");

const exceptions = repo.exceptions("fixture-party-amount-mismatch");
assert.ok(exceptions?.itcAlwaysNotDetermined);
assert.ok(exceptions.evaluations.some((item) => item.ruleId === "amount_or_party_mismatch" && item.kind === "exception"));

const amend = repo.amend({
  receiptId: "fixture-online-issued",
  reason: "Restate warehouse after put-away.",
  changes: { warehouse: { kind: "present", value: "Annex" } },
});
assert.equal(amend.ok, true);
if (amend.ok) {
  assert.equal(amend.record.original.warehouse.kind, "present");
  if (amend.record.original.warehouse.kind === "present") {
    assert.equal(amend.record.original.warehouse.value, "Main godown");
  }
}

assert.equal(OFFLINE_PENDING_BANNER, "Captured offline — server registration pending");
assert.match(GRIN_DOCUMENT_FOOTER, /not a GST Receipt Voucher/);

console.log("GrinFixtureRepository.test.ts: ok");
