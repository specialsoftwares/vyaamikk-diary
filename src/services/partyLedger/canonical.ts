/**
 * Sorted-key JSON for contribution hashes. BigInt is rejected; money is already a string.
 */

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("party_ledger_canonical_number");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === "bigint") throw new Error("party_ledger_canonical_bigint");
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) continue;
      out[key] = canonicalize(source[key]);
    }
    return out;
  }
  throw new Error("party_ledger_canonical_value");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
