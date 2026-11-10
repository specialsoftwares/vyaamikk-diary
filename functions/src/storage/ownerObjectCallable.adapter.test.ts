/**
 * The production adapter must send generation strings through the real
 * @google-cloud/storage client. That client otherwise stores Number(generation),
 * and 9007199254740993 becomes 9007199254740992.
 */

import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { Storage } from "@google-cloud/storage";

import { createOwnerObjectPorts, type ObjectBucket } from "./ownerObjectCallable";

const BIG = "9007199254740993";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function listen(): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    seen.push({ method: req.method ?? "", raw: req.url ?? "", query: url.searchParams });
    const body = JSON.stringify({
      generation: BIG,
      size: String(PNG.byteLength),
      contentType: "image/png",
      metadata: {},
    });
    if (req.method === "DELETE") {
      res.statusCode = 204;
      res.end();
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: (server.address() as AddressInfo).port });
    });
  });
}

const seen: Array<{ method: string; raw: string; query: URLSearchParams }> = [];

function queryOf(method: string, fragment: string): URLSearchParams {
  const hit = seen.find((item) => item.method === method && item.raw.includes(fragment));
  assert.ok(hit, `${method} ${fragment}`);
  return hit.query;
}

async function main(): Promise<void> {
  const { server, port } = await listen();
  try {
    const storage = new Storage({
      projectId: "demo-vyaamikk-object-transfer",
      apiEndpoint: `http://127.0.0.1:${port}`,
      useAuthWithCustomEndpoint: false,
    });
    const raw = storage.bucket("demo-vyaamikk-object-transfer.appspot.com");
    const ports = createOwnerObjectPorts({
      db: {
        collection() {
          throw new Error("firestore is not part of this adapter proof");
        },
        doc() {
          throw new Error("firestore is not part of this adapter proof");
        },
        runTransaction() {
          throw new Error("firestore is not part of this adapter proof");
        },
      },
      bucket: raw as unknown as ObjectBucket,
      admitSession: async () => true,
      admitRestore: async () => true,
    });

    const copied = await ports.copyGeneration({
      from: "users/owner/.objectTransfer/attempt",
      fromGeneration: BIG,
      to: "users/owner/letterhead/logo.png",
      ifGenerationMatch: "0",
      contentType: "image/png",
      metadata: { vydAttempt: "a".repeat(32), vydSha256: "b".repeat(64) },
    });
    assert.equal(copied.outcome, "copied");
    if (copied.outcome === "copied") assert.equal(copied.generation, BIG);

    const copy = queryOf("POST", "rewriteTo");
    assert.equal(copy.get("sourceGeneration"), BIG);
    assert.equal(copy.get("ifGenerationMatch"), "0");
    assert.notEqual(copy.get("sourceGeneration"), String(Number(BIG)));

    const metadata = queryOf("GET", "/o/");
    assert.equal(metadata.get("generation"), BIG);

    const removed = await ports.removeGeneration("users/owner/.objectTransfer/attempt", BIG);
    assert.equal(removed, "removed");
    const deleted = queryOf("DELETE", "/o/");
    assert.equal(deleted.get("generation"), BIG);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  console.log("ownerObjectCallable.adapter.test.ts: ok");
}

main().catch((error) => {
  console.error(error);
  console.error(seen.map((item) => `${item.method} ${item.raw}`).join("\n"));
  process.exit(1);
});
