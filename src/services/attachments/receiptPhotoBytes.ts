import { sha256HexBytes } from "@/utils/sha256Hex";

import { MAX_CASH_PAID_PHOTO_BYTES } from "./cashPaidPhotoLimits";

export type ReceiptImageMime = "image/jpeg" | "image/png";

export type ReceiptByteReject = "too_large" | "unsupported" | "decode_failed";

export type InspectedReceiptBytes =
  | {
      ok: true;
      mime: ReceiptImageMime;
      width: number;
      height: number;
      byteSize: number;
      contentHash: string;
      dataUri: string;
    }
  | { ok: false; reason: ReceiptByteReject };

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function encodeBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += B64[(triple >> 18) & 63]!;
    out += B64[(triple >> 12) & 63]!;
    out += i + 1 < bytes.length ? B64[(triple >> 6) & 63]! : "=";
    out += i + 2 < bytes.length ? B64[triple & 63]! : "=";
  }
  return out;
}

export function decodeBase64(input: string): Uint8Array {
  const clean = input.replace(/\s/g, "");
  if (!clean || /[^A-Za-z0-9+/=]/.test(clean)) {
    throw new Error("decode_failed");
  }
  const body = clean.replace(/=+$/, "");
  const outLen = Math.floor((body.length * 3) / 4);
  const out = new Uint8Array(outLen);
  let o = 0;
  for (let i = 0; i < body.length; i += 4) {
    const n0 = B64.indexOf(body[i] ?? "");
    const n1 = B64.indexOf(body[i + 1] ?? "");
    const n2 = i + 2 < body.length ? B64.indexOf(body[i + 2]!) : 0;
    const n3 = i + 3 < body.length ? B64.indexOf(body[i + 3]!) : 0;
    if (n0 < 0 || n1 < 0 || (i + 2 < body.length && n2 < 0) || (i + 3 < body.length && n3 < 0)) {
      throw new Error("decode_failed");
    }
    const triple = (n0 << 18) | (n1 << 12) | (n2 << 6) | n3;
    if (o < out.length) out[o++] = (triple >> 16) & 0xff;
    if (i + 2 < body.length && o < out.length) out[o++] = (triple >> 8) & 0xff;
    if (i + 3 < body.length && o < out.length) out[o++] = triple & 0xff;
  }
  return out.subarray(0, o);
}

export function sniffReceiptMime(bytes: Uint8Array): ReceiptImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  return null;
}

function u16(bytes: Uint8Array, offset: number): number | null {
  if (offset + 1 >= bytes.length) return null;
  return ((bytes[offset]! << 8) | bytes[offset + 1]!) >>> 0;
}

function u32(bytes: Uint8Array, offset: number): number | null {
  if (offset + 3 >= bytes.length) return null;
  return (
    ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>>
    0
  );
}

export function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    while (i < bytes.length && bytes[i] === 0xff) i += 1;
    if (i >= bytes.length) return null;
    const marker = bytes[i]!;
    i += 1;
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = u16(bytes, i);
    if (length == null || length < 2 || i + length > bytes.length) return null;
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      const height = u16(bytes, i + 3);
      const width = u16(bytes, i + 5);
      if (!width || !height) return null;
      return { width, height };
    }
    i += length;
  }
  return null;
}

export function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (sniffReceiptMime(bytes) !== "image/png" || bytes.length < 24) return null;
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
    return null;
  }
  const width = u32(bytes, 16);
  const height = u32(bytes, 20);
  if (!width || !height) return null;
  return { width, height };
}

/**
 * Validate receipt bytes. `dataUri` is for the in-memory PDF render only.
 * Callers must not persist or log it.
 */
export function inspectReceiptBytes(bytes: Uint8Array): InspectedReceiptBytes {
  if (bytes.byteLength > MAX_CASH_PAID_PHOTO_BYTES) {
    return { ok: false, reason: "too_large" };
  }
  const mime = sniffReceiptMime(bytes);
  if (!mime) return { ok: false, reason: "unsupported" };
  const dim = mime === "image/png" ? pngDimensions(bytes) : jpegDimensions(bytes);
  if (!dim) return { ok: false, reason: "decode_failed" };
  const contentHash = sha256HexBytes(bytes);
  const dataUri = `data:${mime};base64,${encodeBase64(bytes)}`;
  return {
    ok: true,
    mime,
    width: dim.width,
    height: dim.height,
    byteSize: bytes.byteLength,
    contentHash,
    dataUri,
  };
}
