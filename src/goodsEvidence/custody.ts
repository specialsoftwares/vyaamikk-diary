/**
 * Original receipt disposition, physical custody and QC status are separate.
 *
 * - Original disposition is ImmutableGrin.custody on the issued original
 *   (received vs refused at gate, or the disposition recorded at issuance).
 *   Amendments and returns never rewrite that original document.
 * - Physical custody is derived from remaining line balances:
 *   physicalReceived minus dispatchedReturn across every line.
 *   A partial return must not label the whole receipt returned.
 * - QC status lives on GrinView.qcStatus. Hold is not gate refusal.
 *   Accept/reject after hold replaces held_for_qc. A linked return
 *   correction restates a recorded dispatch; it is not a new physical
 *   movement.
 */

import { availableCustody, compareDecimal, type LineQuantityLedgers } from "./quantities";
import type { CustodyState, QcStatus } from "./types";

export function derivePhysicalCustody(input: {
  originalDisposition: CustodyState;
  qcStatus: QcStatus | null;
  lineLedgers: Iterable<LineQuantityLedgers>;
}): CustodyState {
  let remainingPositive = false;
  let anyDispatched = false;
  for (const line of input.lineLedgers) {
    if (compareDecimal(line.dispatchedReturn.value, "0") > 0) anyDispatched = true;
    if (compareDecimal(availableCustody(line).value, "0") > 0) remainingPositive = true;
  }

  if (!remainingPositive && anyDispatched) return "returned";
  if (anyDispatched && remainingPositive) return "partially_returned";
  if (input.originalDisposition === "refused_at_gate") return "refused_at_gate";
  if (input.qcStatus === "hold") return "held_for_qc";
  if (input.qcStatus === "accepted") return "accepted_for_stock";
  if (input.originalDisposition === "accepted_for_stock") return "accepted_for_stock";
  if (input.originalDisposition === "held_for_qc" && input.qcStatus == null) return "held_for_qc";
  return "received";
}
