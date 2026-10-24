/**
 * Letterhead draft mapper.
 *
 * Serialises a `LetterheadDocumentInput` to/from the generic form-draft
 * payload (a plain JSON record) so letterhead matter can be saved and resumed
 * through the existing `formDraftsRepository` (`draftKind: "letterhead"`).
 *
 * The mapper is intentionally lossless for every form field and tolerant of
 * partial/legacy payloads when restoring.
 */

import { todayStartMs } from "@/utils/date";

import {
  configFromLetterheadSnapshot,
  freezeLetterheadTemplateSnapshot,
  parseLetterheadTemplateSnapshot,
} from "./letterheadTemplateSnapshot";
import type { LetterheadConfig, LetterheadDocumentInput } from "./types";

export const LETTERHEAD_DRAFT_KIND = "letterhead" as const;
export const LETTERHEAD_DRAFT_SCOPE = "letterhead_matter" as const;

export function letterheadInputToDraftPayload(
  input: LetterheadDocumentInput,
  template: LetterheadConfig | null
): Record<string, unknown> {
  const snapshot = template ? freezeLetterheadTemplateSnapshot(template) : null;
  return {
    title: input.title ?? "",
    date: input.date ?? todayStartMs(),
    reference: input.reference ?? "",
    recipientName: input.recipientName ?? "",
    recipientDesignation: input.recipientDesignation ?? "",
    recipientCompany: input.recipientCompany ?? "",
    recipientAddress: input.recipientAddress ?? "",
    subject: input.subject ?? "",
    salutation: input.salutation ?? "",
    body: input.body ?? "",
    closing: input.closing ?? "",
    name: input.name ?? "",
    designation: input.designation ?? "",
    place: input.place ?? "",
    useSignature: Boolean(input.useSignature),
    useStamp: Boolean(input.useStamp),
    templateSnapshot: snapshot,
    templateAvailability: snapshot ? "snapshot" : "unavailable",
  };
}

export type ResolvedDraftLetterhead = {
  input: LetterheadDocumentInput;
  /** Null when the original template was not stored. Do not substitute the live template. */
  preview: LetterheadConfig | null;
  gap: null | "draft";
};

export function resolveDraftLetterhead(
  payload: Record<string, unknown>,
  live: LetterheadConfig
): ResolvedDraftLetterhead {
  const input = draftPayloadToLetterheadInput(payload);
  const raw = payload.templateSnapshot;
  const availability = payload.templateAvailability;
  if (availability === "snapshot" && raw) {
    const snapshot = parseLetterheadTemplateSnapshot(raw);
    if (snapshot) {
      return {
        input,
        preview: configFromLetterheadSnapshot(live.userId, snapshot),
        gap: null,
      };
    }
  }
  return { input, preview: null, gap: "draft" };
}

function str(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  return typeof v === "string" ? v : "";
}

function bool(payload: Record<string, unknown>, key: string): boolean {
  return payload[key] === true;
}

export function draftPayloadToLetterheadInput(
  payload: Record<string, unknown>
): LetterheadDocumentInput {
  const rawDate = payload.date;
  const date =
    typeof rawDate === "number" && Number.isFinite(rawDate) ? rawDate : todayStartMs();
  return {
    title: str(payload, "title"),
    date,
    reference: str(payload, "reference"),
    recipientName: str(payload, "recipientName"),
    recipientDesignation: str(payload, "recipientDesignation"),
    recipientCompany: str(payload, "recipientCompany"),
    recipientAddress: str(payload, "recipientAddress"),
    subject: str(payload, "subject"),
    salutation: str(payload, "salutation"),
    body: str(payload, "body"),
    closing: str(payload, "closing"),
    name: str(payload, "name"),
    designation: str(payload, "designation"),
    place: str(payload, "place"),
    useSignature: bool(payload, "useSignature"),
    useStamp: bool(payload, "useStamp"),
  };
}

/** A letterhead draft is worth persisting once it has a subject or body. */
export function isLetterheadDraftMeaningful(input: LetterheadDocumentInput): boolean {
  return Boolean(input.subject?.trim() || input.body?.trim());
}
