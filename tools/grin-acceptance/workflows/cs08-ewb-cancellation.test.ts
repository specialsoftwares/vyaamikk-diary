/**
 * CS-08 QA: PURE_DOMAIN EWB cancellation retains facts; delivery does not rewrite portal.
 * Does not call a live GST/EWB portal.
 */
import assert from "node:assert/strict";

import {
  emptyEwbHistories,
  latestCancellationEvidence,
  latestMovement,
  latestPortalStatus,
  recordArrival,
  recordPortalCancellation,
} from "@/goodsEvidence/ewb";

import { logWorkflowExecution } from "../workflowEvidence";

async function main(): Promise<void> {
  const evidence = {
    reason: "vehicle breakdown before dispatch",
    goodsMoved: "unknown" as const,
    goodsMovedUnknownReason: "driver not reached",
    linkedDocument: { kind: "invoice" as const, reference: "INV-CS08" },
    party: "supplier",
    amount: { kind: "unknown" as const, reason: "not on hand" },
    replacementEbn: { kind: "none" as const, reason: "not replaced" },
  };
  let histories = emptyEwbHistories();
  const cancelled = recordPortalCancellation(
    histories,
    {
      observedAtUtc: "2026-09-28T10:00:00.000Z",
      source: "user_reported",
      verificationLevel: "user_reported",
    },
    evidence
  );
  assert.equal(cancelled.ok, true);
  if (!cancelled.ok) throw new Error("cancel");
  histories = cancelled.histories;
  assert.equal(latestPortalStatus(histories), "cancelled");
  assert.equal(latestCancellationEvidence(histories)?.goodsMoved, "unknown");
  histories = recordArrival(histories, "2026-09-28T12:00:00.000Z", "gate inward");
  assert.equal(latestMovement(histories), "arrived_received");
  assert.equal(latestPortalStatus(histories), "cancelled");
  assert.equal(latestCancellationEvidence(histories)?.goodsMoved, "unknown");
  logWorkflowExecution("CS-08", ["PURE_DOMAIN"]);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
