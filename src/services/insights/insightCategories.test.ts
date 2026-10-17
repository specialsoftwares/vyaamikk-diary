import assert from "node:assert/strict";

import {
  buildOwnerInsightCoverage,
  coverageMatrix,
  readyInsightReads,
} from "@/services/insights/insightCoverage";
import {
  INSIGHT_CATEGORY_BY_ID,
  INSIGHT_CATEGORY_ORDER,
  INSIGHT_CATEGORY_SLUG,
  filterInsightsByCategory,
  insightCategoryForId,
  insightCategoryFromParam,
  insightCategoryFromSlug,
  insightCaveatPhrases,
  insightFyFromParam,
  insightRowScanLimitPhrases,
  insightScanLimitPhrases,
  type InsightCategoryId,
} from "@/services/insights/insightCategories";

const coverage = buildOwnerInsightCoverage({
  fy: 2025,
  reads: readyInsightReads(),
  diary: [],
  purchaseOrders: [],
  credits: [],
  letterheads: [],
  packs: [],
  drafts: [],
  grin: [],
});

const produced = coverage.insights.map((insight) => insight.id);
const producedSet = new Set(produced);

assert.equal(produced.length, producedSet.size, "the engine emitted a duplicate insight id");

for (const id of produced) {
  const category = insightCategoryForId(id);
  assert.ok(category, `unmapped supported insight id: ${id}`);
  assert.equal(INSIGHT_CATEGORY_BY_ID[id as keyof typeof INSIGHT_CATEGORY_BY_ID], category);
  assert.ok((INSIGHT_CATEGORY_ORDER as readonly string[]).includes(category));
}

for (const id of Object.keys(INSIGHT_CATEGORY_BY_ID)) {
  assert.ok(producedSet.has(id), `category map includes an id the engine does not emit: ${id}`);
  assert.equal(/distance|pin|map|km/i.test(id), false, id);
}

assert.equal(Object.keys(INSIGHT_CATEGORY_BY_ID).length, produced.length);

for (const row of coverageMatrix()) {
  assert.ok(insightCategoryForId(row.insightId), `coverage matrix id is unmapped: ${row.insightId}`);
}

const placed = INSIGHT_CATEGORY_ORDER.flatMap((category) =>
  filterInsightsByCategory(coverage.insights, category).map((insight) => insight.id)
);
assert.deepEqual([...placed].sort(), [...produced].sort());
assert.equal(new Set(placed).size, placed.length, "an insight id landed in more than one category");

const goods: Record<string, InsightCategoryId> = {
  transport_measure: "goods_movement",
  material_sent: "goods_movement",
  material_received_diary: "goods_movement",
  material_returned: "goods_movement",
  goods_receipt_on_hand: "goods_movement",
  activity_goods_receipt_excluded: "goods_movement",
  goods_receipt_invoice: "money_dues",
  freight_paid: "money_dues",
  cash_paid: "money_dues",
  payment_requested: "money_dues",
  shop_money_collected: "money_dues",
  shop_balance_open: "money_dues",
  purchase_order_value: "money_dues",
  professional_brief_amounts: "money_dues",
  activity_open_drafts: "work_records",
  activity_work_update: "work_records",
  activity_letterhead_document: "work_records",
};

for (const [id, category] of Object.entries(goods)) {
  assert.equal(insightCategoryForId(id), category, id);
}

assert.equal(insightCategoryForId("not_a_figure"), null);
assert.ok((INSIGHT_CATEGORY_ORDER as readonly string[]).includes("customers_parties"));

for (const category of INSIGHT_CATEGORY_ORDER) {
  assert.equal(insightCategoryFromSlug(INSIGHT_CATEGORY_SLUG[category]), category);
}

assert.equal(insightCategoryFromSlug("money-dues"), "money_dues");
assert.equal(insightCategoryFromSlug("Money-Dues"), null);
assert.equal(insightCategoryFromSlug(""), null);
assert.equal(insightCategoryFromSlug(undefined), null);
assert.equal(insightCategoryFromParam(["goods-movement"]), "goods_movement");
assert.equal(insightCategoryFromParam(undefined), null);
assert.equal(insightCategoryFromParam(["unknown"]), null);

assert.equal(insightFyFromParam(undefined, 2025), 2025);
assert.equal(insightFyFromParam("2024", 2025), 2024);
assert.equal(insightFyFromParam(["2023"], 2025), 2023);
assert.equal(insightFyFromParam("2024.5", 2025), 2025);
assert.equal(insightFyFromParam("nope", 2025), 2025);
assert.equal(insightFyFromParam("  ", 2025), 2025);

const scan = insightScanLimitPhrases([
  {
    freshnessPhrases: [
      { key: "businessInsights.figures.freshness" },
      { key: "businessInsights.figures.freshnessOffline" },
      { key: "businessInsights.figures.freshnessDiary", vars: { count: 5000 } },
      { key: "businessInsights.figures.freshnessDiary", vars: { count: 5000 } },
    ],
  },
  {
    freshnessPhrases: [{ key: "businessInsights.figures.freshnessReceipts", vars: { count: 200 } }],
  },
]);
assert.deepEqual(
  scan.map((phrase) => phrase.key),
  ["businessInsights.figures.freshnessDiary", "businessInsights.figures.freshnessReceipts"]
);
assert.deepEqual(
  insightRowScanLimitPhrases({
    freshnessPhrases: [
      { key: "businessInsights.figures.freshnessPending", vars: { count: 1 } },
      { key: "businessInsights.figures.freshnessOrders", vars: { count: 2000 } },
    ],
  }).map((phrase) => phrase.key),
  ["businessInsights.figures.freshnessOrders"]
);
assert.deepEqual(
  insightCaveatPhrases({
    howPhrases: [
      { key: "businessInsights.figures.goodsInvoice.how" },
      { key: "businessInsights.figures.goodsInvoice.foreign", vars: { list: "2 USD" } },
      { key: "businessInsights.figures.goodsInvoice.blank", vars: { count: 1 } },
      { key: "businessInsights.figures.materialSent.missingUnit", vars: { count: 3 } },
      { key: "businessInsights.figures.goodsInvoice.rest" },
    ],
  }).map((phrase) => phrase.key),
  [
    "businessInsights.figures.goodsInvoice.foreign",
    "businessInsights.figures.goodsInvoice.blank",
    "businessInsights.figures.materialSent.missingUnit",
  ]
);

console.log("insightCategories.test.ts: ok");
