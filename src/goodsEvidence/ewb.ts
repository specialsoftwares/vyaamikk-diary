/**
 * EWB is three independent event histories plus replacement links.
 * Portal cancellation, internal movement and QC must not overwrite one another.
 */

import { cloneSnapshot, freezeSnapshot } from "./snapshot";

export type EwbPortalStatus =
  | "generated_active"
  | "cancelled"
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
  | (EwbPortalObservationBase & { status: Exclude<EwbPortalStatus, "cancelled"> })
  | (EwbPortalObservationBase & { status: "cancelled"; evidence: EwbCancellationEvidence });

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

export function appendPortalObservation(
  histories: EwbHistories,
  observation: EwbPortalObservation
): EwbHistories {
  const current = cloneSnapshot(histories);
  current.portal.push(freezeSnapshot(cloneSnapshot(observation)));
  return seal(current);
}

export function appendMovementEvent(histories: EwbHistories, event: EwbMovementEvent): EwbHistories {
  if (!event.reason.trim()) {
    throw new Error("goodsEvidence: movement event reason is required");
  }
  const current = cloneSnapshot(histories);
  current.movementEvents.push(freezeSnapshot(cloneSnapshot(event)));
  return seal(current);
}

export function appendQcEvent(histories: EwbHistories, event: EwbQcEvent): EwbHistories {
  if (!event.reason.trim()) {
    throw new Error("goodsEvidence: QC event reason is required");
  }
  const current = cloneSnapshot(histories);
  current.qcEvents.push(freezeSnapshot(cloneSnapshot(event)));
  return seal(current);
}

export function linkReplacement(
  histories: EwbHistories,
  link: EwbReplacementLink
): EwbHistories {
  const current = cloneSnapshot(histories);
  current.replacements.push(freezeSnapshot(cloneSnapshot(link)));
  return seal(current);
}

/** Delivery of goods does not cancel the portal EWB. */
export function recordArrival(histories: EwbHistories, atUtc: string, reason: string): EwbHistories {
  return appendMovementEvent(histories, { atUtc, movement: "arrived_received", reason });
}

export function cancellationEvidenceError(evidence: EwbCancellationEvidence): string | null {
  if (!evidence.reason?.trim()) return "cancellation reason is required";
  if (evidence.goodsMoved === "unknown" && !evidence.goodsMovedUnknownReason?.trim()) {
    return "unknown goodsMoved requires a reason";
  }
  if (evidence.goodsMoved !== "unknown" && evidence.goodsMovedUnknownReason) {
    return "goodsMovedUnknownReason is only for unknown";
  }
  if (evidence.linkedDocument.kind === "missing" && !evidence.linkedDocument.exceptionReason.trim()) {
    return "missing document requires an exception reason";
  }
  if (
    (evidence.linkedDocument.kind === "invoice" || evidence.linkedDocument.kind === "challan") &&
    !evidence.linkedDocument.reference.trim()
  ) {
    return "linked document reference is required";
  }
  if (!evidence.party?.trim()) return "cancellation party is required";
  if (evidence.amount.kind === "unknown" && !evidence.amount.reason.trim()) {
    return "unknown amount requires a reason";
  }
  if (evidence.replacementEbn.kind !== "present" && !evidence.replacementEbn.reason.trim()) {
    return "replacement EBN absence requires a reason";
  }
  if (evidence.replacementEbn.kind === "present" && !evidence.replacementEbn.ebn.trim()) {
    return "replacement EBN is empty";
  }
  return null;
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
  return {
    ok: true,
    histories: appendPortalObservation(histories, {
      ...cloneSnapshot(observation),
      status: "cancelled",
      evidence: cloneSnapshot(evidence),
    }),
  };
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
