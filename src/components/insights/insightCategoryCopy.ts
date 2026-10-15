import type { InsightCategoryId } from "@/services/insights/insightCategories";

type Translator = (key: string, vars?: Record<string, string | number>) => string;

function shown(value: string, key: string, english: string): string {
  return value === key ? english : value;
}

export function insightCategoryTitle(t: Translator, category: InsightCategoryId): string {
  switch (category) {
    case "money_dues":
      return shown(t("insights.categories.moneyDues"), "insights.categories.moneyDues", "Money & Dues");
    case "goods_movement":
      return shown(
        t("insights.categories.goodsMovement"),
        "insights.categories.goodsMovement",
        "Goods & Movement"
      );
    case "customers_parties":
      return shown(
        t("insights.categories.customersParties"),
        "insights.categories.customersParties",
        "Customers & Parties"
      );
    case "work_records":
      return shown(t("insights.categories.workRecords"), "insights.categories.workRecords", "Work & Records");
  }
}

export function insightCategoryHint(t: Translator, category: InsightCategoryId): string {
  switch (category) {
    case "money_dues":
      return shown(
        t("insights.categories.moneyDuesHint"),
        "insights.categories.moneyDuesHint",
        "Cash, requests, dues, orders, invoices, and brief amounts. These stay separate figures."
      );
    case "goods_movement":
      return shown(
        t("insights.categories.goodsMovementHint"),
        "insights.categories.goodsMovementHint",
        "Receipt, dispatch, and return quantities and status."
      );
    case "customers_parties":
      return shown(
        t("insights.categories.customersPartiesHint"),
        "insights.categories.customersPartiesHint",
        "Parties and shop customers from your records."
      );
    case "work_records":
      return shown(
        t("insights.categories.workRecordsHint"),
        "insights.categories.workRecordsHint",
        "Work notes, letters, reminders, and open drafts."
      );
  }
}

export function insightCategoryUnknown(t: Translator): string {
  return shown(
    t("insights.categories.unknown"),
    "insights.categories.unknown",
    "This category is not available."
  );
}
