import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import type { BusinessEntryType } from "@/domain/businessEntry";
import { BUSINESS_INSIGHTS_HREF, BUSINESS_INSIGHTS_LABEL } from "@/content/insights/entry";
import hi from "@/i18n/locales/hi.json";
import ta from "@/i18n/locales/ta.json";
import te from "@/i18n/locales/te.json";
import gu from "@/i18n/locales/gu.json";
import { grinSessionMatchesAccount, maskedInsightData } from "@/services/insights/insightAccountGuard";
import { renderInsightPhrases } from "@/services/insights/insightPhrases";
import {
  buildOwnerInsightCoverage,
  coverageMatrix,
  formatPaise,
  readyInsightReads,
  toCreditCoverageFact,
  toDiaryCoverageFact,
  toDraftCoverageFact,
  toGrinCoverageFact,
  toLetterheadCoverageFact,
  toProfessionalPackCoverageFact,
  toPurchaseOrderCoverageFact,
  type DiaryCoverageFact,
  type ExplainableInsight,
  type OwnerInsightCoverageInput,
} from "@/services/insights/insightCoverage";

const FY = 2025;
const NOW = new Date(2025, 5, 15, 12).getTime();
const IN_FY = new Date(2025, 5, 10, 12).getTime();
const APRIL = new Date(2025, 3, 15, 12).getTime();
const OUT_FY = new Date(2025, 2, 1, 12).getTime();

const DIARY_TYPES: Record<BusinessEntryType, true> = {
  letterhead_matter: true,
  work_update_issue: true,
  staff_matter: true,
  business_cash_given: true,
  material_dispatched: true,
  material_received: true,
  material_return: true,
  payment_request: true,
  outward_freight_details: true,
  reminder_purchase: true,
  reminder_email: true,
  reminder_gst_return: true,
  legacy: true,
};

function build(partial: Partial<OwnerInsightCoverageInput> = {}) {
  return buildOwnerInsightCoverage({
    fy: FY,
    now: NOW,
    reads: readyInsightReads(),
    diary: [],
    purchaseOrders: [],
    credits: [],
    letterheads: [],
    packs: [],
    drafts: [],
    grin: [],
    ...partial,
  });
}

function findInsight(id: string, result = build()): ExplainableInsight {
  const found = result.insights.find((insight) => insight.id === id);
  assert.ok(found, id);
  return found;
}

function texts(result: ReturnType<typeof build>): string {
  return result.insights
    .map((insight) =>
      [
        insight.id,
        insight.title,
        insight.periodLabel,
        insight.howCalculated,
        insight.valueLabel,
        insight.emptyState,
        insight.freshnessNote,
        insight.source.pathname,
      ].join("\n")
    )
    .join("\n");
}

function diary(partial: Partial<DiaryCoverageFact> & Pick<DiaryCoverageFact, "id" | "entryType">): DiaryCoverageFact {
  return {
    entryDate: IN_FY,
    createdAt: IN_FY,
    deletedAt: null,
    status: "active",
    recipientLabel: null,
    cashAmount: null,
    cashPaymentDate: null,
    materialQuantity: null,
    materialUnit: null,
    boxes: null,
    weight: null,
    weightUnit: null,
    freightAmount: null,
    freightType: null,
    pendingAmount: null,
    linkedDispatchId: null,
    ...partial,
  };
}

{
  const matrix = coverageMatrix();
  const built = build();
  const ids = new Set(built.insights.map((insight) => insight.id));
  for (const type of Object.keys(DIARY_TYPES)) {
    assert.ok(matrix.some((row) => row.recordType === type), type);
  }
  for (const type of [
    "purchase_order",
    "customer_credit",
    "letterhead_document",
    "professional_pack",
    "form_draft",
    "grin_receipt",
  ]) {
    assert.ok(matrix.some((row) => row.recordType === type), type);
  }
  for (const row of matrix) {
    assert.ok(ids.has(row.insightId), row.insightId);
    assert.ok(row.repository.length > 0);
    assert.ok(row.dateField.length > 0);
    if (row.role === "activity_only") {
      assert.match(row.reason, /financial fields|free text|Status only|no tax amount|no amount field/i);
    } else {
      assert.equal(row.role, "calculated");
    }
  }
  for (const insight of built.insights) {
    assert.ok(insight.freshnessNote.includes("Not calculated at app startup"));
    assert.equal(insight.freshnessNote.includes("not a certified account"), false);
    assert.ok(insight.title.length > 0);
    assert.ok(insight.periodLabel.length > 0);
    assert.ok(insight.emptyState.length > 0);
    assert.ok(insight.source.pathname.startsWith("/"));
  }
}

