import type { BusinessInsightRow, FyRecapSnapshot, PartyInsightMeta, PinInsightMeta } from "@/domain/businessInsight";
import { formatFinancialYearLabel } from "@/utils/financialYear";
import { normalizeSearchText } from "@/services/search/normalize";
import type { IndexedSearchItem } from "./indexDocuments";
import { categoryLabelKey, iconForCategory } from "./indexDocuments";

export function indexPartyInsight(row: BusinessInsightRow): IndexedSearchItem {
  const meta = row.metadata as PartyInsightMeta;
  const searchableText = normalizeSearchText(
    [meta.partyName, meta.pin, meta.locality, meta.state, row.displayLabel].filter(Boolean).join(" ")
  );
  return {
    searchableText,
    result: {
      id: `party-insight:${row.financialYear}:${row.normalizedKey}`,
      kind: "business_insight",
      category: "party_insight",
      categoryLabelKey: categoryLabelKey("party_insight"),
      title: meta.partyName || row.displayLabel,
      snippet: [meta.pin ? `PIN ${meta.pin}` : null, meta.locality, meta.state]
        .filter(Boolean)
        .join(" · "),
      dateMs: row.lastUsedAt,
      iconName: iconForCategory("party_insight"),
      target: {
        type: "business_insight",
        screen: "parties",
        fy: row.financialYear,
      },
      filterBucket: "records",
      searchableText,
      score: 0,
    },
  };
}

export function indexPinInsight(row: BusinessInsightRow): IndexedSearchItem {
  const meta = row.metadata as PinInsightMeta;
  const searchableText = normalizeSearchText(
    [meta.pin, meta.locality, meta.district, meta.state, ...(meta.parties ?? [])].join(" ")
  );
  return {
    searchableText,
    result: {
      id: `pin-insight:${row.financialYear}:${row.normalizedKey}`,
      kind: "business_insight",
      category: "pin_insight",
      categoryLabelKey: categoryLabelKey("pin_insight"),
      title: meta.pin,
      snippet: meta.parties?.length
        ? `Used with: ${meta.parties.slice(0, 3).join(", ")}`
        : meta.state ?? "PIN",
      dateMs: row.lastUsedAt,
      iconName: iconForCategory("pin_insight"),
      target: {
        type: "business_insight",
        screen: "pins",
        fy: row.financialYear,
      },
      filterBucket: "records",
      searchableText,
      score: 0,
    },
  };
}

export function indexFyRecapSnapshot(snap: FyRecapSnapshot): IndexedSearchItem {
  const fyLabel = formatFinancialYearLabel(snap.fyStartYear);
  const searchableText = normalizeSearchText(
    [
      fyLabel,
      "business year recap",
      "fy recap",
      ...snap.topParties.map((p) => p.name),
      ...snap.topPins.map((p) => p.pin),
      ...snap.topRoutes.map((r) => r.route),
    ].join(" ")
  );
  return {
    searchableText,
    result: {
      id: `fy-recap:${snap.fyStartYear}`,
      kind: "business_insight",
      category: "fy_recap",
      categoryLabelKey: categoryLabelKey("fy_recap"),
      title: `${fyLabel} Summary`,
      snippet:
        snap.status === "ready"
          ? `${snap.recordsCreated} records · Approx. ${snap.approxDistanceKm} km`
          : "Preparing recap",
      dateMs: snap.preparedAt ?? Date.now(),
      iconName: iconForCategory("fy_recap"),
      target: {
        type: "business_insight",
        screen: "recap",
        fy: snap.fyStartYear,
      },
      filterBucket: "records",
      searchableText,
      score: 0,
    },
  };
}
