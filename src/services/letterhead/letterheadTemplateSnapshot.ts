/**
 * One active template lives on the user config. Each saved letter keeps an
 * immutable reference to the design used at save time. Replacing the active
 * template writes a new storage object; this snapshot keeps the previous path.
 * Documents that never stored a snapshot are not given a guessed design.
 */

import type { LetterheadGeneratedLayout, LetterheadSourceType } from "./letterheadGeneratedLayout";
import type { LetterheadPlacement } from "./letterheadPlacement";
import type { LetterheadConfig, LetterheadDocument, LetterheadMargins } from "./types";

const MAX_EMBEDDED_DATA_URI = 120_000;

export interface LetterheadTemplateSnapshot {
  sourceType: LetterheadSourceType;
  generatedLayout: LetterheadGeneratedLayout | null;
  imageWidth: number;
  imageHeight: number;
  letterheadImageStoragePath: string | null;
  letterheadImageDownloadUrl: string | null;
  /** Small inline image only. Large page images stay on their storage path. */
  imageDataUri: string | null;
  margins: LetterheadMargins;
  placement: LetterheadPlacement;
  signatureDataUri: string | null;
  stampDataUri: string | null;
  capturedAt: number;
}

export type HistoricalLetterheadResolution =
  | { kind: "snapshot"; config: LetterheadConfig }
  | { kind: "live_unchanged"; config: LetterheadConfig }
  | { kind: "unavailable" };

function boundedDataUri(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed.startsWith("data:")) return null;
  if (trimmed.length > MAX_EMBEDDED_DATA_URI) return null;
  return trimmed;
}

export function letterheadReadyToRender(config: LetterheadConfig | null | undefined): boolean {
  if (!config) return false;
  if (config.sourceType === "generated_layout" && config.generatedLayout) return true;
  return Boolean(
    config.letterheadImageStoragePath?.trim() ||
      config.letterheadImageDownloadUrl?.trim() ||
      config.imageDataUri?.trim()
  );
}

export function freezeLetterheadTemplateSnapshot(
  config: LetterheadConfig
): LetterheadTemplateSnapshot {
  const inline = config.imageDataUri?.trim() ?? "";
  const embedInline = inline.startsWith("data:") ? boundedDataUri(inline) : null;
  return {
    sourceType: config.sourceType === "generated_layout" ? "generated_layout" : "imported_image",
    generatedLayout: config.generatedLayout ?? null,
    imageWidth: config.imageWidth,
    imageHeight: config.imageHeight,
    letterheadImageStoragePath: config.letterheadImageStoragePath?.trim() || null,
    letterheadImageDownloadUrl: config.letterheadImageDownloadUrl?.trim() || null,
    imageDataUri: embedInline,
    margins: { ...config.margins },
    placement: config.placement === "header_logo" ? "header_logo" : "complete_page",
    signatureDataUri: boundedDataUri(config.signatureDataUri),
    stampDataUri: boundedDataUri(config.stampDataUri),
    capturedAt: config.updatedAt,
  };
}

export function configFromLetterheadSnapshot(
  userId: string,
  snapshot: LetterheadTemplateSnapshot
): LetterheadConfig {
  return {
    userId,
    sourceType: snapshot.sourceType,
    generatedLayout: snapshot.generatedLayout,
    imageWidth: snapshot.imageWidth,
    imageHeight: snapshot.imageHeight,
    imageDataUri: snapshot.imageDataUri ?? snapshot.letterheadImageDownloadUrl,
    letterheadImageStoragePath: snapshot.letterheadImageStoragePath,
    letterheadImageDownloadUrl: snapshot.letterheadImageDownloadUrl,
    margins: { ...snapshot.margins },
    placement: snapshot.placement,
    signatureDataUri: snapshot.signatureDataUri,
    stampDataUri: snapshot.stampDataUri,
    repeatTemplateAllPages: true,
    createdAt: snapshot.capturedAt,
    updatedAt: snapshot.capturedAt,
  };
}

function isPlacement(value: unknown): value is LetterheadPlacement {
  return value === "header_logo" || value === "complete_page";
}

export function parseLetterheadTemplateSnapshot(
  raw: unknown
): LetterheadTemplateSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<LetterheadTemplateSnapshot>;
  if (!value.margins || typeof value.margins !== "object") return null;
  const margins = value.margins;
  if (
    typeof margins.topPct !== "number" ||
    typeof margins.bottomPct !== "number" ||
    typeof margins.leftPct !== "number" ||
    typeof margins.rightPct !== "number"
  ) {
    return null;
  }
  return {
    sourceType: value.sourceType === "generated_layout" ? "generated_layout" : "imported_image",
    generatedLayout: value.generatedLayout ?? null,
    imageWidth: Number(value.imageWidth ?? 0),
    imageHeight: Number(value.imageHeight ?? 0),
    letterheadImageStoragePath: value.letterheadImageStoragePath?.trim() || null,
    letterheadImageDownloadUrl: value.letterheadImageDownloadUrl?.trim() || null,
    imageDataUri: boundedDataUri(value.imageDataUri),
    margins: { ...margins },
    placement: isPlacement(value.placement) ? value.placement : "complete_page",
    signatureDataUri: boundedDataUri(value.signatureDataUri),
    stampDataUri: boundedDataUri(value.stampDataUri),
    capturedAt: Number(value.capturedAt ?? 0),
  };
}

export function resolveHistoricalLetterhead(
  doc: Pick<LetterheadDocument, "userId" | "templateSnapshot" | "templateRefUpdatedAt">,
  live: LetterheadConfig | null
): HistoricalLetterheadResolution {
  const snapshot = doc.templateSnapshot ?? null;
  if (snapshot) {
    return {
      kind: "snapshot",
      config: configFromLetterheadSnapshot(doc.userId, snapshot),
    };
  }
  if (
    live &&
    doc.templateRefUpdatedAt != null &&
    live.updatedAt === doc.templateRefUpdatedAt
  ) {
    return { kind: "live_unchanged", config: live };
  }
  return { kind: "unavailable" };
}
