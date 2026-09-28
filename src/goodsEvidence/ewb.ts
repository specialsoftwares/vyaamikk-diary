/**
 * EWB is three independent event histories plus replacement links.
 * Portal cancellation, internal movement and QC must not overwrite one another.
 */

import { cloneSnapshot, freezeSnapshot } from "./snapshot";

export type EwbPortalStatus =
  | "generated_active"
  | "cancelled"
  | "cancellation_unvalidated"
  | "expired"
  | "closed"
  | "unknown";

export type EwbVerificationLevel = "user_reported" | "imported_document" | "official_lookup";

export type EwbInternalMovement =
  | "planned"
  | "in_transit"
  | "arrived_received"
  | "gate_refused"
  | "return_in_transit"
  | "return_delivered";

export type EwbLink =
  | {
      kind: "present";
      ebn: string;
      generatedBy: "supplier" | "recipient" | "transporter" | "other" | "unknown";
      generatingIdentity: string | null;
      sourceGeneratedAt: string | null;
      sourceValidUntil: string | null;
    }
  | { kind: "none" }
  | { kind: "not_applicable"; reason: string }
  | { kind: "unknown"; reason: string };

export type GoodsMoved = "yes" | "no" | "unknown";

export interface EwbCancellationEvidence {
  reason: string;
  goodsMoved: GoodsMoved;
  goodsMovedUnknownReason: string | null;
  linkedDocument:
    | { kind: "invoice" | "challan"; reference: string }
    | { kind: "missing"; exceptionReason: string };
  party: string;
  amount:
    | { kind: "present"; currency: string; minorUnits: number }
    | { kind: "unknown"; reason: string };
  replacementEbn:
    | { kind: "present"; ebn: string }
    | { kind: "none"; reason: string }
    | { kind: "pending"; reason: string }
    | { kind: "not_applicable"; reason: string };
}

export interface EwbPortalObservationBase {
  observedAtUtc: string;
  source: string;
  verificationLevel: EwbVerificationLevel;
}

export type EwbPortalObservation =
  | (EwbPortalObservationBase & { status: Exclude<EwbPortalStatus, "cancelled" | "cancellation_unvalidated"> })
  | (EwbPortalObservationBase & { status: "cancelled"; evidence: EwbCancellationEvidence })
  | (EwbPortalObservationBase & {
      status: "cancellation_unvalidated";
      incompleteReasons: string[];
      presentedEvidence: unknown;
    });

export interface EwbMovementEvent {
  atUtc: string;
  movement: EwbInternalMovement;
  reason: string;
}

export interface EwbQcEvent {
  atUtc: string;
  qc: "hold" | "accepted" | "partial" | "rejected";
  reason: string;
}

export interface EwbReplacementLink {
  previousEbn: string;
  newEbn: string;
  reason: string;
}

export interface EwbHistories {
  portal: EwbPortalObservation[];
  movementEvents: EwbMovementEvent[];
  qcEvents: EwbQcEvent[];
  replacements: EwbReplacementLink[];
}

export type PortalObservationAdmission = "admitted" | "unvalidated_incomplete";

export type PortalAppendResult =
  | {
      ok: true;
      histories: EwbHistories;
      admission: PortalObservationAdmission;
      incompleteReasons?: string[];
    }
  | { ok: false; detail: string };

function seal(histories: EwbHistories): EwbHistories {
  return freezeSnapshot(cloneSnapshot(histories));
}

export function emptyEwbHistories(): EwbHistories {
  return seal({ portal: [], movementEvents: [], qcEvents: [], replacements: [] });
}

export function latestMovement(histories: EwbHistories): EwbInternalMovement | null {
  const last = histories.movementEvents[histories.movementEvents.length - 1];
  return last ? last.movement : null;
}

export function latestQc(histories: EwbHistories): EwbQcEvent["qc"] | null {
  const last = histories.qcEvents[histories.qcEvents.length - 1];
  return last ? last.qc : null;
}

const VERIFICATION_LEVELS = new Set<EwbVerificationLevel>([
  "user_reported",
  "imported_document",
  "official_lookup",
]);
const PORTAL_STATUSES = new Set<EwbPortalStatus>([
  "generated_active",
  "cancelled",
  "cancellation_unvalidated",
  "expired",
  "closed",
  "unknown",
]);
const GOODS_MOVED = new Set<GoodsMoved>(["yes", "no", "unknown"]);
const MOVEMENTS = new Set<EwbInternalMovement>([
  "planned",
  "in_transit",
  "arrived_received",
  "gate_refused",
  "return_in_transit",
  "return_delivered",
]);
const QC = new Set(["hold", "accepted", "partial", "rejected"]);

function observationBaseError(value: Record<string, unknown>): string | null {
  if (typeof value.observedAtUtc !== "string" || !value.observedAtUtc.trim()) {
    return "portal observation time is required";
  }
  if (typeof value.source !== "string" || !value.source.trim()) {
    return "portal observation source is required";
  }
  if (typeof value.verificationLevel !== "string" || !VERIFICATION_LEVELS.has(value.verificationLevel as EwbVerificationLevel)) {
    return "portal verification level is invalid";
  }
  return null;
}

