import type { InsightPhrase } from "@/services/insights/insightPhrases";

/**
 * One home for every figure the coverage engine emits.
 * Customers & Parties has no engine id: party and shop-customer counts
 * stay on the existing record lists.
 */
export const INSIGHT_CATEGORY_ORDER = [
  "money_dues",
  "goods_movement",
  "customers_parties",
  "work_records",
] as const;

export type InsightCategoryId = (typeof INSIGHT_CATEGORY_ORDER)[number];

export const INSIGHT_CATEGORY_SLUG: Record<InsightCategoryId, string> = {
  money_dues: "money-dues",
  goods_movement: "goods-movement",
  customers_parties: "customers-parties",
  work_records: "work-records",
};

const SLUG_TO_CATEGORY: Record<string, InsightCategoryId> = Object.fromEntries(
  (Object.entries(INSIGHT_CATEGORY_SLUG) as [InsightCategoryId, string][]).map(([category, slug]) => [
    slug,
    category,
  ])
);

/** Separate money figures. They are not added into one income total. */
export const INSIGHT_CATEGORY_BY_ID = {
  cash_paid: "money_dues",
  payment_requested: "money_dues",
  freight_paid: "money_dues",
  shop_money_collected: "money_dues",
  shop_balance_open: "money_dues",
  purchase_order_value: "money_dues",
  goods_receipt_invoice: "money_dues",
  professional_brief_amounts: "money_dues",

  /** Quantities and status only. Weight and boxes stay here; distance does not. */
  transport_measure: "goods_movement",
  material_sent: "goods_movement",
  material_received_diary: "goods_movement",
  material_returned: "goods_movement",
  goods_receipt_on_hand: "goods_movement",
  activity_goods_receipt_excluded: "goods_movement",

  activity_work_update: "work_records",
  activity_staff: "work_records",
  activity_letterhead_matter: "work_records",
  activity_letterhead_document: "work_records",
  activity_reminder_purchase: "work_records",
  activity_reminder_email: "work_records",
  activity_gst_reminder: "work_records",
  activity_legacy: "work_records",
  activity_open_drafts: "work_records",
} as const satisfies Record<string, InsightCategoryId>;

export type SupportedInsightId = keyof typeof INSIGHT_CATEGORY_BY_ID;

const SCAN_LIMIT_PHRASE_KEYS = new Set<string>([
  "businessInsights.figures.freshnessDiary",
  "businessInsights.figures.freshnessOrders",
  "businessInsights.figures.freshnessCredit",
  "businessInsights.figures.freshnessBriefs",
  "businessInsights.figures.freshnessDrafts",
  "businessInsights.figures.freshnessReceipts",
]);

/** Exclusions that must stay visible. The method paragraph stays behind disclosure. */
const CAVEAT_PHRASE_KEYS = new Set<string>([
  "businessInsights.figures.cashPaid.unreadable",
  "businessInsights.figures.paymentRequested.settled",
  "businessInsights.figures.freightPaid.unpaid",
  "businessInsights.figures.transport.missingUnit",
  "businessInsights.figures.materialSent.missingUnit",
  "businessInsights.figures.materialReceived.missingUnit",
  "businessInsights.figures.materialReturned.missingUnit",
  "businessInsights.figures.shopBalance.overdue",
  "businessInsights.figures.purchaseOrders.cancelled",
  "businessInsights.figures.goodsOnHand.outside",
  "businessInsights.figures.goodsOnHand.undated",
  "businessInsights.figures.goodsOnHand.skipped",
  "businessInsights.figures.goodsInvoice.foreign",
  "businessInsights.figures.goodsInvoice.blank",
  "businessInsights.figures.briefs.noAmount",
  "businessInsights.figures.briefs.unreadable",
  "businessInsights.figures.letters.unsaved",
]);

export function insightCategoryForId(id: string): InsightCategoryId | null {
  if (!Object.prototype.hasOwnProperty.call(INSIGHT_CATEGORY_BY_ID, id)) return null;
  return INSIGHT_CATEGORY_BY_ID[id as SupportedInsightId];
}

export function insightCategoryFromSlug(slug: string | null | undefined): InsightCategoryId | null {
  if (!slug) return null;
  return SLUG_TO_CATEGORY[slug] ?? null;
}

export function insightCategoryFromParam(value: string | string[] | undefined): InsightCategoryId | null {
  const slug = Array.isArray(value) ? value[0] : value;
  return insightCategoryFromSlug(slug);
}

export function insightFyFromParam(value: string | string[] | undefined, fallback: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw == null || raw.trim() === "") return fallback;
  const fy = Number(raw);
  return Number.isInteger(fy) ? fy : fallback;
}

export function filterInsightsByCategory<T extends { id: string }>(
  insights: readonly T[],
  category: InsightCategoryId
): T[] {
  return insights.filter((insight) => insightCategoryForId(insight.id) === category);
}

export function insightScanLimitPhrases(
  insights: readonly { freshnessPhrases: readonly InsightPhrase[] }[]
): InsightPhrase[] {
  const seen = new Set<string>();
  const phrases: InsightPhrase[] = [];
  for (const insight of insights) {
    for (const phrase of insight.freshnessPhrases) {
      if (!phrase.key || seen.has(phrase.key) || !SCAN_LIMIT_PHRASE_KEYS.has(phrase.key)) continue;
      seen.add(phrase.key);
      phrases.push(phrase);
    }
  }
  return phrases;
}

export function insightRowScanLimitPhrases(insight: {
  freshnessPhrases: readonly InsightPhrase[];
}): InsightPhrase[] {
  return insight.freshnessPhrases.filter((phrase) => phrase.key && SCAN_LIMIT_PHRASE_KEYS.has(phrase.key));
}

export function insightCaveatPhrases(insight: { howPhrases: readonly InsightPhrase[] }): InsightPhrase[] {
  return insight.howPhrases.filter((phrase) => phrase.key && CAVEAT_PHRASE_KEYS.has(phrase.key));
}
