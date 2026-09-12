import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { resolve } from "node:path";

import { APPROVED_RENDERING_PROFILE } from "./protocol";
import { createRendererServer } from "./server";

function call(
  port: number,
  opts: { method?: string; path?: string; body?: unknown; type?: string }
): Promise<{ status: number; body: Buffer }> {
  return new Promise((resolveP, reject) => {
    const payload = opts.body == null ? "" : JSON.stringify(opts.body);
    const req = httpRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: opts.path ?? "/render",
        method: opts.method ?? "POST",
        headers: {
          "Content-Type": opts.type ?? "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolveP({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) })
        );
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  const renderPath = [
    resolve(process.cwd(), "src/render.ts"),
    resolve(process.cwd(), "services/subscription-invoice-renderer/src/render.ts"),
  ].find((p) => existsSync(p));
  if (!renderPath) throw new Error("render.ts not found");
  const src = readFileSync(renderPath, "utf8");
  assert.ok(!src.includes("firestore"));
  assert.ok(!src.includes("allocate"));
  assert.ok(!src.includes("GSTIN"));
  assert.ok(!src.includes("purchaseToken"));

  const dockerPath = [
    resolve(process.cwd(), "Dockerfile"),
    resolve(process.cwd(), "services/subscription-invoice-renderer/Dockerfile"),
  ].find((p) => existsSync(p));
  if (!dockerPath) throw new Error("Dockerfile not found");
  const docker = readFileSync(dockerPath, "utf8");
  assert.match(docker, /npm run build/);
  assert.match(docker, /COPY --from=builder \/app\/dist \.\/dist/);
  assert.doesNotMatch(docker, /^COPY dist \.\/dist$/m);

  const server = createRendererServer(async () => Buffer.from("%PDF-FAKE"));
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  const port = addr.port;

  const wrong = await call(port, { method: "GET" });
  assert.equal(wrong.status, 405);

  const huge = await call(port, {
    body: {
      documentId: "d",
      html: "<p>x</p>",
      renderingProfile: APPROVED_RENDERING_PROFILE,
      url: "https://example.com",
    },
  });
  assert.equal(huge.status, 400);

  const ok = await call(port, {
    body: {
      documentId: "d1",
      html: "<html><body>ok</body></html>",
      renderingProfile: APPROVED_RENDERING_PROFILE,
    },
  });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.toString().startsWith("%PDF"));

  server.close();

  const timeoutServer = createRendererServer(
    () =>
      new Promise((_, reject) => {
        setTimeout(
          () => reject(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })),
          10
        );
      })
  );
  await new Promise<void>((r) => timeoutServer.listen(0, r));
  const taddr = timeoutServer.address();
  if (!taddr || typeof taddr === "string") throw new Error("no port");
  const timed = await call(taddr.port, {
    body: {
      documentId: "d1",
      html: "<html><body>ok</body></html>",
      renderingProfile: APPROVED_RENDERING_PROFILE,
    },
  });
  assert.equal(timed.status, 500);
  timeoutServer.close();

  const bigServer = createRendererServer(async () => Buffer.alloc(6 * 1024 * 1024));
  await new Promise<void>((r) => bigServer.listen(0, r));
  const baddr = bigServer.address();
  if (!baddr || typeof baddr === "string") throw new Error("no port");
  const tooBig = await call(baddr.port, {
    body: {
      documentId: "d1",
      html: "<html><body>ok</body></html>",
      renderingProfile: APPROVED_RENDERING_PROFILE,
    },
  });
  assert.equal(tooBig.status, 500);
  bigServer.close();

  console.log("server.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
