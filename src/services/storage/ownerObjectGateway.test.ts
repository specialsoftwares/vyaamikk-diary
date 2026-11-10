import assert from "node:assert/strict";

import { syncSessionOwnership } from "@/sync/syncSessionOwnership";

import { createOwnerObjectGateway, OwnerObjectTransferError } from "./ownerObjectGateway";
import { StorageUploadOwnershipError } from "./userStorageUploadCore";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
const PATH = "users/owner-a/letterhead/logo.png";
const HEADERS = { "x-goog-if-generation-match": "0" };

function begin(attemptId: string) {
  return {
    ok: true,
    attemptId,
    uploadUrl: "https://upload.test/staging",
    requiredHeaders: HEADERS,
  };
}

async function main(): Promise<void> {
  const calls: Array<Record<string, unknown>> = [];
  let headers: Record<string, string> | null = null;
  const gateway = createOwnerObjectGateway({
    async call(data) {
      calls.push(data);
      if (data.operation === "begin") return begin("a".repeat(32));
      if (data.operation === "commit") {
        return { ok: true, path: PATH, generation: "44", size: PNG.byteLength, contentType: "image/png" };
      }
      return { ok: true, operation: data.operation };
    },
    async put(input) {
      headers = input.headers;
      return 200;
    },
    async localBytes() {
      return PNG.byteLength;
    },
  });
  const uploaded = await gateway.upload({
    storagePath: PATH,
    contentType: "image/png",
    localUri: "file:///tmp/logo.png",
  });
  assert.equal(uploaded.generation, "44");
  assert.equal(uploaded.remoteBytes, PNG.byteLength);
  assert.equal("downloadUrl" in uploaded, false);
  assert.equal(headers?.["x-goog-if-generation-match"], "0");
  assert.deepEqual(calls.map((call) => call.operation), ["begin", "commit"]);

  const aborted: string[] = [];
  const failing = createOwnerObjectGateway({
    async call(data) {
      if (data.operation === "abort") aborted.push(String(data.attemptId));
      if (data.operation === "begin") return begin("b".repeat(32));
      return { ok: false };
    },
    async put() {
      return 500;
    },
    async localBytes() {
      return 4;
    },
  });
  await assert.rejects(
    () => failing.upload({ storagePath: PATH, contentType: "image/png", localUri: "file:///tmp/logo.png" }),
    OwnerObjectTransferError
  );
  assert.deepEqual(aborted, ["b".repeat(32)]);

  const mismatched = createOwnerObjectGateway({
    async call(data) {
      if (data.operation === "begin") return begin("c".repeat(32));
      return { ok: true, path: PATH, generation: "1", size: 1, contentType: "image/png" };
    },
    async put() {
      return 200;
    },
    async localBytes() {
      return 4;
    },
  });
  await assert.rejects(
    () => mismatched.upload({ storagePath: PATH, contentType: "image/png", localUri: "file:///tmp/logo.png" }),
    (error: unknown) => error instanceof OwnerObjectTransferError && error.code === "unknown"
  );

  syncSessionOwnership.resetForTests();
  const prepared = syncSessionOwnership.beginSession("owner-a");
  const preparedCalls: string[] = [];
  const duringPrep = createOwnerObjectGateway({
    async call(data) {
      preparedCalls.push(String(data.operation));
      return begin("d".repeat(32));
    },
    async put() {
      return 200;
    },
    async localBytes() {
      syncSessionOwnership.beginSession("owner-a");
      return 4;
    },
  });
  await assert.rejects(
    () => duringPrep.upload({ storagePath: PATH, contentType: "image/png", localUri: "file:///tmp/logo.png", userId: "owner-a", session: prepared }),
    StorageUploadOwnershipError
  );
  assert.deepEqual(preparedCalls, []);

  syncSessionOwnership.resetForTests();
  const duringPutSession = syncSessionOwnership.beginSession("owner-a");
  const putCalls: string[] = [];
  const duringPut = createOwnerObjectGateway({
    async call(data) {
      putCalls.push(String(data.operation));
      if (data.operation === "begin") return begin("e".repeat(32));
      return { ok: true };
    },
    async put() {
      syncSessionOwnership.beginSession("owner-b");
      return 200;
    },
    async localBytes() {
      return 4;
    },
  });
  await assert.rejects(
    () => duringPut.upload({ storagePath: PATH, contentType: "image/png", localUri: "file:///tmp/logo.png", userId: "owner-a", session: duringPutSession }),
    StorageUploadOwnershipError
  );
  assert.equal(putCalls.includes("commit"), false);

  syncSessionOwnership.resetForTests();
  const duringCommitSession = syncSessionOwnership.beginSession("owner-a");
  let commitReturned = false;
  const duringCommit = createOwnerObjectGateway({
    async call(data) {
      if (data.operation === "begin") return begin("f".repeat(32));
      syncSessionOwnership.beginSession("owner-a");
      return { ok: true, path: PATH, generation: "44", size: 4, contentType: "image/png" };
    },
    async put() {
      return 200;
    },
    async localBytes() {
      return 4;
    },
  });
  await assert.rejects(
    () => duringCommit.upload({
      storagePath: PATH,
      contentType: "image/png",
      localUri: "file:///tmp/logo.png",
      userId: "owner-a",
      session: duringCommitSession,
    }),
    StorageUploadOwnershipError
  );
  assert.equal(commitReturned, false);

  const hungCalls: string[] = [];
  const hung = createOwnerObjectGateway({
    waitMs: 20,
    async call(data) {
      hungCalls.push(String(data.operation));
      if (data.operation === "begin") return begin("1".repeat(32));
      return new Promise(() => undefined);
    },
    async put() {
      return 200;
    },
    async localBytes() {
      return 4;
    },
  });
  const timedOut = await hung.upload({ storagePath: PATH, contentType: "image/png", localUri: "file:///tmp/logo.png" }).then(
    () => null,
    (error: unknown) => error
  );
  assert.ok(timedOut instanceof OwnerObjectTransferError);
  if (timedOut instanceof OwnerObjectTransferError) {
    assert.equal(timedOut.code, "unknown");
    assert.equal(timedOut.attemptId, "1".repeat(32));
    assert.equal(timedOut.retryable, true);
  }
  assert.equal(hungCalls.includes("abort"), false);
  let retryCommit = "";
  const retried = createOwnerObjectGateway({
    async call(data) {
      if (data.operation === "commit") retryCommit = String(data.attemptId);
      if (data.operation === "begin") return begin("2".repeat(32));
      return { ok: true, path: PATH, generation: "44", size: 4, contentType: "image/png" };
    },
    async put() {
      throw new Error("retry must not upload again");
    },
    async localBytes() {
      return 4;
    },
  });
  const retriedUpload = await retried.upload({
    storagePath: PATH,
    contentType: "image/png",
    localUri: "file:///tmp/logo.png",
    attemptId: "1".repeat(32),
  });
  assert.equal(retriedUpload.generation, "44");
  assert.equal(retryCommit, "1".repeat(32));

  const reader = createOwnerObjectGateway({
    async call() {
      throw new Error("grin read must not reach the callable");
    },
    async put() {
      return 200;
    },
    async localBytes() {
      return 4;
    },
  });
  await assert.rejects(
    () => reader.read("users/owner-a/grinEvidence/abcdEFGH1234_-ab/original"),
    (error: unknown) => error instanceof OwnerObjectTransferError && error.code === "unsupported"
  );
  await assert.rejects(
    () => reader.remove("users/owner-a/grinEvidence/abcdEFGH1234_-ab/original"),
    (error: unknown) => error instanceof OwnerObjectTransferError && error.code === "unsupported"
  );

  console.log("ownerObjectGateway.test.ts: ok");
}

void main();
