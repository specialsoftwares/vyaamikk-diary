import { CANONICAL_JSON_VERSION } from "./constants";

/**
 * Versioned canonical JSON: sorted keys, UTF-8 JSON, explicit nulls,
 * omitted undefined on objects, decimal strings left as strings.
 * firestoreCommitTime is never part of an event hash.
 *
 * Collision controls: reject Date/Map/non-plain objects (they would become {}),
 * reject undefined array holes (they would collapse), reject sparse arrays.
 */
export const CANONICAL_EXCLUSIONS = new Set(["firestoreCommitTime"]);

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function canonicalize(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("goodsEvidence: non-finite numbers are not canonical");
    }
    if (Object.is(value, -0)) return 0;
    return value;
  }
  if (typeof value === "bigint") {
    throw new Error("goodsEvidence: bigint is not canonical; use a decimal string");
  }
  if (Array.isArray(value)) {
    if (value.length !== Object.keys(value).length) {
      throw new Error("goodsEvidence: sparse arrays are not canonical");
    }
    return value.map((item, index) => {
      if (item === undefined) {
        throw new Error(`goodsEvidence: undefined array element at ${index} is not canonical`);
      }
      return canonicalize(item);
    });
  }
  if (typeof value === "object") {
    if (!isPlainObject(value)) {
      throw new Error("goodsEvidence: only plain objects are canonical");
    }
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        throw new Error("goodsEvidence: prototype keys are not canonical");
      }
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
