/**
 * Pure identity-media validation (no native picker — safe for Node tests).
 */

export const MAX_PROFILE_LOGO_BYTES = 512 * 1024;
export const MIN_PROFILE_IMAGE_EDGE_PX = 200;

export type IdentityMediaRejectReason =
  | "permission_denied"
  | "cancelled"
  | "unsupported_type"
  | "heic_unreadable"
  | "corrupted"
  | "too_large"
  | "too_small"
  | "empty"
  | "stale_uri";

export function assertSupportedIdentityMime(
  mime: string,
  fileName?: string | null
): void {
  const m = mime.toLowerCase();
  if (m === "image/heic" || m === "image/heif") {
    const err = new Error("HEIC unreadable") as Error & { reason: IdentityMediaRejectReason };
    err.reason = "heic_unreadable";
    throw err;
  }
  if (m !== "image/jpeg" && m !== "image/png" && m !== "image/webp") {
    const lower = (fileName ?? "").toLowerCase();
    if (lower.endsWith(".heic") || lower.endsWith(".heif")) {
      const err = new Error("HEIC unreadable") as Error & { reason: IdentityMediaRejectReason };
      err.reason = "heic_unreadable";
      throw err;
    }
    const err = new Error("Unsupported") as Error & { reason: IdentityMediaRejectReason };
    err.reason = "unsupported_type";
    throw err;
  }
}

export function validateIdentityMediaCandidate(input: {
  mimeType: string;
  fileName?: string | null;
  width: number;
  height: number;
  approxBytes: number;
  uri?: string | null;
  base64?: string | null;
}): { ok: true } | { ok: false; reason: IdentityMediaRejectReason; message: string } {
  try {
    if (!input.uri?.trim()) {
      return { ok: false, reason: "empty", message: "Empty image reference." };
    }
    assertSupportedIdentityMime(input.mimeType, input.fileName);
    if (input.width > 0 && input.height > 0) {
      if (
        input.width < MIN_PROFILE_IMAGE_EDGE_PX ||
        input.height < MIN_PROFILE_IMAGE_EDGE_PX
      ) {
        return { ok: false, reason: "too_small", message: "Image too small." };
      }
    }
    // Prefer file URI persistence (no base64 bridge). Base64 remains accepted
    // when present; URI-only candidates are valid when size is known or unknown
    // (persist path re-validates after copy).
    if (!input.base64 && !input.uri?.trim()) {
      return { ok: false, reason: "corrupted", message: "Unreadable image data." };
    }
    if (input.approxBytes > MAX_PROFILE_LOGO_BYTES) {
      return { ok: false, reason: "too_large", message: "Image too large." };
    }
    return { ok: true };
  } catch (e) {
    const reason =
      e && typeof e === "object" && "reason" in e
        ? ((e as { reason: IdentityMediaRejectReason }).reason)
        : "corrupted";
    return {
      ok: false,
      reason,
      message: e instanceof Error ? e.message : "Invalid image.",
    };
  }
}
