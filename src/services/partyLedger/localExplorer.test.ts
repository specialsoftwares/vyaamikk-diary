import assert from "node:assert/strict";

import { formatInrMinor } from "@/services/partyLedger/money";
import {
  exploreLocalPartyLedger,
  type LocalLedgerRecord,
} from "@/services/partyLedger/localExplorer";

const ownerUid = "owner-1";

function row(partial: Omit<LocalLedgerRecord, "ownerUid">): LocalLedgerRecord {
  return { ownerUid, ...partial };
}

{
  const ledger = exploreLocalPartyLedger([
    row({
      id: "cash-2000",
      recordType: "business_cash_given",
      partyName: "Ramesh Stores",
      amount: "2000",
      occurredAtMs: 1_700_000_000_000,
    }),
    row({
      id: "cash-500",
      recordType: "business_cash_given",
      partyName: " ramesh   stores ",
      amount: "500",
      occurredAtMs: 1_700_000_100_000,
    }),
    row({
      id: "cash-assigned",
      recordType: "business_cash_given",
      partyName: "Ramesh Stores",
      partyId: "party-other",
      amount: "100",
      occurredAtMs: 1_700_000_200_000,
    }),
    row({
      id: "request-1",
      recordType: "payment_request",
      partyName: "Ramesh Stores",
      amount: "9000",
      occurredAtMs: 1_700_000_300_000,
    }),
  ]);

  const provisional = ledger.parties.find((party) => party.provisional);
  const assigned = ledger.parties.find((party) => party.partyId === "party-other");
  assert.ok(provisional);
  assert.ok(assigned);
  assert.equal(provisional.cashPaidMinor, "250000");
  assert.equal(formatInrMinor(provisional.cashPaidMinor!), "₹2,500.00");
  assert.equal(provisional.displayName, "Ramesh Stores");
  assert.equal(provisional.partyId.startsWith("prov_"), true);
  assert.notEqual(provisional.partyId, assigned.partyId);
  assert.equal(assigned.displayName, "Ramesh Stores");
  assert.equal(assigned.provisional, false);
  assert.equal(assigned.cashPaidMinor, "10000");
  assert.equal(
    provisional.lines.some((line) => line.id === "cash-assigned"),
    false
  );
  assert.equal(
    provisional.lines.some((line) => line.recordType === "payment_request" && line.kind === "cash_paid"),
    false
  );
  const request = provisional.lines.find((line) => line.id === "request-1");
  assert.ok(request);
  assert.equal(request.kind, "activity");

  const cash = provisional.lines.find((line) => line.id === "cash-2000");
  assert.ok(cash);
  assert.equal(cash.kind, "cash_paid");
  assert.equal(cash.source.pathname, "/(app)/diary/[id]");
  assert.equal(cash.source.params.id, "cash-2000");
}

{
  const ledger = exploreLocalPartyLedger([
    row({
      id: "paid-freight",
      recordType: "outward_freight_details",
      partyName: "Hill Transport",
      freightType: "paid",
      amount: "40",
    }),
    row({
      id: "to-pay-freight",
      recordType: "outward_freight_details",
      partyName: "Hill Transport",
      freightType: "to_pay",
      amount: "400",
    }),
    row({
      id: "draft-cash",
      recordType: "business_cash_given",
      partyName: "Hill Transport",
      amount: "80",
      draft: true,
    }),
    row({
      id: "deleted-cash",
      recordType: "business_cash_given",
      partyName: "Hill Transport",
      amount: "70",
      deleted: true,
    }),
    row({
      id: "void-cash",
      recordType: "business_cash_given",
      partyName: "Hill Transport",
      amount: "60",
      voided: true,
    }),
    row({
      id: "bad-cash",
      recordType: "business_cash_given",
      partyName: "Hill Transport",
      amount: "10.005",
    }),
    row({
      id: "order-1",
      recordType: "purchase_order",
      partyName: "Hill Transport",
      amount: "1000",
      sourceFamily: "purchase_order",
    }),
  ]);

  const party = ledger.parties.find((item) => item.displayName === "Hill Transport");
  assert.ok(party);
  assert.equal(party.cashPaidMinor, "4000");
  assert.equal(party.lines.some((line) => line.id === "draft-cash"), false);
  assert.equal(party.lines.some((line) => line.id === "deleted-cash"), false);
  assert.equal(party.lines.some((line) => line.id === "void-cash"), false);
  const unpaid = party.lines.find((line) => line.id === "to-pay-freight");
  assert.ok(unpaid);
  assert.equal(unpaid.kind, "activity");
  const bad = party.lines.find((line) => line.id === "bad-cash");
  assert.ok(bad);
  assert.equal(bad.kind, "exclusion");
  assert.equal(bad.moneyMinor, null);
  const order = party.lines.find((line) => line.id === "order-1");
  assert.ok(order);
  assert.equal(order.kind, "activity");
  assert.equal(order.source.pathname, "/(app)/purchase-order/form");
  assert.equal(order.source.params.id, "order-1");
}

{
  const ledger = exploreLocalPartyLedger([
    row({
      id: "only-bad",
      recordType: "business_cash_given",
      partyName: "Unread Amount",
      amount: "not-money",
    }),
  ]);
  assert.equal(ledger.parties.length, 1);
  assert.equal(ledger.parties[0]?.cashPaidMinor, null);
  assert.equal(ledger.parties[0]?.lines[0]?.kind, "exclusion");
  assert.equal(ledger.serverProjectionEnabled, false);
}

console.log("partyLedger.localExplorer.test.ts: ok");
