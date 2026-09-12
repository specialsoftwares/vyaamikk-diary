import assert from "node:assert/strict";

import {
  MAX_HTML_BYTES,
  parseRenderRequest,
  RendererProtocolError,
} from "./protocol";

assert.throws(
  () => parseRenderRequest({ documentId: "d", html: "<p>x</p>", url: "https://evil" }, 10),
  (e: unknown) => e instanceof RendererProtocolError && e.code === "url_rendering_forbidden"
);

assert.throws(
  () =>
    parseRenderRequest(
      { documentId: "d", html: "<p>x</p>", renderingProfile: "other" },
      20
    ),
  (e: unknown) => e instanceof RendererProtocolError && e.code === "profile_rejected"
);

assert.throws(
  () =>
    parseRenderRequest(
      { documentId: "d", html: "a".repeat(MAX_HTML_BYTES + 1), renderingProfile: "vyd_tax_document_a4_v1" },
      MAX_HTML_BYTES + 1
    ),
  (e: unknown) => e instanceof RendererProtocolError && e.code === "html_too_large"
);

const ok = parseRenderRequest(
  {
    documentId: "inv_1",
    html: "<html><body>ok</body></html>",
    renderingProfile: "vyd_tax_document_a4_v1",
  },
  40
);
assert.equal(ok.documentId, "inv_1");

console.log("protocol.test.ts: ok");