{
  const mapped = toDiaryCoverageFact({
    id: "cash-1",
    entryType: "business_cash_given",
    entryDate: OUT_FY,
    createdAt: OUT_FY,
    deletedAt: null,
    status: "settled",
    payload: {
      amount: 1500.5,
      paymentDate: IN_FY,
      givenToName: "SECRET_NAME",
      purpose: "SECRET_PURPOSE",
      settlementStatus: "settled",
    },
  });
  assert.equal(mapped.recipientLabel, "SECRET_NAME");
  assert.equal(JSON.stringify(mapped).includes("SECRET_PURPOSE"), false);

  const reminder = toDiaryCoverageFact({
    id: "rem-1",
    entryType: "reminder_purchase",
    entryDate: IN_FY,
    createdAt: IN_FY,
    deletedAt: null,
    status: "active",
    payload: { estimatedAmount: "99999", itemMaterial: "SECRET_ITEM" },
  });
  assert.equal(JSON.stringify(reminder).includes("99999"), false);
  assert.equal(JSON.stringify(reminder).includes("SECRET_ITEM"), false);

  const work = toDiaryCoverageFact({
    id: "work-1",
    entryType: "work_update_issue",
    entryDate: IN_FY,
    createdAt: IN_FY,
    deletedAt: null,
    status: "active",
    payload: { quantityOutput: "12 tons", workDone: "SECRET_WORK" },
  });
  assert.equal(work.materialQuantity, null);
  assert.equal(JSON.stringify(work).includes("SECRET_WORK"), false);

  const result = build({
    diary: [
      mapped,
      diary({
        id: "cash-1",
        entryType: "business_cash_given",
        cashAmount: 99999,
        cashPaymentDate: IN_FY,
      }),
      diary({
        id: "cash-deleted",
        entryType: "business_cash_given",
        deletedAt: IN_FY,
        cashAmount: 4000,
        cashPaymentDate: IN_FY,
      }),
      diary({
        id: "cash-april",
        entryType: "business_cash_given",
        cashAmount: 200,
        cashPaymentDate: APRIL,
        recipientLabel: "April payee",
      }),
      diary({
        id: "cash-old",
        entryType: "business_cash_given",
        entryDate: OUT_FY,
        cashAmount: 800,
        cashPaymentDate: OUT_FY,
      }),
      reminder,
      work,
    ],
  });
  const cash = findInsight("cash_paid", result);
  assert.equal(cash.valueLabel, formatPaise(150050 + 20000));
  assert.equal(result.cashPaid.entryCount, 2);
  assert.equal(result.cashPaid.monthTotal, 1500.5);
  assert.equal(result.cashPaid.fyTotal, 1700.5);
  assert.deepEqual(result.cashPaid.topRecipients, [
    { name: "April payee", count: 1 },
    { name: "SECRET_NAME", count: 1 },
  ]);
  assert.equal(texts(result).includes("SECRET_NAME"), false);
  assert.equal(texts(result).includes("SECRET_PURPOSE"), false);
  assert.equal(texts(result).includes("SECRET_ITEM"), false);
  assert.equal(texts(result).includes("99999"), false);
  assert.match(cash.howCalculated, /Settlement status is not a second payment/);
  assert.match(cash.howCalculated, /stored as rupees/);
  assert.match(cash.howCalculated, /not labelled as another currency/);
  assert.equal(cash.source.pathname, "/(app)/diary");
  assert.equal(cash.source.params?.type, "business_cash_given");
  const hiHow = renderInsightPhrases(cash.howPhrases, hi);
  assert.notEqual(hiHow, cash.howCalculated);
  assert.match(hiHow, /रुप/);
  for (const tree of [ta, te, gu]) {
    const translated = renderInsightPhrases(cash.howPhrases, tree);
    assert.notEqual(translated, cash.howCalculated);
    assert.ok(translated.length > 40, translated);
  }
  assert.equal(findInsight("activity_reminder_purchase", result).valueLabel, "1 record");
  assert.match(findInsight("activity_reminder_purchase", result).howCalculated, /free text/);
  assert.match(findInsight("activity_work_update", result).howCalculated, /free text/);
  assert.equal(findInsight("material_sent", result).valueLabel, "None");
}

