/**
 * You tab command-centre summaries — single-pass, capped previews.
 */

import type { BusinessEntry } from "@/domain/businessEntry";
import type { ProfessionalServicePack } from "@/domain/professionalPack";
import type { LetterheadDocument } from "@/services/letterhead";
import { entryListSummary, entryTypeLabelKey } from "@/utils/businessEntry/display";
import { formatEntryDate, todayStartMs } from "@/utils/date";
import { matterLabelKey, statusLabelKey } from "@/utils/professionalPack/display";

const ONE_DAY = 86_400_000;

export const YOU_DASHBOARD_ENTRY_LIMIT = 80;
export const YOU_LETTERHEAD_SCAN_CAP = 30;
export const YOU_PRO_PACK_SCAN_LIMIT = 25;
export const YOU_RECENT_CAP = 3;
export const YOU_ATTENTION_CAP = 5;
export const YOU_PDF_PREVIEW_CAP = 3;

type TFn = (k: string, vars?: Record<string, string | number>) => string;

export interface YouDashboardStats {
  today: number;
  thisWeek: number;
  upcoming: number;
}

export type YouAttentionItem =
  | { kind: "entry"; at: number; entry: BusinessEntry }
  | { kind: "pack"; at: number; pack: ProfessionalServicePack };

export interface YouDashboardPdfRow {
  id: string;
  title: string;
  meta: string;
  subtitle: string;
  sortKey: number;
}

export type YouRecentActivityItem =
  | { kind: "entry"; entry: BusinessEntry; sortKey: number }
  | { kind: "pack"; pack: ProfessionalServicePack; sortKey: number };

export interface YouDashboardSummary {
  stats: YouDashboardStats;
  /** @deprecated Prefer recentActivity — diary-only slice kept for compatibility. */
  recent: BusinessEntry[];
  recentActivity: YouRecentActivityItem[];
  attentionPreview: YouAttentionItem[];
  attentionTotal: number;
  savedPdfPreview: YouDashboardPdfRow[];
  savedPdfTotal: number;
}

/** Section visibility flags — single source for You dashboard conditional rendering. */
export interface YouDashboardVisibility {
  hasRecords: boolean;
  hasDrafts: boolean;
  hasSavedPdfs: boolean;
  hasUpcomingItems: boolean;
  hasNeedsAttention: boolean;
  hasLetterheadDocs: boolean;
  hasAnyDashboardActivity: boolean;
  showRecentActivity: boolean;
  showSavedDrafts: boolean;
  showSavedPdfs: boolean;
  showNeedsAttention: boolean;
}

export interface YouDashboardViewModel extends YouDashboardSummary {
  visibility: YouDashboardVisibility;
}

function isPdfEntry(entry: BusinessEntry): boolean {
  if (entry.source !== "composer" && entry.source !== "letterhead") return false;
  if (entry.entryType === "legacy" || entry.entryType === "letterhead_matter") return false;
  return Boolean(entry.pdfUri || entry.documentHistory?.lastGeneratedAt);
}

function deriveYouDashboardVisibility(
  entries: BusinessEntry[],
  letterheadDocs: LetterheadDocument[],
  proPacks: ProfessionalServicePack[],
  summary: YouDashboardSummary,
  activeDraftCount: number
): YouDashboardVisibility {
  const hasRecords =
    entries.length > 0 || proPacks.length > 0 || summary.recentActivity.length > 0;
  const hasDrafts = activeDraftCount > 0;
  const hasSavedPdfs = summary.savedPdfTotal > 0;
  const hasUpcomingItems = summary.stats.upcoming > 0;
  const hasNeedsAttention = summary.attentionTotal > 0;
  const hasLetterheadDocs = letterheadDocs.some((d) => d.pdfUri || d.saved);

  const hasAnyDashboardActivity =
    hasRecords || hasDrafts || hasSavedPdfs || hasNeedsAttention || hasLetterheadDocs;

  return {
    hasRecords,
    hasDrafts,
    hasSavedPdfs,
    hasUpcomingItems,
    hasNeedsAttention,
    hasLetterheadDocs,
    hasAnyDashboardActivity,
    showRecentActivity: summary.recentActivity.length > 0,
    showSavedDrafts: hasDrafts,
    showSavedPdfs: hasSavedPdfs,
    showNeedsAttention: hasNeedsAttention,
  };
}