export function cancellationEvidenceError(evidence: unknown): string | null {
  if (evidence == null || typeof evidence !== "object") return "cancellation evidence is required";
  const record = evidence as Partial<EwbCancellationEvidence> & {
    linkedDocument?: { kind?: string; reference?: string; exceptionReason?: string };
    amount?: { kind?: string; currency?: string; minorUnits?: number; reason?: string };
    replacementEbn?: { kind?: string; ebn?: string; reason?: string };
  };
  if (typeof record.reason !== "string" || !record.reason.trim()) return "cancellation reason is required";
  if (typeof record.goodsMoved !== "string" || !GOODS_MOVED.has(record.goodsMoved)) {
    return "goodsMoved is invalid";
  }
  if (record.goodsMoved === "unknown") {
    if (typeof record.goodsMovedUnknownReason !== "string" || !record.goodsMovedUnknownReason.trim()) {
      return "unknown goodsMoved requires a reason";
    }
  } else if (record.goodsMovedUnknownReason) {
    return "goodsMovedUnknownReason is only for unknown";
  }
  const linked = record.linkedDocument;
  if (!linked || typeof linked !== "object" || typeof linked.kind !== "string") {
    return "linked document is required";
  }
  if (linked.kind === "missing") {
    if (typeof linked.exceptionReason !== "string" || !linked.exceptionReason.trim()) {
      return "missing document requires an exception reason";
    }
  } else if (linked.kind === "invoice" || linked.kind === "challan") {
    if (typeof linked.reference !== "string" || !linked.reference.trim()) {
      return "linked document reference is required";
    }
  } else {
    return "linked document is invalid";
  }
  if (typeof record.party !== "string" || !record.party.trim()) return "cancellation party is required";
  const amount = record.amount;
  if (!amount || typeof amount !== "object" || typeof amount.kind !== "string") {
    return "cancellation amount is required";
  }
  if (amount.kind === "unknown") {
    if (typeof amount.reason !== "string" || !amount.reason.trim()) return "unknown amount requires a reason";
  } else if (amount.kind === "present") {
    if (typeof amount.currency !== "string" || !amount.currency.trim()) {
      return "present amount currency is required";
    }
    if (!Number.isInteger(amount.minorUnits)) return "present amount minorUnits must be an integer";
  } else {
    return "cancellation amount is invalid";
  }
  const replacement = record.replacementEbn;
  if (!replacement || typeof replacement !== "object" || typeof replacement.kind !== "string") {
    return "replacement EBN is required";
  }
  if (replacement.kind === "present") {
    if (typeof replacement.ebn !== "string" || !replacement.ebn.trim()) return "replacement EBN is empty";
  } else if (
    replacement.kind === "none" ||
    replacement.kind === "pending" ||
    replacement.kind === "not_applicable"
  ) {
    if (typeof replacement.reason !== "string" || !replacement.reason.trim()) {
      return "replacement EBN absence requires a reason";
    }
  } else {
    return "replacement EBN is invalid";
  }
  return null;
}

function pushPortal(histories: EwbHistories, observation: EwbPortalObservation): EwbHistories {
  const current = cloneSnapshot(histories);
  current.portal.push(freezeSnapshot(cloneSnapshot(observation)));
  return seal(current);
}

/**
 * Public append boundary. Cancelled observations are admitted only with valid
 * evidence. Incomplete imported cancellations are retained as
 * cancellation_unvalidated, never as a fully admitted cancellation.
 */
export function appendPortalObservation(
  histories: EwbHistories,
  observation: unknown
): PortalAppendResult {
  if (observation == null || typeof observation !== "object") {
    return { ok: false, detail: "portal observation is required" };
  }
  const record = observation as Record<string, unknown>;
  const baseErr = observationBaseError(record);
  if (baseErr) return { ok: false, detail: baseErr };
  if (typeof record.status !== "string" || !PORTAL_STATUSES.has(record.status as EwbPortalStatus)) {
    return { ok: false, detail: "portal status is invalid" };
  }
  const base: EwbPortalObservationBase = {
    observedAtUtc: record.observedAtUtc as string,
    source: record.source as string,
    verificationLevel: record.verificationLevel as EwbVerificationLevel,
  };
  if (record.status === "cancelled") {
    const evidenceErr = cancellationEvidenceError(record.evidence);
    if (evidenceErr) {
      const incomplete: EwbPortalObservation = {
        ...cloneSnapshot(base),
        status: "cancellation_unvalidated",
        incompleteReasons: [evidenceErr],
        presentedEvidence: cloneSnapshot(record.evidence ?? null),
      };
      return {
        ok: true,
        histories: pushPortal(histories, incomplete),
        admission: "unvalidated_incomplete",
        incompleteReasons: [evidenceErr],
      };
    }
    const admitted: EwbPortalObservation = {
      ...cloneSnapshot(base),
      status: "cancelled",
      evidence: cloneSnapshot(record.evidence as EwbCancellationEvidence),
    };
    return { ok: true, histories: pushPortal(histories, admitted), admission: "admitted" };
  }
  if (record.status === "cancellation_unvalidated") {
    const reasons = Array.isArray(record.incompleteReasons)
      ? record.incompleteReasons.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    if (reasons.length === 0) {
      return { ok: false, detail: "unvalidated cancellation requires incomplete reasons" };
    }
    const incomplete: EwbPortalObservation = {
      ...cloneSnapshot(base),
      status: "cancellation_unvalidated",
      incompleteReasons: reasons,
      presentedEvidence: cloneSnapshot(record.presentedEvidence ?? record.evidence ?? null),
    };
    return {
      ok: true,
      histories: pushPortal(histories, incomplete),
      admission: "unvalidated_incomplete",
      incompleteReasons: reasons,
    };
  }
  const admitted: EwbPortalObservation = {
    ...cloneSnapshot(base),
    status: record.status as Exclude<EwbPortalStatus, "cancelled" | "cancellation_unvalidated">,
  };
  return { ok: true, histories: pushPortal(histories, admitted), admission: "admitted" };
}