{
  const result = build({
    diary: [
      diary({
        id: "pay-open",
        entryType: "payment_request",
        pendingAmount: 400,
      }),
      diary({
        id: "pay-settled",
        entryType: "payment_request",
        status: "settled",
        pendingAmount: 900,
      }),
      diary({
        id: "sent-kg",
        entryType: "material_dispatched",
        materialQuantity: 2,
        materialUnit: "kg",
        freightAmount: 100,
        freightType: "paid",
        boxes: 9,
        weight: 10,
        weightUnit: "kg",
      }),
      diary({
        id: "sent-bags",
        entryType: "material_dispatched",
        materialQuantity: 3,
        materialUnit: "Bags",
        freightAmount: 50,
        freightType: "to_pay",
      }),
      diary({
        id: "sent-linked",
        entryType: "material_dispatched",
        materialQuantity: 4,
        materialUnit: "Boxes",
        boxes: 4,
        freightAmount: 70,
        freightType: "paid",
      }),
      diary({
        id: "freight-1",
        entryType: "outward_freight_details",
        linkedDispatchId: "sent-linked",
        freightAmount: 80,
        freightType: "paid",
        weight: 3,
        weightUnit: "KG",
        boxes: 2,
      }),
      diary({
        id: "got",
        entryType: "material_received",
        materialQuantity: 6,
        materialUnit: "kg",
      }),
      diary({
        id: "back",
        entryType: "material_return",
        materialQuantity: 1,
        materialUnit: "kg",
      }),
    ],
  });
  assert.equal(findInsight("payment_requested", result).valueLabel, formatPaise(40000));
  assert.match(findInsight("payment_requested", result).howCalculated, /not money collected/);
  assert.equal(findInsight("material_sent", result).valueLabel, "3 Bags · 4 Boxes · 2 kg");
  assert.equal(findInsight("material_received_diary", result).valueLabel, "6 kg");
  assert.equal(findInsight("material_returned", result).valueLabel, "1 kg");
  assert.match(findInsight("material_returned", result).howCalculated, /not subtracted/);
  assert.equal(findInsight("freight_paid", result).valueLabel, formatPaise(18000));
  assert.match(findInsight("freight_paid", result).howCalculated, /only the freight record/);
  const transport = findInsight("transport_measure", result);
  assert.equal(transport.valueLabel, "13 kg · 11 boxes");
  assert.match(findInsight("material_received_diary", result).howCalculated, /not a payment/);
}

