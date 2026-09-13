/**
 * Subscription invoice HTML→PDF renderer.
 *
 * This service has NO tax authority: it does not access Firestore, allocate
 * invoice numbers, determine GST, read credentials, or send email.
 * Authentication at deployment is Cloud Run IAM (roles/run.invoker).
 */

export const APPROVED_RENDERING_PROFILE = "vyd_tax_document_a4_v1";
export const MAX_HTML_BYTES = 256 * 1024;
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const RENDER_TIMEOUT_MS = 12_000;

export class RendererProtocolError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "RendererProtocolError";
  }
}

export interface RenderRequest {
  documentId: string;
  html: string;
  renderingProfile: string;
}

export function parseRenderRequest(raw: unknown, contentLength: number): RenderRequest {
  if (contentLength > MAX_HTML_BYTES + 4096) {
    throw new RendererProtocolError(413, "payload_too_large", "payload too large");
  }
  if (!raw || typeof raw !== "object") {
    throw new RendererProtocolError(400, "invalid_json", "invalid json");
  }
  const body = raw as Record<string, unknown>;
  if ("url" in body || "navigate" in body) {
    throw new RendererProtocolError(400, "url_rendering_forbidden", "generic URL rendering is forbidden");
  }
  const documentId = body.documentId;
  const html = body.html;
  const renderingProfile = body.renderingProfile;
  if (typeof documentId !== "string" || documentId.length === 0 || documentId.length > 200) {
    throw new RendererProtocolError(400, "document_id_invalid", "documentId invalid");
  }
  if (typeof html !== "string" || html.length === 0) {
    throw new RendererProtocolError(400, "html_required", "html required");
  }
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    throw new RendererProtocolError(413, "html_too_large", "html too large");
  }
  if (renderingProfile !== APPROVED_RENDERING_PROFILE) {
    throw new RendererProtocolError(400, "profile_rejected", "renderingProfile rejected");
  }
  return { documentId, html, renderingProfile };
}
