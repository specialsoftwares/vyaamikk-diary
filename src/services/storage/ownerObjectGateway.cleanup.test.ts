import assert from "node:assert/strict";

import { syncSessionOwnership } from "@/sync/syncSessionOwnership";

import { createOwnerObjectGateway, OwnerObjectTransferError } from "./ownerObjectGateway";
import { StorageUploadOwnershipError } from "./userStorageUploadCore";

const PATH = "users/owner-a/letterhead/logo.png";
const ATTEMPT = "a".repeat(32);
const HEADERS = { "x-goog-if-generation-match": "0" };

async function main(): Promise<void> {
  const calls: string[] = [];
  const gateway = createOwnerObjectGateway({
    waitMs: 30,
    async call(data) {
      calls.push(String(data.operation));
      if (data.operation === "begin") {
        return { ok: true, attemptId: ATTEMPT, uploadUrl: "https://upload.test/staging", requiredHeaders: HEADERS };
      }
      if (data.operation === "abort") return new Promise(() => undefined);
      return { ok: true, path: PATH, generation: "44", size: 4, contentType: "image/png" };
    },
    async put() {
      return 500;
    },
    async localBytes() {
      return 4;
    },
  });

  const started = Date.now();
  const outcome = await Promise.race([
    gateway.upload({ storagePath: PATH, contentType: "image/png", localUri: "file:///tmp/logo.png" }).then(
      () => "completed",
      (error: unknown) => error
    ),
    new Promise<string>((resolve) => setTimeout(() => resolve("hung"), 400)),
  ]);
  assert.ok(Date.now() - started < 400);
  assert.equal(outcome === "hung" || outcome === "completed", false);
  assert.ok(outcome instanceof OwnerObjectTransferError);
  assert.equal(outcome.code, "unknown");
  assert.equal(outcome.retryable, true);
  assert.equal(outcome.attemptId, ATTEMPT);
  assert.equal(calls.filter((operation) => operation === "abort").length, 1);

  const retried = await gateway.upload({ storagePath: PATH, contentType: "image/png", localUri: "file:///tmp/logo.png" });
  assert.equal(retried.generation, "44");
  assert.deepEqual(calls, ["begin", "abort", "commit"]);

  syncSessionOwnership.resetForTests();
  const original = syncSessionOwnership.beginSession("owner-a");
  let replacement = original;
  const sessionCalls: string[] = [];
  const switched = createOwnerObjectGateway({
    waitMs: 30,
    async call(data) {
      sessionCalls.push(String(data.operation));
      if (data.operation === "begin") {
        return { ok: true, attemptId: "c".repeat(32), uploadUrl: "https://upload.test/staging", requiredHeaders: HEADERS };
      }
      if (data.operation === "abort") return new Promise(() => undefined);
      return { ok: true, path: PATH, generation: "45", size: 4, contentType: "image/png" };
    },
    async put() {
      replacement = syncSessionOwnership.beginSession("owner-b");
      return 200;
    },
    async localBytes() {
      return 4;
    },
  });
  const retired = await Promise.race([
    switched.upload({
      storagePath: PATH,
      contentType: "image/png",
      localUri: "file:///tmp/logo.png",
      userId: "owner-a",
      session: original,
    }).then(
      () => "completed",
      (error: unknown) => error
    ),
    new Promise<string>((resolve) => setTimeout(() => resolve("hung"), 400)),
  ]);
  assert.ok(retired instanceof OwnerObjectTransferError);
  if (retired instanceof OwnerObjectTransferError) {
    assert.equal(retired.code, "unknown");
    assert.equal(retired.retryable, true);
  }
  assert.equal(retired instanceof StorageUploadOwnershipError, false);
  const second = await Promise.race([
    switched.upload({
      storagePath: PATH,
      contentType: "image/png",
      localUri: "file:///tmp/logo.png",
      userId: "owner-b",
      session: replacement,
    }).then(
      () => "completed",
      (error: unknown) => error
    ),
    new Promise<string>((resolve) => setTimeout(() => resolve("hung"), 400)),
  ]);
  assert.ok(second instanceof OwnerObjectTransferError);
  assert.equal(sessionCalls.filter((operation) => operation === "begin").length, 1);
  assert.equal(sessionCalls.includes("commit"), false);

  syncSessionOwnership.resetForTests();
  const firstSession = syncSessionOwnership.beginSession("owner-a");
  let liveSession = firstSession;
  let rotateAfterCommit = true;
  const recoveredCalls: string[] = [];
  const recovered = createOwnerObjectGateway({
    waitMs: 40,
    async call(data) {
      recoveredCalls.push(String(data.operation));
      if (data.operation === "begin") {
        return { ok: true, attemptId: "d".repeat(32), uploadUrl: "https://upload.test/staging", requiredHeaders: HEADERS };
      }
      if (data.operation === "abort") {
        throw Object.assign(new Error("object_conflict"), { code: "aborted" });
      }
      if (data.operation === "commit") {
        const response = {
          ok: true as const,
          path: PATH,
          generation: "9007199254740993",
          size: 4,
          contentType: "image/png",
        };
        if (rotateAfterCommit) {
          rotateAfterCommit = false;
          liveSession = syncSessionOwnership.beginSession("owner-a");
        }
        return response;
      }
      return { ok: true };
    },
    async put() {
      return 200;
    },
    async localBytes() {
      return 4;
    },
  });
  const lostAck = await recovered
    .upload({
      storagePath: PATH,
      contentType: "image/png",
      localUri: "file:///tmp/logo.png",
      userId: "owner-a",
      session: firstSession,
    })
    .then(
      () => null,
      (error: unknown) => error
    );
  assert.ok(lostAck instanceof StorageUploadOwnershipError);
  const adopted = await recovered.upload({
    storagePath: PATH,
    contentType: "image/png",
    localUri: "file:///tmp/logo.png",
    userId: "owner-a",
    session: liveSession,
  });
  assert.equal(adopted.generation, "9007199254740993");
  assert.equal(recoveredCalls.filter((operation) => operation === "begin").length, 1);
  assert.equal(recoveredCalls.filter((operation) => operation === "abort").length, 0);
  assert.equal(recoveredCalls.filter((operation) => operation === "commit").length, 2);

  console.log("ownerObjectGateway.cleanup.test.ts: ok");
}

void main();
