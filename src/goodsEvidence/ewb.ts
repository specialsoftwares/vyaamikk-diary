/**
 * EWB is three independent histories plus replacement links.
 * Portal cancellation, internal movement and QC must not overwrite one another.
 */

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

export interface EwbPortalObservation {
  status: EwbPortalStatus;
  observedAtUtc: string;
  source: string;
  verificationLevel: EwbVerificationLevel;
}

export interface EwbReplacementLink {
  previousEbn: string;
  newEbn: string;
  reason: string;
}

export interface EwbHistories {
  portal: EwbPortalObservation[];
  movement: EwbInternalMovement;
  qc: "hold" | "accepted" | "partial" | "rejected" | null;
  replacements: EwbReplacementLink[];
}

export function emptyEwbHistories(): EwbHistories {
  return { portal: [], movement: "planned", qc: null, replacements: [] };
}

export function appendPortalObservation(
  histories: EwbHistories,
  observation: EwbPortalObservation
): EwbHistories {
  return { ...histories, portal: [...histories.portal, observation] };
}

export function setInternalMovement(
  histories: EwbHistories,
  movement: EwbInternalMovement
): EwbHistories {
  return { ...histories, movement };
}

export function setQcIndependentOfPortal(
  histories: EwbHistories,
  qc: NonNullable<EwbHistories["qc"]>
): EwbHistories {
  return { ...histories, qc };
}

export function linkReplacement(
  histories: EwbHistories,
  link: EwbReplacementLink
): EwbHistories {
  return { ...histories, replacements: [...histories.replacements, link] };
}

/** Delivery of goods does not cancel the portal EWB. */
export function recordArrival(histories: EwbHistories): EwbHistories {
  return setInternalMovement(histories, "arrived_received");
}

/** Portal cancel is an observation; movement and QC stay as they were. */
export function recordPortalCancellation(
  histories: EwbHistories,
  observation: Omit<EwbPortalObservation, "status">
): EwbHistories {
  return appendPortalObservation(histories, { ...observation, status: "cancelled" });
}

export function latestPortalStatus(histories: EwbHistories): EwbPortalStatus | null {
  const last = histories.portal[histories.portal.length - 1];
  return last ? last.status : null;
}