function buildYouDashboardSummaryCore(
  entries: BusinessEntry[],
  letterheadDocs: LetterheadDocument[],
  proPacks: ProfessionalServicePack[],
  t: TFn
): YouDashboardSummary {
  const today = todayStartMs();
  const weekStart = today - 6 * ONE_DAY;
  const now = Date.now();
  let todayCount = 0;
  let weekCount = 0;
  let upcomingCount = 0;

  for (const e of entries) {
    if (e.entryDate >= today && e.entryDate < today + ONE_DAY) todayCount++;
    if (e.entryDate >= weekStart) weekCount++;
    if (e.reminder && e.reminder.at > now) upcomingCount++;
  }
  for (const p of proPacks) {
    if (p.matterDate >= today && p.matterDate < today + ONE_DAY) todayCount++;
    if (p.matterDate >= weekStart) weekCount++;
    if (p.reminder && p.reminder.at > now) upcomingCount++;
  }

  const recent = entries.slice(0, YOU_RECENT_CAP);

  const recentActivity: YouRecentActivityItem[] = [
    ...entries.map((entry) => ({
      kind: "entry" as const,
      entry,
      sortKey: entry.updatedAt,
    })),
    ...proPacks.map((pack) => ({
      kind: "pack" as const,
      pack,
      sortKey: pack.updatedAt,
    })),
  ]
    .sort((a, b) => b.sortKey - a.sortKey)
    .slice(0, YOU_RECENT_CAP);

  const attentionAll: YouAttentionItem[] = [];
  for (const e of entries) {
    if (e.reminder && e.reminder.at > now) {
      attentionAll.push({ kind: "entry", at: e.reminder.at, entry: e });
    }
  }
  for (const p of proPacks) {
    const at = p.reminder?.at ?? p.dueDate;
    if (at && at > now) attentionAll.push({ kind: "pack", at, pack: p });
  }
  attentionAll.sort((a, b) => a.at - b.at);

  const pdfRows: YouDashboardPdfRow[] = [];

  for (const e of entries) {
    if (!isPdfEntry(e)) continue;
    pdfRows.push({
      id: `entry-${e.id}`,
      sortKey: e.updatedAt,
      title: e.title,
      meta: `${t(entryTypeLabelKey(e.entryType))} · ${formatEntryDate(e.entryDate)}`,
      subtitle: entryListSummary(e, t),
    });
  }

  const letterheadSlice = letterheadDocs
    .filter((d) => d.pdfUri || d.saved)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, YOU_LETTERHEAD_SCAN_CAP);

  for (const doc of letterheadSlice) {
    const sub =
      doc.input.subject?.trim() || doc.input.body.trim().slice(0, 72) || "";
    pdfRows.push({
      id: `lh-${doc.id}`,
      sortKey: doc.updatedAt,
      title: doc.title,
      meta: `${t("composer.types.letterhead_matter")} · ${formatEntryDate(doc.input.date)}`,
      subtitle: sub,
    });
  }

  for (const p of proPacks) {
    if (!p.pdfUri) continue;
    pdfRows.push({
      id: `pack-${p.id}`,
      sortKey: p.updatedAt,
      title: p.title,
      meta: `${t("proPack.title")} · ${t(matterLabelKey(p.professionalCategory, p.matterType))} · ${t(statusLabelKey(p.status))}`,
      subtitle: String(p.facts.matterSummary ?? "").slice(0, 72),
    });
  }

  pdfRows.sort((a, b) => b.sortKey - a.sortKey);
  const savedPdfTotal = pdfRows.length;

  return {
    stats: { today: todayCount, thisWeek: weekCount, upcoming: upcomingCount },
    recent,
    recentActivity,
    attentionPreview: attentionAll.slice(0, YOU_ATTENTION_CAP),
    attentionTotal: attentionAll.length,
    savedPdfPreview: pdfRows.slice(0, YOU_PDF_PREVIEW_CAP),
    savedPdfTotal,
  };
}

/** One pass over entries for stats; separate capped passes for lists. */
export function buildYouDashboardSummary(
  entries: BusinessEntry[],
  letterheadDocs: LetterheadDocument[],
  proPacks: ProfessionalServicePack[],
  t: TFn
): YouDashboardSummary {
  return buildYouDashboardSummaryCore(entries, letterheadDocs, proPacks, t);
}

/** Summary + visibility flags for the You dashboard command centre. */
export function buildYouDashboardViewModel(
  entries: BusinessEntry[],
  letterheadDocs: LetterheadDocument[],
  proPacks: ProfessionalServicePack[],
  activeDraftCount: number,
  t: TFn
): YouDashboardViewModel {
  const summary = buildYouDashboardSummaryCore(entries, letterheadDocs, proPacks, t);
  return {
    ...summary,
    visibility: deriveYouDashboardVisibility(
      entries,
      letterheadDocs,
      proPacks,
      summary,
      activeDraftCount
    ),
  };
}
