/** Technical safeguards for G1, not legal or quota requirements. */
export const MAX_ENVELOPE_UTF8_BYTES = 256 * 1024;
export const MAX_TEXT_UTF16_UNITS = 500;
export const MAX_LINES = 50;

const ENVELOPE_KEYS = new Set(["commandId", "type", "ownerUid", "ledgerId", "body", "digest"]);

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