{
  const credit = toCreditCoverageFact({
    id: "cr-1",
    status: "active",
    mode: "credit",
    saleDate: IN_FY,
    saleAmount: 10000,
    downPayment: 1000,
    totalPayable: 9000,
    shopFollowUpRequired: false,
    schedule: [{ dueDate: new Date(2025, 5, 1, 12).getTime(), amount: 9000 }],
    payments: [
      { id: "p1", amount: 2500, paidDate: IN_FY },
      { id: "p1", amount: 9999, paidDate: IN_FY },
    ],
    customerName: "SECRET_CUSTOMER",
    financeAmount: 500000,
  } as never);
  assert.equal(JSON.stringify(credit).includes("SECRET_CUSTOMER"), false);
  assert.equal(JSON.stringify(credit).includes("500000"), false);

  const result = build({
    credits: [
      credit,
      toCreditCoverageFact({
        id: "cash-sale",
        status: "fully_paid",
        mode: "cash",
        saleDate: IN_FY,
        saleAmount: 8000,
        downPayment: 2000,
        payments: [],
      }),
      toCreditCoverageFact({
        id: "cash-with-payment",
        status: "fully_paid",
        mode: "cash",
        saleDate: IN_FY,
        saleAmount: 8000,
        payments: [{ id: "only", amount: 100, paidDate: IN_FY }],
      }),
      toCreditCoverageFact({
        id: "cancelled",
        status: "cancelled",
        mode: "credit",
        saleDate: IN_FY,
        saleAmount: 5000,
        payments: [{ id: "gone", amount: 5000, paidDate: IN_FY }],
      }),
      toCreditCoverageFact({
        id: "written",
        status: "written_off",
        mode: "credit",
        saleDate: IN_FY,
        saleAmount: 4000,
        totalPayable: 4000,
        payments: [{ id: "kept", amount: 700, paidDate: IN_FY }],
      }),
    ],
    purchaseOrders: [
      toPurchaseOrderCoverageFact({
        id: "po-1",
        status: "active",
        poDate: IN_FY,
        items: [{ itemName: "SECRET_ITEM", quantity: 2, unit: "Kg", rate: 500, amount: 1000 }],
        taxApplicable: "applicable",
        gstRate: 18,
      }),
      toPurchaseOrderCoverageFact({
        id: "po-cancel",
        status: "cancelled",
        poDate: IN_FY,
        items: [{ itemName: "x", quantity: 1, rate: 50, amount: 50 }],
      }),
    ],
  });
  assert.equal(findInsight("shop_money_collected", result).valueLabel, formatPaise((1000 + 2500 + 8000 + 100 + 700) * 100));
  assert.match(findInsight("shop_money_collected", result).howCalculated, /do not add the sale total/);
  assert.equal(texts(result).includes("SECRET_CUSTOMER"), false);
  const balance = findInsight("shop_balance_open", result);
  assert.equal(balance.valueLabel, formatPaise(650000));
  assert.match(balance.howCalculated, /not added as extra money|No extra overdue amount/);
  assert.equal(balance.sourceRecordIds.includes("written"), false);
  assert.equal(balance.sourceRecordIds.includes("cancelled"), false);
  const po = findInsight("purchase_order_value", result);
  assert.equal(po.valueLabel, formatPaise(118000));
  assert.match(po.howCalculated, /not money paid/);
  assert.equal(po.source.pathname, "/(app)/purchase-order/form");
  assert.equal(po.source.params?.id, "po-1");
}

