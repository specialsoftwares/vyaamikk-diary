import { CANONICAL_JSON_VERSION } from "./constants";

/**
 * Versioned canonical JSON: sorted keys, UTF-8 JSON, explicit nulls,
 * omitted undefined, decimal strings left as strings.
 * firestoreCommitTime is never part of an event hash.
 */
export const CANONICAL_EXCLUSIONS = new Set(["firestoreCommitTime"]);

export function canonicalize(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("goodsEvidence: non-finite numbers are not canonical");
    }
    return value;
  }
  if (typeof value === "bigint") {
    throw new Error("goodsEvidence: bigint is not canonical; use a decimal string");
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item)).filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      if (CANONICAL_EXCLUSIONS.has(key)) continue;
      const next = canonicalize((value as Record<string, unknown>)[key]);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  throw new Error("goodsEvidence: value is not canonicalizable");
}

export function canonicalJson(value: unknown): string {
  const body = canonicalize(value);
  return JSON.stringify({ canonicalVersion: CANONICAL_JSON_VERSION, body });
}
