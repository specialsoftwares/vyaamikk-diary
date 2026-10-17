/**
 * Monotonic save-stage durations. Samples are stage name + milliseconds only.
 * Do not put names, ids, tokens, or file contents in this module.
 */

export const SAVE_STAGES = [
  "tap",
  "validation",
  "media_ready",
  "local_commit",
  "remote_ack",
  "upload",
  "pdf_render",
] as const;

export type SaveStage = (typeof SAVE_STAGES)[number];

export interface SaveStageSample {
  stage: SaveStage;
  durationMs: number;
}

const retained = new Map<SaveStage, number[]>();
const MAX_RETAINED = 200;

export function monotonicNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

/** Successful remote acknowledgement only. Pending, failed, and local-only saves stay unmarked. */
export function recordRemoteAckIfAccepted(
  remoteAccepted: boolean,
  durationMs: number,
  sinks: Array<{ record: (stage: SaveStage, durationMs: number) => void } | null | undefined>
): void {
  if (remoteAccepted !== true) return;
  for (const sink of sinks) sink?.record("remote_ack", durationMs);
}

export function noteSaveStageDuration(stage: SaveStage, durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  const list = retained.get(stage) ?? [];
  list.push(durationMs);
  if (list.length > MAX_RETAINED) list.shift();
  retained.set(stage, list);
}

export function stageDurations(stage: SaveStage): number[] {
  return [...(retained.get(stage) ?? [])];
}

export function resetSaveStageTimingsForTests(): void {
  retained.clear();
  isolatedAttempts.length = 0;
  saveAttemptSerial = 0;
}

interface IsolatedSaveAttempt {
  operationId: string;
  attempt: number;
  samples: SaveStageSample[];
}

let saveAttemptSerial = 0;
const isolatedAttempts: IsolatedSaveAttempt[] = [];

function randomOperationId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
  return `save_${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * One save attempt. Samples stay on this object so a retry cannot
 * overwrite the previous attempt's marks. Does not write the shared histogram.
 */
export function beginSaveAttempt(): SaveStageTimer & { operationId: string; attempt: number } {
  saveAttemptSerial += 1;
  const operationId = randomOperationId();
  const attempt = saveAttemptSerial;
  const samples: SaveStageSample[] = [];
  isolatedAttempts.push({ operationId, attempt, samples });
  if (isolatedAttempts.length > 32) isolatedAttempts.shift();
  return {
    operationId,
    attempt,
    record(stage, durationMs) {
      if (!Number.isFinite(durationMs) || durationMs < 0) return;
      samples.push({ stage, durationMs });
    },
    samples() {
      return samples.map((sample) => ({ ...sample }));
    },
  };
}

export interface SaveStageTimer {
  record(stage: SaveStage, durationMs: number): void;
  samples(): SaveStageSample[];
}

export function createSaveStageTimer(): SaveStageTimer {
  const samples: SaveStageSample[] = [];
  return {
    record(stage, durationMs) {
      if (!Number.isFinite(durationMs) || durationMs < 0) return;
      const sample = { stage, durationMs };
      samples.push(sample);
      noteSaveStageDuration(stage, durationMs);
    },
    samples() {
      return samples.map((sample) => ({ ...sample }));
    },
  };
}

/**
 * Nearest-rank percentile. `p` is 0–100.
 * Rank is `ceil((p/100) * n) - 1`, clamped to the sorted sample.
 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0 || !Number.isFinite(p)) return 0;
  const sorted = [...values].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const clamped = Math.min(100, Math.max(0, p));
  const rank = Math.ceil((clamped / 100) * sorted.length) - 1;
  const index = Math.min(sorted.length - 1, Math.max(0, rank));
  return sorted[index]!;
}

export function p50(values: readonly number[]): number {
  return percentile(values, 50);
}

export function p95(values: readonly number[]): number {
  return percentile(values, 95);
}
