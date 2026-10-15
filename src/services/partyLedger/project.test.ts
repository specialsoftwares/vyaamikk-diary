import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { computeCreditSummary, type CustomerCreditRecord } from "@/domain/customerCredit";
import { PARTY_LEDGER_SERVER_PROJECTION_ENABLED } from "@/services/partyLedger/contracts";
import { addInr, inr, parseInrDecimal, subInr } from "@/services/partyLedger/money";
import {
  applyProjection,
  emptyLedgerState,
  readBucket,
  sumBucketsForOwner,
  type DesiredProjection,
  type LedgerApplyState,
} from "@/services/partyLedger/apply";
import {
  abandonGeneration,
  compareBucketTotals,
  emptyCursor,
  expectedFromSources,
  includeAcceptedSource,
  openGeneration,
  reconcileApplied,
  sealGeneration,
  visibleTotalsOf,
} from "@/services/partyLedger/reconcile";
import { sha256 } from "@/services/partyLedger/sha256";
import {
  allocationsFor,
  deriveContribution,
  mapCredit,
  sourceKeyFor,
  type LedgerSource,
} from "@/services/partyLedger/project";
import {
  PARTY_LEDGER_APPLY_ROLLBACK,
  PARTY_LEDGER_BUCKETS_COLLECTION,
  PARTY_LEDGER_CLIENT_DENY_RULE,
  PARTY_LEDGER_PROJECTIONS_COLLECTION,
  planApplyInTransaction,
} from "../../../functions/src/partyLedger/applyInTransaction";

const DAY = "2026-10-01";
const DAY_2 = "2026-10-02";
const ACCEPTED = "2026-10-15T00:00:00.000Z";
const MONEY_EFFECTS = new Set([
  "cash_paid",
  "cash_received",
  "receivable_increase",
  "receivable_decrease",
  "payable_increase",
  "payable_decrease",
]);

function oracle(message: string): string {
  return createHash("sha256").update(message, "utf8").digest("hex");
}

function source(overrides: Partial<LedgerSource> & Pick<LedgerSource, "recordType" | "recordId">): LedgerSource {
  return {
    ownerUid: "owner-1",
    sourceEpoch: "1",
    revision: "1",
    effectiveDay: DAY,
    acceptedAt: ACCEPTED,
    partyId: null,
    payload: {},
    ...overrides,
  };
}

function cashSource(
  amount: string,
  epoch: string,
  partyId: string | null,
  day = DAY,
  ownerUid = "owner-1",
): LedgerSource {
  return source({
    ownerUid,
    recordType: "business_cash_given",
    recordId: "cash-1",
    sourceEpoch: epoch,
    revision: epoch,
    effectiveDay: day,
    partyId,
    payload: { amount, givenToName: "Ramesh" },
  });
}

function desired(src: LedgerSource, commandId: string): DesiredProjection {
  return { commandId, ownerUid: src.ownerUid, contribution: deriveContribution(src) };
}

function applyAll(commands: readonly DesiredProjection[], start: LedgerApplyState = emptyLedgerState()): LedgerApplyState {
  return commands.reduce((state, command) => applyProjection(state, command).state, start);
}

function cashPaid(state: LedgerApplyState, ownerUid: string): string {
  return sumBucketsForOwner(state, ownerUid).cashPaidMinor;
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += 1) {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permutations(rest)) out.push([items[index]!, ...tail]);
  }
  return out;
}

