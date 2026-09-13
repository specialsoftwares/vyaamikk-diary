/**
 * HTTP adapter: POST /render → PDF bytes.
 * Cloud Run IAM is the authentication gate (no API keys).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import {
  MAX_HTML_BYTES,
  MAX_PDF_BYTES,
  RENDER_TIMEOUT_MS,
  RendererProtocolError,
  parseRenderRequest,
} from "./protocol";

const MAX_REQUEST_BYTES = MAX_HTML_BYTES + 8192;

export type RenderFn = (req: ReturnType<typeof parseRenderRequest>) => Promise<Buffer>;

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new RendererProtocolError(413, "payload_too_large", "payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function createRendererServer(render: RenderFn): Server {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (req.method !== "POST" || req.url !== "/render") {
        throw new RendererProtocolError(405, "method_not_allowed", "POST /render only");
      }
      const ct = req.headers["content-type"] ?? "";
      if (!ct.includes("application/json")) {
        throw new RendererProtocolError(415, "unsupported_media_type", "application/json required");
      }
      const rawText = await readBody(req, MAX_REQUEST_BYTES);
      let json: unknown;
      try {
        json = JSON.parse(rawText);
      } catch {
        throw new RendererProtocolError(400, "invalid_json", "invalid json");
      }
      const parsed = parseRenderRequest(json, Buffer.byteLength(rawText, "utf8"));
      let timer: ReturnType<typeof setTimeout> | undefined;
      let pdf: Buffer;
      try {
        pdf = await Promise.race([
          render(parsed),
          new Promise<Buffer>((_, reject) => {
            timer = setTimeout(() => {
              reject(new RendererProtocolError(504, "render_timeout", "render timeout"));
            }, RENDER_TIMEOUT_MS);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (pdf.length === 0 || pdf.length > MAX_PDF_BYTES) {
        throw new RendererProtocolError(500, "pdf_size_rejected", "pdf size rejected");
      }
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
        "Cache-Control": "no-store",
      });
      res.end(pdf);
    } catch (err) {
      const status = err instanceof RendererProtocolError ? err.status : 500;
      const code = err instanceof RendererProtocolError ? err.code : "internal_error";
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: code }));
    }
  });
}