{
  const receipt = toGrinCoverageFact({
    receiptId: "r1",
    localState: "issued",
    projection: "readable",
    confirmed: {
      eventVersion: 1,
      effective: {
        custody: "partially_returned",
        reportedArrivalAt: "2025-06-10",
        reportedArrivalPrecision: "date",
        commercial: { supplierInvoiceValue: { currency: "inr", minorUnits: 118000 } },
        lines: [
          {
            lineId: "line_1",
            unit: "bags",
            physicallyReceived: { value: "10", unit: "bags" },
          },
        ],
        supplierName: "SECRET_SUPPLIER",
      } as never,
      events: [
        {
          eventId: "e1",
          type: "return_dispatched",
          typedChanges: {
            lineId: "line_1",
            returnQty: { value: "4", unit: "bags" },
            reason: "SECRET_REASON",
          },
        },
        {
          eventId: "e2",
          type: "return_received",
          typedChanges: {
            lineId: "line_1",
            linkedEventId: "e1",
            correctionQty: { value: "1", unit: "bags" },
          },
        },
      ],
    },
  });
  assert.equal(JSON.stringify(receipt).includes("SECRET_SUPPLIER"), false);
  assert.equal(JSON.stringify(receipt).includes("SECRET_REASON"), false);

  const usd = toGrinCoverageFact({
    receiptId: "r-usd",
    localState: "attachment_pending",
    projection: "readable",
    confirmed: {
      eventVersion: 2,
      effective: {
        custody: "received",
        reportedArrivalAt: "2025-06-11",
        reportedArrivalPrecision: "date",
        commercial: { supplierInvoiceValue: { currency: "USD", minorUnits: 999999 } },
        lines: [
          { lineId: "l", unit: "kg", physicallyReceived: { value: "1", unit: "kg" } },
        ],
      },
      events: [],
    },
  });
  const refused = toGrinCoverageFact({
    receiptId: "r-no",
    localState: "issued",
    projection: "readable",
    confirmed: {
      eventVersion: 1,
      effective: {
        custody: "refused_at_gate",
        reportedArrivalAt: "2025-06-11",
        reportedArrivalPrecision: "date",
        commercial: { supplierInvoiceValue: { currency: "INR", minorUnits: 500000 } },
        lines: [
          { lineId: "l", unit: "bags", physicallyReceived: { value: "40", unit: "bags" } },
        ],
      },
      events: [],
    },
  });
  const undated = toGrinCoverageFact({
    receiptId: "r-undated",
    localState: "issued",
    projection: "readable",
    confirmed: {
      eventVersion: 1,
      effective: {
        custody: "received",
        reportedArrivalAt: "2025-06-11T00:00:00.000Z",
        reportedArrivalPrecision: "unknown",
        commercial: { supplierInvoiceValue: { currency: "INR", minorUnits: 100 } },
        lines: [
          { lineId: "l", unit: "bags", physicallyReceived: { value: "8", unit: "bags" } },
        ],
      },
      events: [],
    },
  });
  const blankCurrency = toGrinCoverageFact({
    receiptId: "r-blank",
    localState: "issued",
    projection: "readable",
    confirmed: {
      eventVersion: 1,
      effective: {
        custody: "received",
        reportedArrivalAt: "2025-06-12",
        reportedArrivalPrecision: "date",
        commercial: { supplierInvoiceValue: { currency: "", minorUnits: 777700 } },
        lines: [],
      },
      events: [],
    },
  });
  const duplicate = { ...receipt, confirmed: receipt.confirmed && {
    ...receipt.confirmed,
    lines: receipt.confirmed.lines.map((line) => ({
      ...line,
      physicallyReceived: { value: "99", unit: "bags" },
    })),
  }};

  const result = build({
    grin: [receipt, duplicate, usd, refused, undated, blankCurrency],
    drafts: [toDraftCoverageFact({ id: "d1" }), toDraftCoverageFact({ id: "d1" })],
    letterheads: [
      toLetterheadCoverageFact({ id: "let-1", saved: true, input: { date: IN_FY, body: "SECRET_LETTER" } as never }),
      toLetterheadCoverageFact({ id: "let-2", saved: false, input: { date: IN_FY } }),
    ],
    packs: [
      toProfessionalPackCoverageFact({
        id: "brief-1",
        deletedAt: null,
        matterDate: IN_FY,
        professionalCategory: "ca_tax",
        matterType: "tds_tcs_matter",
        facts: {
          matterSummary: "SECRET_BRIEF",
          amountInvolved: 2500,
          deducteeParty: "SECRET_PARTY",
        },
      }),
      toProfessionalPackCoverageFact({
        id: "brief-2",
        deletedAt: null,
        matterDate: IN_FY,
        professionalCategory: "ca_tax",
        matterType: "gst_return_support",
        facts: { matterSummary: "no amount here" },
      }),
    ],
  });

  assert.equal(findInsight("goods_receipt_on_hand", result).valueLabel, "7 bags · 1 kg");
  const invoice = findInsight("goods_receipt_invoice", result);
  assert.equal(invoice.valueLabel, formatPaise(118000));
  assert.match(invoice.howCalculated, /USD/);
  assert.match(invoice.howCalculated, /not money you collected/);
  assert.match(invoice.howCalculated, /not treated as INR/);
  assert.match(invoice.howCalculated, /no currency code and were not added/);
  assert.equal(invoice.valueLabel.includes("999"), false);
  assert.match(findInsight("activity_goods_receipt_excluded", result).valueLabel, /receipts/);
  assert.equal(findInsight("activity_open_drafts", result).valueLabel, "1 draft");
  assert.equal(findInsight("activity_open_drafts", result).periodLabel, "Open now");
  assert.match(findInsight("activity_open_drafts", result).howCalculated, /not added/);
  assert.equal(findInsight("activity_letterhead_document", result).valueLabel, "1 letter");
  assert.equal(findInsight("professional_brief_amounts", result).valueLabel, formatPaise(250000));
  assert.match(findInsight("professional_brief_amounts", result).howCalculated, /not added to cash paid/);
  assert.equal(texts(result).includes("SECRET_"), false);
  assert.equal(findInsight("cash_paid", result).valueLabel, "None");
  assert.equal(findInsight("purchase_order_value", result).valueLabel, "None");
}