export function appendMovementEvent(histories: EwbHistories, event: unknown): EwbHistories {
  if (event == null || typeof event !== "object") {
    throw new Error("goodsEvidence: movement event is required");
  }
  const record = event as EwbMovementEvent;
  if (typeof record.atUtc !== "string" || !record.atUtc.trim()) {
    throw new Error("goodsEvidence: movement event time is required");
  }
  if (typeof record.movement !== "string" || !MOVEMENTS.has(record.movement)) {
    throw new Error("goodsEvidence: movement is invalid");
  }
  if (typeof record.reason !== "string" || !record.reason.trim()) {
    throw new Error("goodsEvidence: movement event reason is required");
  }
  const current = cloneSnapshot(histories);
  current.movementEvents.push(freezeSnapshot(cloneSnapshot(record)));
  return seal(current);
}

export function appendQcEvent(histories: EwbHistories, event: unknown): EwbHistories {
  if (event == null || typeof event !== "object") {
    throw new Error("goodsEvidence: QC event is required");
  }
  const record = event as EwbQcEvent;
  if (typeof record.atUtc !== "string" || !record.atUtc.trim()) {
    throw new Error("goodsEvidence: QC event time is required");
  }
  if (typeof record.qc !== "string" || !QC.has(record.qc)) {
    throw new Error("goodsEvidence: QC is invalid");
  }
  if (typeof record.reason !== "string" || !record.reason.trim()) {
    throw new Error("goodsEvidence: QC event reason is required");
  }
  const current = cloneSnapshot(histories);
  current.qcEvents.push(freezeSnapshot(cloneSnapshot(record)));
  return seal(current);
}

export function linkReplacement(
  histories: EwbHistories,
  link: unknown
): EwbHistories {
  if (link == null || typeof link !== "object") {
    throw new Error("goodsEvidence: replacement link is required");
  }
  const record = link as EwbReplacementLink;
  if (typeof record.previousEbn !== "string" || !record.previousEbn.trim()) {
    throw new Error("goodsEvidence: previous EBN is required");
  }
  if (typeof record.newEbn !== "string" || !record.newEbn.trim()) {
    throw new Error("goodsEvidence: new EBN is required");
  }
  if (typeof record.reason !== "string" || !record.reason.trim()) {
    throw new Error("goodsEvidence: replacement reason is required");
  }
  const current = cloneSnapshot(histories);
  current.replacements.push(freezeSnapshot(cloneSnapshot(record)));
  return seal(current);
}

/** Delivery of goods does not cancel the portal EWB. */
export function recordArrival(histories: EwbHistories, atUtc: string, reason: string): EwbHistories {
  return appendMovementEvent(histories, { atUtc, movement: "arrived_received", reason });
}

export type CancellationResult =
  | { ok: true; histories: EwbHistories }
  | { ok: false; detail: string };

/** Portal cancel stores the evidence with the observation; movement and QC stay as events. */
export function recordPortalCancellation(
  histories: EwbHistories,
  observation: EwbPortalObservationBase,
  evidence: EwbCancellationEvidence
): CancellationResult {
  const err = cancellationEvidenceError(evidence);
  if (err) return { ok: false, detail: err };
  const appended = appendPortalObservation(histories, {
    ...cloneSnapshot(observation),
    status: "cancelled",
    evidence: cloneSnapshot(evidence),
  });
  if (!appended.ok) return appended;
  if (appended.admission !== "admitted") {
    return { ok: false, detail: appended.incompleteReasons?.[0] ?? "cancellation was not fully admitted" };
  }
  return { ok: true, histories: appended.histories };
}

export function latestPortalStatus(histories: EwbHistories): EwbPortalStatus | null {
  const last = histories.portal[histories.portal.length - 1];
  return last ? last.status : null;
}

export function latestCancellationEvidence(
  histories: EwbHistories
): EwbCancellationEvidence | null {
  const last = histories.portal[histories.portal.length - 1];
  if (!last || last.status !== "cancelled") return null;
  return last.evidence;
}

export function currentMovement(histories: EwbHistories): EwbInternalMovement {
  return latestMovement(histories) ?? "planned";
}
