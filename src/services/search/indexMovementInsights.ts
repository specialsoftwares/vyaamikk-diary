import type { MovementDistanceRecord } from "@/domain/movementInsight";
import { buildCustomerCreditSearchableText } from "@/services/search/buildSearchableText";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import { normalizeSearchText } from "@/services/search/normalize";
import type { IndexedSearchItem } from "./indexDocuments";
import { categoryLabelKey, iconForCategory } from "./indexDocuments";

export function indexMovementRecord(
  movement: MovementDistanceRecord,
  t: (k: string, vars?: Record<string, string | number>) => string
): IndexedSearchItem {
  const route = movement.routeLabel ?? `${movement.fromPin} → ${movement.toPin}`;
  const dist =
    movement.approxDistanceKm != null
      ? t("businessInsights.routeKm", { km: movement.approxDistanceKm })
      : "";
  const searchableText = normalizeSearchText(
    [route, movement.fromPin, movement.toPin, movement.fromLabel, movement.toLabel, dist]
      .filter(Boolean)
      .join(" ")
  );
  const snippet =
    movement.fromLabel && movement.toLabel
      ? `${movement.fromLabel} · ${movement.toLabel}`
      : dist || route;
  return {
    searchableText,
    result: {
      id: `movement:${movement.id}`,
      kind: "diary_entry",
      category: "route_insight",
      categoryLabelKey: categoryLabelKey("route_insight"),
      title: route,
      snippet,
      dateMs: movement.calculatedAt,
      iconName: iconForCategory("route_insight"),
      target: {
        type: "business_insight",
        screen: "movement",
        fy: movement.financialYear,
      },
      filterBucket: "records",
      searchableText,
      score: 0,
    },
  };
}

export function indexCreditCustomerInsight(
  record: CustomerCreditRecord,
  t: (k: string) => string
): IndexedSearchItem {
  const searchableText = buildCustomerCreditSearchableText(record);
  return {
    searchableText,
    result: {
      id: `credit-insight:${record.id}`,
      kind: "customer_credit",
      category: "customer_credit",
      categoryLabelKey: categoryLabelKey("customer_credit"),
      title: record.customerName,
      snippet: record.recordNumber,
      dateMs: record.updatedAt,
      iconName: iconForCategory("customer_credit"),
      target: { type: "customer_credit", recordId: record.id },
      filterBucket: "records",
      searchableText,
      score: 0,
    },
  };
}
