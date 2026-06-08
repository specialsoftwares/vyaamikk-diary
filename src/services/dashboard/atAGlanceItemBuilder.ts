/**
 * Normalizes diary / pack / letterhead rows into At-a-Glance list items.
 */

import type { BusinessEntry, BusinessEntryType } from "@/domain/businessEntry";
import type { ProfessionalServicePack } from "@/domain/professionalPack";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import { computeCreditSummary } from "@/domain/customerCredit";
import type { LetterheadDocument } from "@/services/letterhead";
import { recordTitle } from "@/services/customerCredit";
import { autoEntryTitle, entryTypeLabelKey } from "@/utils/businessEntry/display";
import { formatINR } from "@/utils/money/inr";
import { sanitizeSearchSnippet } from "@/services/search/snippet";

import type { AtAGlanceItem, AtAGlanceItemTarget } from "./atAGlanceTypes";

type TFn = (k: string, vars?: Record<string, string | number>) => string;

function iconForEntryType(type: BusinessEntryType): string {
  switch (type) {
    case "payment_request":
      return "cash-multiple";
    case "outward_freight_details":
      return "truck-outline";
    case "business_cash_given":
      return "wallet-outline";
    case "staff_matter":
      return "account-tie-outline";
    case "work_update_issue":
      return "clipboard-text-outline";
    case "material_dispatched":
      return "package-variant";
    case "material_received":
      return "package-down";
    case "reminder_purchase":
    case "reminder_email":
    case "reminder_gst_return":
      return "bell-outline";
    case "letterhead_matter":
      return "file-document-outline";
    default:
      return "book-outline";
  }
}

export function buildEntrySnippet(entry: BusinessEntry, t: TFn): string {
  const p = entry.payload as unknown as Record<string, unknown>;
  switch (entry.entryType) {
    case "payment_request": {
      const party = String(p.partyName ?? "");
      const invoice = String(p.invoiceNumber ?? "");
      const pending = formatINR(Number(p.pendingAmount ?? 0));
      return sanitizeSearchSnippet(
        t("atAGlance.snippet.payment", { party, pending, invoice })
      );
    }
    case "outward_freight_details": {
      const bill = String(p.billNumber ?? "");
      const dest = String(p.deliveryLocation ?? "");
      const boxes = Number(p.totalBoxes ?? 0);
      const weight = Number(p.totalWeight ?? 0);
      const unit = String(p.weightUnit ?? "");
      return sanitizeSearchSnippet(
        t("atAGlance.snippet.freight", { bill, dest, boxes, weight, unit })
      );
    }
    case "material_dispatched": {
      const party = String(p.partyName ?? "");
      const material = String(p.materialName ?? "");
      const dest = String(p.destination ?? p.dispatchLocation ?? "");
      return sanitizeSearchSnippet(
        t("atAGlance.snippet.materialDispatch", { party, material, dest })
      );
    }
    case "material_received": {
      const supplier = String(p.supplierName ?? "");
      const material = String(p.materialName ?? "");
      return sanitizeSearchSnippet(
        t("atAGlance.snippet.materialReceipt", { supplier, material })
      );
    }
    case "staff_matter": {
      const name = String(p.staffName ?? "");
      const matterType = String(p.matterType ?? "").replace(/_/g, " ");
      const detail = String(p.matterDetails ?? "").slice(0, 60);
      return sanitizeSearchSnippet(
        t("atAGlance.snippet.staff", { name, matterType, detail })
      );
    }
    case "reminder_gst_return": {
      const returnType = String(p.returnType ?? "").toUpperCase();
      const period = String(p.taxPeriod ?? "");
      return sanitizeSearchSnippet(
        t("atAGlance.snippet.gst", { returnType, period })
      );
    }
    case "reminder_purchase": {
      const item = String(p.itemMaterial ?? "");
      return sanitizeSearchSnippet(t("atAGlance.snippet.purchase", { item }));
    }
    case "reminder_email": {
      return sanitizeSearchSnippet(String(p.purposeSubject ?? ""));
    }
    case "business_cash_given": {
      const name = String(p.givenToName ?? "");
      const amount = formatINR(Number(p.amount ?? 0));
      return sanitizeSearchSnippet(t("atAGlance.snippet.cash", { name, amount }));
    }
    case "work_update_issue": {
      const site = String(p.sitePlace ?? "");
      const issue = String(p.issueProblem ?? p.workDone ?? entry.notes ?? "");
      return sanitizeSearchSnippet(
        t("atAGlance.snippet.work", { site, issue: issue.slice(0, 72) })
      );
    }
    default:
      return sanitizeSearchSnippet(entry.notes?.slice(0, 80) ?? "");
  }
}

export function resolveEntryTitle(entry: BusinessEntry, t: TFn): string {
  const title = entry.title?.trim();
  if (title) return title;
  return autoEntryTitle(entry.entryType, entry.entryDate, entry.payload, t);
}

export function diaryEntryToItem(
  entry: BusinessEntry,
  t: TFn,
  dateMs: number,
  extras?: Partial<AtAGlanceItem>
): AtAGlanceItem {
  const target: AtAGlanceItemTarget = { kind: "diary_entry", entryId: entry.id };
  return {
    id: `entry-${entry.id}`,
    target,
    typeLabelKey: entryTypeLabelKey(entry.entryType),
    title: resolveEntryTitle(entry, t),
    snippet: buildEntrySnippet(entry, t),
    dateMs,
    iconName: iconForEntryType(entry.entryType),
    ...extras,
  };
}

export function packToItem(
  pack: ProfessionalServicePack,
  t: TFn,
  dateMs: number,
  extras?: Partial<AtAGlanceItem>
): AtAGlanceItem {
  const summary = String(pack.facts.matterSummary ?? pack.notes ?? "").slice(0, 80);
  return {
    id: `pack-${pack.id}`,
    target: { kind: "professional_pack", packId: pack.id },
    typeLabelKey: "globalSearch.categories.professional_pack",
    title: pack.title?.trim() || t("proPack.title"),
    snippet: sanitizeSearchSnippet(summary),
    dateMs,
    iconName: "briefcase-outline",
    ...extras,
  };
}

export function creditToItem(
  record: CustomerCreditRecord,
  t: TFn,
  dateMs: number,
  extras?: Partial<AtAGlanceItem>
): AtAGlanceItem {
  const summary = computeCreditSummary(record);
  const snippet = t("atAGlance.snippet.credit", {
    customer: record.customerName,
    balance: formatINR(summary.balance),
  });
  return {
    id: `credit-${record.id}`,
    target: { kind: "customer_credit", recordId: record.id },
    typeLabelKey: "globalSearch.categories.customer_credit",
    title: recordTitle(record),
    snippet: sanitizeSearchSnippet(snippet),
    dateMs,
    iconName: "account-cash-outline",
    ...extras,
  };
}

export function letterheadToItem(
  doc: LetterheadDocument,
  t: TFn,
  dateMs: number
): AtAGlanceItem {
  const sub =
    doc.input.subject?.trim() || doc.input.body.trim().slice(0, 72) || doc.title;
  return {
    id: `lh-${doc.id}`,
    target: { kind: "letterhead_document", documentId: doc.id },
    typeLabelKey: "composer.types.letterhead_matter",
    title: doc.title?.trim() || t("composer.autoTitle.letterhead"),
    snippet: sanitizeSearchSnippet(sub),
    dateMs,
    iconName: "file-document-outline",
  };
}
