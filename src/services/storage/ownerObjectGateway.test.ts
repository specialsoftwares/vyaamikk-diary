import assert from "node:assert/strict";

import { createOwnerObjectGateway } from "./ownerObjectGateway";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);

async function main(): Promise<void> {
  const calls: Array<Record<string, unknown>> = [];
  let puts = 0;
  const gateway = createOwnerObjectGateway({
    async call(data) {
      calls.push(data);
      if (data.operation === "begin") {
        return { ok: true, attemptId: "a".repeat(32), uploadUrl: "https://upload.test/staging" };
      }
      if (data.operation === "commit") {
        return { ok: true, path: "users/owner-a/letterhead/logo.png", generation: "44", size: PNG.byteLength, contentType: "image/png" };
      }
      return { ok: true, operation: data.operation };
    },
    async put() {
      puts += 1;
      return 200;
    },
    async localBytes() {
      return PNG.byteLength;
    },
  });
  const uploaded = await gateway.upload({
    storagePath: "users/owner-a/letterhead/logo.png",
    contentType: "image/png",
    localUri: "file:///tmp/logo.png",
  });
  assert.equal(uploaded.generation, "44");
  assert.equal(uploaded.remoteBytes, PNG.byteLength);
  assert.equal("downloadUrl" in uploaded, false);
  assert.equal(puts, 1);
  assert.deepEqual(calls.map((call) => call.operation), ["begin", "commit"]);

  const aborted: string[] = [];
  const failing = createOwnerObjectGateway({
    async call(data) {
      if (data.operation === "abort") aborted.push(String(data.attemptId));
      if (data.operation === "begin") return { ok: true, attemptId: "b".repeat(32), uploadUrl: "https://upload.test/staging" };
      return { ok: false };
    },
    async put() {
      return 500;
    },
    async localBytes() {
      return 4;
    },
  });
  await assert.rejects(() => failing.upload({ storagePath: "users/owner-a/letterhead/logo.png", contentType: "image/png", localUri: "file:///tmp/logo.png" }));
  assert.deepEqual(aborted, ["b".repeat(32)]);

  const mismatched = createOwnerObjectGateway({
    async call(data) {
      if (data.operation === "begin") return { ok: true, attemptId: "c".repeat(32), uploadUrl: "https://upload.test/staging" };
      return { ok: true, path: "users/owner-a/letterhead/logo.png", generation: "1", size: 1, contentType: "image/png" };
    },
    async put() {
      return 200;
    },
    async localBytes() {
      return 4;
    },
  });
  await assert.rejects(
    () => mismatched.upload({ storagePath: "users/owner-a/letterhead/logo.png", contentType: "image/png", localUri: "file:///tmp/logo.png" }),
    /object_transfer_unknown/
  );
  console.log("ownerObjectGateway.test.ts: ok");
}

void main();