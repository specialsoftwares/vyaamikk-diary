/**
 * Restore holds live outside the database being restored.
 * Reading the local fence and refusing to open the holds is the control.
 * restoreServiceCanReopen only classifies booleans; it does not read or write.
 */

export type LocalRestoreDocs = {
  fence: { closed: boolean; reconciled: boolean; watermark: number } | null;
  mode: { required: boolean } | null;
};

export type HoldPhase = "closed" | "workers_released" | "traffic_released";

export type OutsideHolds = {
  traffic: "closed" | "open";
  workers: "stopped" | "running";
  phase: HoldPhase;
  revision: number;
};

export type RestoreHoldStore = {
  readDocs(): Promise<LocalRestoreDocs>;
  readHolds(): Promise<OutsideHolds>;
  writeHolds(next: OutsideHolds, expectedRevision: number): Promise<"stored" | "conflict">;
};

export function createMemoryRestoreHoldStore(initial: {
  docs: LocalRestoreDocs;
  holds: Partial<OutsideHolds> & Pick<OutsideHolds, "traffic" | "workers">;
}): RestoreHoldStore & {
  snapshot(): Promise<{ docs: LocalRestoreDocs; holds: OutsideHolds }>;
  replaceDocs(next: LocalRestoreDocs): void;
} {
  let docs = initial.docs;
  let holds: OutsideHolds = {
    traffic: initial.holds.traffic,
    workers: initial.holds.workers,
    phase: initial.holds.phase ?? "closed",
    revision: initial.holds.revision ?? 0,
  };
  return {
    async readDocs() {
      return docs;
    },
    async readHolds() {
      return holds;
    },
    async writeHolds(next, expectedRevision) {
      if (holds.revision !== expectedRevision) return "conflict";
      holds = next;
      return "stored";
    },
    async snapshot() {
      return { docs, holds };
    },
    replaceDocs(next: LocalRestoreDocs) {
      docs = next;
    },
  };
}

function fenceAligned(docs: LocalRestoreDocs, authorityWatermark: number): boolean {
  return Boolean(
    docs.fence &&
      docs.mode &&
      !docs.fence.closed &&
      docs.fence.reconciled &&
      docs.fence.watermark === authorityWatermark &&
      Number.isSafeInteger(authorityWatermark) &&
      authorityWatermark >= 1
  );
}

/**
 * One stage of the release. Workers are released first. Traffic stays closed
 * until a later call re-reads the fence and the authority watermark.
 * A missing restore-control document does not write the holds open.
 */
export async function releaseRestoreHolds(
  store: RestoreHoldStore,
  authorityWatermark: number
): Promise<{ released: boolean; reason: string; phase: HoldPhase }> {
  const docs = await store.readDocs();
  const holds = await store.readHolds();
  if (!docs.fence || !docs.mode) {
    return { released: false, reason: "restored_primary_missing_restore_control", phase: holds.phase };
  }
  if (!fenceAligned(docs, authorityWatermark)) {
    if (holds.phase !== "closed" || holds.workers !== "stopped" || holds.traffic !== "closed") {
      const rolled = await store.writeHolds(
        { traffic: "closed", workers: "stopped", phase: "closed", revision: holds.revision + 1 },
        holds.revision
      );
      if (rolled !== "stored") return { released: false, reason: "release_conflict", phase: holds.phase };
    }
    return { released: false, reason: "fence_not_reconciled", phase: "closed" };
  }
  if (holds.phase === "traffic_released" && holds.traffic === "open" && holds.workers === "running") {
    return { released: true, reason: "traffic_released", phase: "traffic_released" };
  }
  if (holds.phase === "closed") {
    const wrote = await store.writeHolds(
      { traffic: "closed", workers: "running", phase: "workers_released", revision: holds.revision + 1 },
      holds.revision
    );
    if (wrote !== "stored") return { released: false, reason: "release_conflict", phase: holds.phase };
    return { released: false, reason: "workers_released", phase: "workers_released" };
  }
  const wrote = await store.writeHolds(
    { traffic: "open", workers: "running", phase: "traffic_released", revision: holds.revision + 1 },
    holds.revision
  );
  if (wrote !== "stored") return { released: false, reason: "release_conflict", phase: holds.phase };
  return { released: true, reason: "traffic_released", phase: "traffic_released" };
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
