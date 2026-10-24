import type { OutboxLocalState } from "@/goodsEvidence/ports";

const TRANSITIONS: Record<OutboxLocalState, readonly OutboxLocalState[]> = {
  draft: ["queued", "failed_permanent"],
  queued: ["dispatching", "conflicted", "failed_permanent"],
  dispatching: [
    "issued",
    "attachment_pending",
    "failed_retryable",
    "failed_permanent",
    "conflicted",
    "queued",
  ],
  attachment_pending: ["issued", "failed_retryable", "failed_permanent"],
  issued: [],
  conflicted: [],
  failed_retryable: ["dispatching", "failed_permanent", "queued"],
  failed_permanent: [],
};

export function canTransition(from: OutboxLocalState, to: OutboxLocalState): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OutboxLocalState, to: OutboxLocalState): void {
  if (!canTransition(from, to)) {
    throw new Error(`illegal_outbox_transition:${from}->${to}`);
  }
}

const TERMINAL: ReadonlySet<OutboxLocalState> = new Set(["issued", "conflicted", "failed_permanent"]);

export function isTerminalState(state: OutboxLocalState): boolean {
  return TERMINAL.has(state);
}

const UNSYNC: ReadonlySet<OutboxLocalState> = new Set([
  "draft",
  "queued",
  "dispatching",
  "attachment_pending",
  "conflicted",
  "failed_retryable",
  "failed_permanent",
]);

export function isUnsynchronisedState(state: OutboxLocalState): boolean {
  return UNSYNC.has(state);
}