{
  assert.equal(sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(sha256("abc"), oracle("abc"));
  assert.equal(sha256(""), oracle(""));
  assert.equal(sha256("₹2000"), oracle("₹2000"));
  assert.equal(sha256("a".repeat(1000)), oracle("a".repeat(1000)));
  assert.equal(PARTY_LEDGER_SERVER_PROJECTION_ENABLED, false);
}

{
  const createdSource = cashSource("2000", "1", "party-a");
  const createdFact = deriveContribution(createdSource).facts[0];
  assert.ok(createdFact);
  assert.equal(createdFact.effect, "cash_paid");
  assert.equal(createdFact.money?.minor, "200000");
  assert.equal(createdFact.partyNameSnapshot, "Ramesh");
  assert.equal(createdFact.partyId, "party-a");
  assert.equal(createdFact.id, "owner-1:business_cash_given:cash-1:1:cash_paid:amount");

  const unnamed = deriveContribution(cashSource("2000", "1", null)).facts[0];
  assert.equal(unnamed?.partyId, null);
  assert.equal(unnamed?.partyNameSnapshot, "Ramesh");

  const created = applyProjection(emptyLedgerState(), desired(createdSource, "cmd-create"));
  assert.equal(created.kind, "applied");
  assert.equal(created.deltas[0]?.cashPaidMinor, "200000");
  assert.equal(created.projection.totals.cashPaidMinor, "200000");
  assert.equal(cashPaid(created.state, "owner-1"), "200000");

  const replay = applyProjection(created.state, desired(createdSource, "cmd-create"));
  assert.equal(replay.kind, "replay");
  assert.equal(replay.deltas.length, 0);
  assert.equal(replay.state, created.state);
  assert.equal(cashPaid(replay.state, "owner-1"), "200000");

  const editedSource = cashSource("2500", "2", "party-a");
  const edited = applyProjection(created.state, desired(editedSource, "cmd-edit"));
  assert.equal(edited.kind, "applied");
  assert.equal(edited.deltas.length, 1);
  assert.equal(edited.deltas[0]?.cashPaidMinor, "50000");
  assert.equal(readBucket(edited.state, "owner-1", "party-a", DAY).cashPaidMinor, "250000");
  assert.equal(edited.projection.totals.cashPaidMinor, "250000");

  const movedSource = cashSource("2500", "3", "party-b");
  const moved = applyProjection(edited.state, desired(movedSource, "cmd-move"));
  assert.equal(moved.kind, "applied");
  const loss = moved.deltas.find((delta) => delta.partyId === "party-a");
  const gain = moved.deltas.find((delta) => delta.partyId === "party-b");
  assert.equal(loss?.cashPaidMinor, "-250000");
  assert.equal(gain?.cashPaidMinor, "250000");
  assert.equal(readBucket(moved.state, "owner-1", "party-a", DAY).cashPaidMinor, "0");
  assert.equal(readBucket(moved.state, "owner-1", "party-b", DAY).cashPaidMinor, "250000");
  assert.equal(cashPaid(moved.state, "owner-1"), cashPaid(edited.state, "owner-1"));
  const deltaCash = moved.deltas.reduce((total, delta) => addInr(total, inr(BigInt(delta.cashPaidMinor))), inr(0n));
  assert.equal(deltaCash.minor, "0");
  assert.deepEqual(moved.projection.partyIds, ["party-b"]);

  const voidSource = cashSource("2500", "4", "party-b");
  voidSource.voided = true;
  const voided = applyProjection(moved.state, desired(voidSource, "cmd-void"));
  assert.equal(voided.kind, "applied");
  assert.equal(deriveContribution(voidSource).facts.length, 0);
  assert.equal(cashPaid(voided.state, "owner-1"), "0");
  assert.equal(voided.projection.totals.cashPaidMinor, "0");

  const voidAgain = applyProjection(voided.state, desired(voidSource, "cmd-void"));
  assert.equal(voidAgain.kind, "replay");
  assert.equal(voidAgain.deltas.length, 0);
  assert.equal(voidAgain.state, voided.state);
  assert.equal(cashPaid(voidAgain.state, "owner-1"), "0");

  const late = applyProjection(voided.state, desired(cashSource("2500", "2", "party-a"), "cmd-late"));
  assert.equal(late.kind, "stale");
  assert.equal(late.state, voided.state);
  assert.equal(cashPaid(late.state, "owner-1"), "0");
}

{
  const first = applyProjection(emptyLedgerState(), desired(cashSource("2000", "1", "party-a"), "cmd-same"));
  const changed = applyProjection(first.state, desired(cashSource("2500", "2", "party-a"), "cmd-same"));
  assert.equal(changed.kind, "conflict");
  assert.equal(changed.state, first.state);
  assert.equal(cashPaid(changed.state, "owner-1"), "200000");
  assert.equal(changed.deltas.length, 0);
}

{
  const nonCash: Array<[string, Record<string, unknown>]> = [
    ["payment_request", { pendingAmount: "9999", partyName: "Ravi" }],
    ["purchase_order", { itemsTotal: "5000", partyName: "Vendor" }],
    ["goods_receipt", { invoiceAmount: "8000", supplierName: "Mill" }],
    ["material_dispatched", { quantity: 10, partyName: "Site" }],
    ["material_received", { quantity: 4, supplierName: "Mill" }],
    ["material_return", { quantity: 1, partyName: "Site" }],
    ["work_update_issue", { quantityOutput: "12" }],
    ["staff_matter", { staffName: "Asha" }],
    ["letterhead_matter", { body: "Hello" }],
    ["letterhead_document", { body: "Hello" }],
    ["reminder_purchase", { estimatedAmount: "100" }],
    ["reminder_email", { purposeSubject: "Pay" }],
    ["reminder_gst_return", { taxPeriod: "2026-10" }],
    ["legacy", { category: "note", amount: "40" }],
    ["professional_pack", { statedAmount: "15000", fee: "15000" }],
    ["draft", { amount: "50" }],
    ["not_a_real_type", { amount: "75" }],
  ];
  for (const [recordType, payload] of nonCash) {
    const facts = deriveContribution(
      source({ recordType, recordId: recordType, partyId: "party-a", payload }),
    ).facts;
    assert.ok(facts.length > 0, recordType);
    for (const fact of facts) {
      assert.equal(MONEY_EFFECTS.has(fact.effect), false, recordType);
      assert.equal(fact.money, undefined, recordType);
    }
  }
}

{
  const toPay = deriveContribution(
    source({
      recordType: "outward_freight_details",
      recordId: "freight-to-pay",
      payload: { freightType: "to_pay", freightAmount: "80.50", partyName: "Carrier" },
    }),
  );
  assert.equal(toPay.facts.some((fact) => fact.effect === "cash_paid"), false);
  assert.equal(toPay.facts.every((fact) => fact.money === undefined), true);

  const paid = deriveContribution(
    source({
      recordType: "outward_freight_details",
      recordId: "freight-paid",
      partyId: "party-a",
      payload: { freightType: "paid", freightAmount: "80.50", partyName: "Carrier" },
    }),
  );
  assert.equal(paid.facts[0]?.effect, "cash_paid");
  assert.equal(paid.facts[0]?.money?.minor, "8050");
  assert.equal(paid.facts[0]?.partyNameSnapshot, "Carrier");
}

{
  const rejected = deriveContribution(
    source({
      recordType: "business_cash_given",
      recordId: "cash-bad",
      payload: { amount: "10.005", givenToName: "Ramesh" },
    }),
  );
  assert.equal(rejected.facts.length, 1);
  assert.equal(rejected.facts[0]?.money, undefined);
  assert.equal(rejected.facts[0]?.effect, "activity");
  assert.equal(rejected.facts[0]?.evidenceRefs.includes("reject:fractional_paise"), true);
  const applied = applyProjection(emptyLedgerState(), desired(
    source({
      recordType: "business_cash_given",
      recordId: "cash-bad",
      payload: { amount: "10.005", givenToName: "Ramesh" },
    }),
    "cmd-bad",
  ));
  assert.equal(cashPaid(applied.state, "owner-1"), "0");

  const paise = deriveContribution(
    source({
      recordType: "business_cash_given",
      recordId: "cash-paise",
      payload: { amount: "10.50", givenToName: "Ramesh" },
    }),
  );
  assert.equal(paise.facts[0]?.money?.minor, "1050");
}

{
  const create = desired(cashSource("2000", "1", "party-a"), "cmd-create");
  const edit = desired(cashSource("2500", "2", "party-a"), "cmd-edit");
  const move = desired(cashSource("2500", "3", "party-b"), "cmd-move");
  const once = applyAll([create, edit, move]);
  assert.equal(readBucket(once, "owner-1", "party-b", DAY).cashPaidMinor, "250000");
  assert.equal(readBucket(once, "owner-1", "party-a", DAY).cashPaidMinor, "0");
  for (const order of permutations([create, edit, move])) {
    const shuffled = applyAll(order);
    assert.deepEqual(shuffled.buckets, once.buckets);
  }
  const duplicated = applyAll([move, create, edit, edit, move, create], once);
  assert.deepEqual(duplicated.buckets, once.buckets);

  const voided = desired({ ...cashSource("2500", "4", "party-b"), voided: true }, "cmd-void");
  const orders = [
    [create, edit, voided],
    [voided, create, edit],
    [create, voided, edit],
  ];
  for (const order of orders) {
    assert.equal(cashPaid(applyAll(order), "owner-1"), "0");
  }
}

{
  const dated = applyAll([
    desired(cashSource("2000", "1", "party-a", DAY), "cmd-day-1"),
    desired(cashSource("2000", "2", "party-a", DAY_2), "cmd-day-2"),
  ]);
  assert.equal(readBucket(dated, "owner-1", "party-a", DAY).cashPaidMinor, "0");
  assert.equal(readBucket(dated, "owner-1", "party-a", DAY_2).cashPaidMinor, "200000");
  assert.equal(cashPaid(dated, "owner-1"), "200000");
}

{
  const ownerA = cashSource("2000", "1", "party-a", DAY, "owner-a");
  const ownerB = cashSource("3000", "1", "party-a", DAY, "owner-b");
  ownerB.recordId = "cash-1";
  const state = applyAll([desired(ownerA, "cmd-a"), desired(ownerB, "cmd-a")]);
  assert.equal(cashPaid(state, "owner-a"), "200000");
  assert.equal(cashPaid(state, "owner-b"), "300000");
  assert.equal(readBucket(state, "owner-a", "party-a", DAY).cashPaidMinor, "200000");
  assert.equal(readBucket(state, "owner-b", "party-a", DAY).cashPaidMinor, "300000");
  for (const key of Object.keys(state.buckets)) {
    assert.equal(key.startsWith("owner-a\u001f") || key.startsWith("owner-b\u001f"), true);
  }
}

{
  const record = {
    id: "cr-1",
    userId: "owner-credit",
    customerName: "Meera",
    status: "active",
    mode: "credit",
    saleAmount: 2000,
    downPayment: 500,
    saleDate: Date.UTC(2026, 9, 1),
    schedule: [],
    payments: [{ id: "pay-1", amount: 200, paidDate: Date.UTC(2026, 9, 2), mode: "cash", createdAt: 1 }],
    version: 1,
    updatedAt: 1,
    createdAt: 1,
    closure: { finalPaymentAmount: 200 },
  } as unknown as CustomerCreditRecord;

  const summary = computeCreditSummary(record);
  const facts = mapCredit(record);
  const increase = facts.find((fact) => fact.effect === "receivable_increase");
  const decrease = facts.filter((fact) => fact.effect === "receivable_decrease");
  assert.equal(increase?.money?.minor, "150000");
  assert.equal(decrease.length, 1);
  assert.equal(decrease[0]?.money?.minor, "20000");
  assert.equal(facts.some((fact) => fact.effect === "cash_received" || fact.effect === "cash_paid"), false);
  const net = subInr(increase!.money!, decrease[0]!.money!);
  const balance = parseInrDecimal(summary.balance);
  assert.equal(balance.ok, true);
  if (balance.ok) assert.equal(net.minor, balance.money.minor);
  assert.equal(net.minor, "130000");
  const doubled = parseInrDecimal(2000 + 500 + 200);
  assert.equal(doubled.ok, true);
  if (doubled.ok) {
    assert.equal(doubled.money.minor, "270000");
    assert.notEqual(net.minor, doubled.money.minor);
  }
  assert.equal(mapCredit(record).map((fact) => fact.id).join("|"), facts.map((fact) => fact.id).join("|"));
  assert.deepEqual(mapCredit({ ...record, deletedAt: 9 } as unknown as CustomerCreditRecord), []);

  const creditSource = source({
    ownerUid: "owner-credit",
    recordType: "customer_credit",
    recordId: "cr-1",
    sourceEpoch: "1",
    revision: "1",
    effectiveDay: DAY,
    credit: record,
  });
  const applied = applyProjection(emptyLedgerState(), desired(creditSource, "cmd-credit"));
  assert.equal(readBucket(applied.state, "owner-credit", "", DAY).receivableMinor, "130000");
  assert.equal(readBucket(applied.state, "owner-credit", "", DAY).cashReceivedMinor, "0");
  assert.equal(sumBucketsForOwner(applied.state, "owner-credit").cashPaidMinor, "0");
}

{
  const cash = cashSource("2000", "1", "party-a");
  const freight = source({
    recordType: "outward_freight_details",
    recordId: "freight-1",
    partyId: "party-a",
    payload: { freightType: "paid", freightAmount: "100", partyName: "Carrier" },
  });
  const other = cashSource("50", "1", "party-a", DAY, "owner-2");
  other.recordId = "cash-2";
  const older = cashSource("10", "0", "party-a");
  const state = applyAll([
    desired(older, "cmd-older"),
    desired(cash, "cmd-cash"),
    desired(freight, "cmd-freight"),
    desired(other, "cmd-other"),
  ]);
  const active = [cash, freight, other];
  let activeCash = inr(0n);
  for (const item of active) {
    for (const row of allocationsFor(deriveContribution(item).facts)) {
      activeCash = addInr(activeCash, inr(BigInt(row.totals.cashPaidMinor)));
    }
  }
  assert.equal(activeCash.minor, "215000");
  const expected = expectedFromSources([older, ...active]);
  assert.equal(compareBucketTotals(expected, state.buckets).match, true);
  assert.equal(reconcileApplied(active, state).match, true);
  assert.equal(cashPaid(state, "owner-1"), "210000");
  assert.equal(cashPaid(state, "owner-2"), "5000");

  const keys = [sourceKeyFor(cash), sourceKeyFor(freight)];
  const opened = openGeneration(emptyCursor(), keys);
  const included = includeAcceptedSource(includeAcceptedSource(opened, cash), freight);
  const sealed = sealGeneration(included);
  assert.equal(sealed.sealed, true);
  assert.equal(sealed.cursor.visibleGeneration, 1);
  assert.equal(compareBucketTotals(expectedFromSources([cash, freight]), sealed.cursor.visibleTotals).match, true);

  const edited = cashSource("2500", "2", "party-a");
  const partial = includeAcceptedSource(openGeneration(sealed.cursor, keys), edited);
  assert.equal(partial.visibleGeneration, 1);
  assert.equal(compareBucketTotals(visibleTotalsOf(partial), sealed.cursor.visibleTotals).match, true);
  const refused = sealGeneration(partial);
  assert.equal(refused.sealed, false);
  assert.equal(refused.cursor.visibleGeneration, 1);
  const discarded = abandonGeneration(partial);
  assert.equal(discarded.pending, null);
  assert.equal(discarded.visibleGeneration, 1);
  assert.equal(compareBucketTotals(visibleTotalsOf(discarded), sealed.cursor.visibleTotals).match, true);

  const resumed = includeAcceptedSource(partial, freight);
  const published = sealGeneration(resumed);
  assert.equal(published.sealed, true);
  assert.equal(published.cursor.visibleGeneration, 2);
  assert.equal(compareBucketTotals(expectedFromSources([edited, freight]), published.cursor.visibleTotals).match, true);
  let visibleCash = inr(0n);
  for (const row of Object.values(published.cursor.visibleTotals)) {
    visibleCash = addInr(visibleCash, inr(BigInt(row.cashPaidMinor)));
  }
  assert.equal(visibleCash.minor, "260000");
}

{
  const plan = planApplyInTransaction({
    ownerUid: "owner-1",
    sourcePath: "users/owner-1/entries/cash-1",
    sourceKey: "owner-1:business_cash_given:cash-1",
    affectedBucketIds: ["party-b__2026-10-01", "party-a__2026-10-01"],
  });
  assert.equal(plan.deploymentAuthorized, false);
  assert.equal(plan.serverProjectionEnabled, false);
  assert.equal(plan.liveDataMigrated, false);
  assert.equal(plan.clientWrites, "deny");
  assert.equal(plan.collections.projections, "users/{uid}/partyLedgerProjections");
  assert.equal(plan.collections.buckets, "users/{uid}/partyLedgerBuckets");
  assert.equal(plan.collections.projections, PARTY_LEDGER_PROJECTIONS_COLLECTION);
  assert.equal(plan.collections.buckets, PARTY_LEDGER_BUCKETS_COLLECTION);
  assert.equal(plan.rollback, PARTY_LEDGER_APPLY_ROLLBACK);
  assert.match(plan.rollback, /false/);
  assert.match(plan.rollback, /No live data is migrated/);
  assert.match(PARTY_LEDGER_CLIENT_DENY_RULE, /partyLedgerProjections/);
  assert.match(PARTY_LEDGER_CLIENT_DENY_RULE, /partyLedgerBuckets/);
  assert.match(PARTY_LEDGER_CLIENT_DENY_RULE, /allow read: if isOwner\(uid\);/);
  assert.match(PARTY_LEDGER_CLIENT_DENY_RULE, /allow write: if false;/);
  assert.deepEqual(
    plan.steps.map((step) => step.purpose),
    [
      "source",
      "applied_projection",
      "affected_summary",
      "affected_summary",
      "projection",
      "bucket_delta",
      "bucket_delta",
    ],
  );
  assert.equal(plan.steps[0]?.path, "users/owner-1/entries/cash-1");
  assert.equal(plan.steps[1]?.path, "users/owner-1/partyLedgerProjections/owner-1:business_cash_given:cash-1");
  assert.equal(plan.steps[2]?.path, "users/owner-1/partyLedgerBuckets/party-a__2026-10-01");
  assert.equal(plan.steps[4]?.op, "write");
  assert.equal(plan.steps[4]?.purpose, "projection");
}

console.log("partyLedger.project.test.ts: ok");
