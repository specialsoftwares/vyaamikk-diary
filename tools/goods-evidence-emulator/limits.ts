/** Technical safeguards for G1, not legal or quota requirements. */
export const MAX_ENVELOPE_UTF8_BYTES = 256 * 1024;
export const MAX_TEXT_UTF16_UNITS = 500;
export const MAX_LINES = 50;
/** Inclusive object/array nesting depth from the request root. */
export const MAX_INPUT_DEPTH = 32;
/** Inclusive count of objects and arrays visited while walking the request. */
export const MAX_INPUT_NODES = 4096;

const ENVELOPE_KEYS = new Set(["commandId", "type", "ownerUid", "ledgerId", "body", "digest"]);
const RECONCILE_KEYS = new Set(["ledgerId", "commandId"]);
const READ_KEYS = new Set(["ledgerId", "receiptId"]);
const PROTOTYPE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const SERVER_FIELDS = new Set([
  "serverRegisteredAtUtc",
  "issuedNumber",
  "serial",
  "fyToken",
  "originalSnapshotHash",
  "eventId",
  "eventHash",
  "firestoreCommitTime",
  "headHash",
  "eventVersion",
]);

export function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

export function extraEnvelopeKeyError(value: unknown): string | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return "command envelope is required";
  }
  for (const key of Object.keys(value as object)) {
    if (!ENVELOPE_KEYS.has(key)) return "extra envelope fields are not allowed";
  }
  return null;
}

export function extraReconcileKeyError(value: unknown): string | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return "reconcile request is required";
  }
  for (const key of Object.keys(value as object)) {
    if (!RECONCILE_KEYS.has(key)) return "extra reconcile fields are not allowed";
  }
  return null;
}

export function extraReadKeyError(value: unknown): string | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return "read request is required";
  }
  for (const key of Object.keys(value as object)) {
    if (!READ_KEYS.has(key)) return "extra read fields are not allowed";
  }
  return null;
}

/**
 * Bounds parsed-JSON-shaped input before JSON.stringify or recursive walks.
 * Does not inspect string contents as nested structure.
 */
export function inputShapeError(value: unknown, label: string): string | null {
  const seen = new WeakSet<object>();
  let nodes = 0;
  const walk = (current: unknown, depth: number): string | null => {
    if (current === null || typeof current === "string" || typeof current === "boolean") return null;
    if (typeof current === "number") {
      return Number.isFinite(current) ? null : `${label} contains a non-finite number`;
    }
    if (
      typeof current === "bigint" ||
      typeof current === "function" ||
      typeof current === "symbol" ||
      typeof current === "undefined"
    ) {
      return `${label} contains a non-JSON value`;
    }
    if (typeof current !== "object") return `${label} is invalid`;
    if (depth > MAX_INPUT_DEPTH) return `${label} exceeds the technical nesting limit`;
    if (seen.has(current)) return `${label} contains a circular structure`;
    const proto = Object.getPrototypeOf(current);
    if (proto !== Object.prototype && proto !== null && !Array.isArray(current)) {
      return `${label} contains a non-JSON value`;
    }
    seen.add(current);
    nodes += 1;
    if (nodes > MAX_INPUT_NODES) return `${label} exceeds the technical node limit`;
    if (Array.isArray(current)) {
      if (current.length !== Object.keys(current).length) {
        return `${label} must not be a sparse array`;
      }
      for (let i = 0; i < current.length; i++) {
        if (current[i] === undefined) return `${label}[${i}] must not be undefined`;
        const nested = walk(current[i], depth + 1);
        if (nested) return nested;
      }
      return null;
    }
    for (const key of Object.keys(current)) {
      if (PROTOTYPE_KEYS.has(key)) return `${label} contains a prototype key`;
      const nestedValue = (current as Record<string, unknown>)[key];
      // Undefined object properties are omitted canonically; they are not non-JSON.
      // Reproduced at c9623dd: { optional: undefined } was rejected as non-JSON.
      if (nestedValue === undefined) continue;
      const nested = walk(nestedValue, depth + 1);
      if (nested) return nested;
    }
    return null;
  };
  return walk(value, 0);
}

export function sparseArrayError(value: unknown, path: string): string | null {
  if (Array.isArray(value)) {
    if (value.length !== Object.keys(value).length) {
      return `${path} must not be a sparse array`;
    }
    for (let i = 0; i < value.length; i++) {
      if (value[i] === undefined) return `${path}[${i}] must not be undefined`;
      const nested = sparseArrayError(value[i], `${path}[${i}]`);
      if (nested) return nested;
    }
    return null;
  }
  if (value != null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const err = sparseArrayError(nested, `${path}.${key}`);
      if (err) return err;
    }
  }
  return null;
}

export function serverFieldError(body: unknown): string | null {
  if (body == null || typeof body !== "object" || Array.isArray(body)) return null;
  for (const key of Object.keys(body as object)) {
    if (SERVER_FIELDS.has(key)) return "server-generated fields are not client authority";
  }
  return null;
}

export function lineCountError(body: unknown): string | null {
  if (body == null || typeof body !== "object" || Array.isArray(body)) return null;
  const lines = (body as { lines?: unknown }).lines;
  if (!Array.isArray(lines)) return null;
  if (lines.length > MAX_LINES) return "line count exceeds the technical limit";
  return null;
}

export function textLimitError(value: unknown, path = "body"): string | null {
  if (typeof value === "string") {
    if (value.length > MAX_TEXT_UTF16_UNITS) {
      return `${path} exceeds the technical text limit`;
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const err = textLimitError(value[i], `${path}[${i}]`);
      if (err) return err;
    }
    return null;
  }
  if (value != null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const err = textLimitError(nested, `${path}.${key}`);
      if (err) return err;
    }
  }
  return null;
}

export function envelopeByteError(envelope: unknown): string | null {
  const encoded = JSON.stringify(envelope);
  if (utf8ByteLength(encoded) > MAX_ENVELOPE_UTF8_BYTES) {
    return "request body exceeds the technical UTF-8 byte limit";
  }
  return null;
}

/**
 * Deep-copy JSON-shaped input, omitting undefined object properties.
 * Does not mutate the caller value. Undefined/sparse array slots throw
 * (they are invalid, not omitted). Non-JSON leftovers throw rather than
 * becoming `invalid` at the adapter boundary.
 */
export function normalizeJsonCopy(value: unknown): unknown {
  if (value === undefined) {
    throw new Error("g1_normalize_undefined_root");
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("g1_normalize_non_finite");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (value.length !== Object.keys(value).length) {
      throw new Error("g1_normalize_sparse_array");
    }
    return value.map((item, index) => {
      if (item === undefined) {
        throw new Error(`g1_normalize_undefined_array_${index}`);
      }
      return normalizeJsonCopy(item);
    });
  }
  if (typeof value !== "object") {
    throw new Error("g1_normalize_non_json");
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new Error("g1_normalize_non_plain");
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    if (PROTOTYPE_KEYS.has(key)) throw new Error("g1_normalize_prototype_key");
    const nested = (value as Record<string, unknown>)[key];
    if (nested === undefined) continue;
    out[key] = normalizeJsonCopy(nested);
  }
  return out;
}