{
  const missed = build({
    reads: { ...readyInsightReads(), diary: "unavailable", grin: "unavailable" },
    diary: [
      diary({
        id: "hidden",
        entryType: "business_cash_given",
        cashAmount: 5000,
        cashPaymentDate: IN_FY,
      }),
    ],
  });
  assert.equal(findInsight("cash_paid", missed).unavailable, true);
  assert.equal(findInsight("cash_paid", missed).valueLabel, "Not read");
  assert.match(findInsight("cash_paid", missed).emptyState, /not zero/i);
  assert.equal(missed.cashPaid.fyTotal, 0);
  assert.equal(findInsight("goods_receipt_on_hand", missed).valueLabel, "Not read");
  assert.match(findInsight("activity_gst_reminder", missed).howCalculated, /Not read|could not be read/);
}

{
  assert.equal(maskedInsightData("a", "b", "ueid-b", { secret: true }), null);
  assert.equal(maskedInsightData("a", null, "ueid", { secret: true }), null);
  assert.equal(maskedInsightData("a", "a", null, { secret: true }), null);
  assert.deepEqual(maskedInsightData("a", "a", "ueid-a", { ok: 1 }), { ok: 1 });
  assert.equal(grinSessionMatchesAccount("owner-a", "owner-b"), false);
  assert.equal(grinSessionMatchesAccount(null, "owner-a"), false);
  assert.equal(grinSessionMatchesAccount("owner-a", "owner-a"), true);
}

{
  const settings = fs.readFileSync(
    path.join(process.cwd(), "app/(app)/(tabs)/settings.tsx"),
    "utf8"
  );
  const screen = fs.readFileSync(
    path.join(process.cwd(), "app/(app)/settings/business-insights.tsx"),
    "utf8"
  );
  assert.equal(BUSINESS_INSIGHTS_HREF, "/(app)/settings/business-insights");
  assert.equal(BUSINESS_INSIGHTS_LABEL, "Business Insights");
  const pending = build({ pendingDiaryCount: 3, offline: true, diaryServerUnread: true });
  assert.match(pending.freshnessSummary, /not synced yet/);
  assert.match(pending.freshnessSummary, /offline/);
  assert.match(pending.freshnessSummary, /could not be read/);
  assert.match(findInsight("cash_paid", pending).freshnessNote, /not synced yet/);
  const cashRow = coverageMatrix().find((row) => row.recordType === "business_cash_given");
  assert.ok(cashRow);
  assert.match(cashRow.amountOrUnitFields, /stored as rupees/);
  assert.equal(/treated as INR/.test(cashRow.amountOrUnitFields), false);
  assert.ok(settings.includes("BUSINESS_INSIGHTS_HREF"));
  assert.equal(screen.includes("ExplainableInsightList"), false);
  assert.equal(screen.includes("businessInsights.distanceFy"), false);
  assert.equal(screen.includes("businessInsights.pinsTitle"), false);
  assert.ok(screen.includes("FySelector"));
  assert.ok(screen.includes("InsightsOverviewTiles"));
  assert.equal(screen.includes("Screen"), true);
  const categoryScreen = fs.readFileSync(
    path.join(process.cwd(), "app/(app)/settings/business-insights/category/[category].tsx"),
    "utf8"
  );
  assert.ok(categoryScreen.includes("ExplainableInsightList"));
  assert.ok(categoryScreen.includes("router.back()"));
}

console.log("insightCoverage.test.ts: ok");
