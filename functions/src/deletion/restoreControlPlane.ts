/**
 * Restore holds live outside the database being restored.
 * Reading the local fence and refusing to open the holds is the control.
 * restoreServiceCanReopen only classifies booleans; it does not read or write.
 */

export type LocalRestoreDocs = {
  fence: { closed: boolean; reconciled: boolean; watermark: number } | null;
  mode: { required: boolean } | null;
};

export type OutsideHolds = {
  traffic: "closed" | "open";
  workers: "stopped" | "running";
};

export type RestoreHoldStore = {
  readDocs(): Promise<LocalRestoreDocs>;
  readHolds(): Promise<OutsideHolds>;
  writeHolds(next: OutsideHolds): Promise<void>;
};

export function createMemoryRestoreHoldStore(initial: {
  docs: LocalRestoreDocs;
  holds: OutsideHolds;
}): RestoreHoldStore & {
  snapshot(): Promise<{ docs: LocalRestoreDocs; holds: OutsideHolds }>;
  replaceDocs(next: LocalRestoreDocs): void;
} {
  let docs = initial.docs;
  let holds = initial.holds;
  return {
    async readDocs() {
      return docs;
    },
    async readHolds() {
      return holds;
    },
    async writeHolds(next) {
      holds = next;
    },
    async snapshot() {
      return { docs, holds };
    },
    replaceDocs(next: LocalRestoreDocs) {
      docs = next;
    },
  };
}

/**
 * Opens the outside holds only when both local documents exist, the fence is
 * open and reconciled, and its watermark is the current authority watermark.
 * A restored snapshot that omitted the documents cannot release the holds.
 */
export async function releaseRestoreHolds(
  store: RestoreHoldStore,
  authorityWatermark: number
): Promise<{ released: boolean; reason: string }> {
  const docs = await store.readDocs();
  if (!docs.fence || !docs.mode) {
    return { released: false, reason: "restored_primary_missing_restore_control" };
  }
  if (docs.fence.closed || !docs.fence.reconciled || docs.fence.watermark !== authorityWatermark) {
    return { released: false, reason: "fence_not_reconciled" };
  }
  if (!Number.isSafeInteger(authorityWatermark) || authorityWatermark < 1) {
    return { released: false, reason: "authority_watermark_missing" };
  }
  await store.writeHolds({ traffic: "open", workers: "running" });
  return { released: true, reason: "reconciled" };
}

export type ActivationStep =
  | "confirm_authority"
  | "write_open_reconciled_fence"
  | "issue_admitted_tokens"
  | "observe_claims"
  | "enable_required_mode"
  | "enable_refresh"
  | "keep_holds_closed"
  | "write_closed_fence"
  | "rewrite_open_fence"
  | "release_worker_hold"
  | "release_traffic_hold";

const INITIAL: readonly ActivationStep[] = [
  "confirm_authority",
  "write_open_reconciled_fence",
  "issue_admitted_tokens",
  "observe_claims",
  "enable_required_mode",
  "enable_refresh",
];

const RECOVERY: readonly ActivationStep[] = [
  "keep_holds_closed",
  "confirm_authority",
  "write_closed_fence",
  "rewrite_open_fence",
  "issue_admitted_tokens",
  "release_worker_hold",
  "release_traffic_hold",
];

/** Initial activation never closes the fence in order to mint the first claim. */
export function nextInitialActivation(done: readonly ActivationStep[]): ActivationStep | "complete" {
  return INITIAL.find((step) => !done.includes(step)) ?? "complete";
}

/**
 * Disaster recovery keeps the outside holds closed until the fence is rewritten
 * open, reconciled, and equal to the current authority. Minting happens after
 * that rewrite. A closed fence is not a step that issues tokens.
 */
export function nextDisasterRecovery(done: readonly ActivationStep[]): ActivationStep | "complete" {
  return RECOVERY.find((step) => !done.includes(step)) ?? "complete";
}

export function mintAllowed(sequence: "initial" | "recovery", done: readonly ActivationStep[], fenceClosed: boolean): boolean {
  if (fenceClosed) return false;
  if (sequence === "initial") return done.includes("write_open_reconciled_fence");
  return done.includes("rewrite_open_fence");
}
