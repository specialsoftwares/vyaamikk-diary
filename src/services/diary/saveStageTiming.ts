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
