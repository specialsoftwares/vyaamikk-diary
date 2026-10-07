/**
 * Magic-byte admission for letterhead template images.
 * Picker MIME alone is never sufficient.
 */

/** Staging + final paths to delete after copy/move/decode/ownership failure. */
export function ownedCandidateTempUris(
  staging: string,
  finalPath: string | null
): string[] {
  const out = [staging];
  if (finalPath && finalPath !== staging) out.push(finalPath);
  return out;
}

/** Pure: inspect a base64 file head (first ~24–48 bytes worth). */
export function sniffImageMimeFromBase64Head(head: string): string | null {
  const h = head.trim();
  if (!h) return null;
  // JPEG SOI
  if (h.startsWith("/9j/")) return "image/jpeg";
  // PNG signature
  if (h.startsWith("iVBOR")) return "image/png";
  // WebP: RIFF....WEBP — "UklGR" + "V0VC" (WEBP). RIFF alone is NOT WebP.
  if (h.startsWith("UklGR") && h.includes("V0VC")) return "image/webp";
  return null;
}

/** True when a four-byte ASCII tag at offset looks like WEBP inside a RIFF. */
export function isWebpRiffBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const tag = (i: number) => String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
  return tag(0) === "RIFF" && tag(8) === "WEBP";
}
