/**
 * G1 emulator logging: fixed event names and allowlisted primitives only.
 * Does not log request bodies, Error.message, or secrets.
 */

export type G1LogEvent = "grin_g1_denied" | "grin_g1_committed" | "grin_g1_replayed";

const ALLOWED_META = new Set(["code", "attempt", "replayed", "policy"]);

export function sanitizeG1Meta(meta: Record<string, unknown> | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!meta) return out;
  for (const key of ALLOWED_META) {
    const value = meta[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    }
  }
  return out;
}

export function formatG1Log(event: G1LogEvent, meta?: Record<string, unknown>): string {
  return JSON.stringify({ event, ...sanitizeG1Meta(meta) });
}

export function logG1(event: G1LogEvent, meta?: Record<string, unknown>): void {
  if (process.env.GRIN_G1_LOG !== "1") return;
  console.log(formatG1Log(event, meta));
}
