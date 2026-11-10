/**
 * Production gateway plus server controller.
 * A PUT that never creates bytes must stay on the same attempt until the
 * upload deadline, then expire so the user can begin again. A copy that
 * lands and loses its response must be reconciled before any terminal
 * cleanup, including when authority is denied on the retry.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { createOwnerObjectGateway, OwnerObjectTransferError } from "../../../src/services/storage/ownerObjectGateway";
import {
  OBJECT_TRANSFER_CREATE_HEADER,
  OBJECT_TRANSFER_CREATE_HEADER_VALUE,
  OBJECT_TRANSFER_UPLOAD_TTL_MS,
  performOwnerObjectTransfer,
  type OwnerObjectPorts,
  type StoredGeneration,
  type TransferAttempt,
  type TransferResult,
} from "./ownerObjectTransfer";

const UID = "owner-a";
const LETTER = `users/${UID}/letterhead/logo.png`;
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const OTHER = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9, 9, 9, 9, 9, 9]);
const OURS = "9007199254740993";
const REPLACEMENT = "9007199254740995";

type Gen = StoredGeneration & { bytes: Uint8Array };

function sha(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function ports() {
  const attempts = new Map<string, TransferAttempt>();
  const objects = new Map<string, Gen[]>();
  let chain = Promise.resolve();
  const exclusive = async <T>(fn: () => Promise<T> | T): Promise<T> => {
    const run = chain.then(() => fn());
    chain = run.then(() => undefined, () => undefined);
    return run;
  };
  const ids = ["a".repeat(32), "b".repeat(32)];
  let nextId = 0;
  let lostOnce = false;
  const state = {
    now: 10_000,
    deletion: null as string | null,
    copyMode: "ok" as "ok" | "lost",
    removeMode: "ok" as "ok" | "unknown-keep" | "unknown-drop",
    removed: [] as Array<{ path: string; generation: string }>,
    copyCalls: 0,
    attempts,
    objects,
    onAdmit: null as null | (() => Promise<boolean>),
  };
  const api: OwnerObjectPorts = {
    now: () => state.now,
    newAttemptId: () => ids[nextId++] ?? "c".repeat(32),
    newClaim: () => "c".repeat(32),
    async admitSession() {
      return state.onAdmit ? state.onAdmit() : true;
    },
    async admitRestore() {
      return true;
    },
    async readAccount() {
      return { status: "active" };
    },
    async readDeletion() {
      return state.deletion == null ? null : { status: state.deletion };
    },
    async authorizeGrin() {
      return false;
    },
    async createAttempt(attempt) {
      return exclusive(() => {
        if (attempts.has(attempt.attemptId)) return "exists" as const;
        attempts.set(attempt.attemptId, { ...attempt });
        return "created" as const;
      });
    },
    async readAttempt(attemptId) {
      const found = attempts.get(attemptId);
      return found ? { ...found } : null;
    },
    async transition(attemptId, from, expectedClaim, next) {
      return exclusive(() => {
        const current = attempts.get(attemptId);
        if (!current) return { applied: false as const, attempt: null };
        if (!from.includes(current.status) || (expectedClaim != null && current.publicationClaim !== expectedClaim)) {
          return { applied: false as const, attempt: { ...current } };
        }
        const updated = next({ ...current });
        attempts.set(attemptId, updated);
        return { applied: true as const, attempt: updated };
      });
    },
    async signUpload(path) {
      return {
        url: `https://upload.test/${path}`,
        requiredHeaders: { [OBJECT_TRANSFER_CREATE_HEADER]: OBJECT_TRANSFER_CREATE_HEADER_VALUE },
      };
    },
    async signRead() {
      return "https://read.test/object";
    },
    async listGenerations(path) {
      return (objects.get(path) ?? []).map((item) => ({ ...item, metadata: { ...item.metadata } }));
    },
    async readGeneration(path, generation) {
      const found = (objects.get(path) ?? []).find((item) => item.generation === generation);
      return found ? { ...found, metadata: { ...found.metadata } } : null;
    },
    async readBytes(path, generation, length) {
      const found = (objects.get(path) ?? []).find((item) => item.generation === generation);
      return found ? found.bytes.slice(0, length) : null;
    },
    async hashGeneration(path, generation, maxBytes) {
      const found = (objects.get(path) ?? []).find((item) => item.generation === generation);
      if (!found || found.bytes.byteLength > maxBytes) return null;
      return sha(found.bytes);
    },
    async copyGeneration(input) {
      state.copyCalls += 1;
      const source = (objects.get(input.from) ?? []).find((item) => item.generation === input.fromGeneration);
      if (!source) return { outcome: "unknown" as const };
      const destination = objects.get(input.to) ?? [];
      if (state.copyMode === "lost" && !lostOnce) {
        lostOnce = true;
        destination.push({
          generation: OURS,
          size: source.bytes.byteLength,
          contentType: input.contentType,
          metadata: { ...input.metadata },
          bytes: source.bytes.slice(),
        });
        objects.set(input.to, destination);
        return { outcome: "unknown" as const };
      }
      if (destination.length > 0) return { outcome: "precondition" as const };
      destination.push({
        generation: OURS,
        size: source.bytes.byteLength,
        contentType: input.contentType,
        metadata: { ...input.metadata },
        bytes: source.bytes.slice(),
      });
      objects.set(input.to, destination);
      return { outcome: "copied" as const, generation: OURS, size: source.bytes.byteLength };
    },
    async removeGeneration(path, generation) {
      state.removed.push({ path, generation });
      if (state.removeMode !== "ok" && path === LETTER && generation === OURS) {
        const mode = state.removeMode;
        state.removeMode = "ok";
        if (mode === "unknown-drop") {
          objects.set(path, (objects.get(path) ?? []).filter((item) => item.generation !== generation));
        }
        return "unknown" as const;
      }
      const listed = objects.get(path) ?? [];
      const next = listed.filter((item) => item.generation !== generation);
      objects.set(path, next);
      return (next.length === listed.length ? "missing" : "removed") as "missing" | "removed";
    },
  };
  function store(path: string, generation: string, bytes: Uint8Array, metadata: Record<string, string> = {}): void {
    const listed = objects.get(path) ?? [];
    listed.push({ generation, size: bytes.byteLength, contentType: "image/png", metadata, bytes });
    objects.set(path, listed);
  }
  return { state, api, store };
}

function asGatewayCall(api: OwnerObjectPorts) {
  return async (data: Record<string, unknown>) => {
    const result = await performOwnerObjectTransfer(
      {
        uid: UID,
        operation: data.operation as "begin" | "commit" | "abort",
        path: typeof data.path === "string" ? data.path : undefined,
        contentType: typeof data.contentType === "string" ? data.contentType : undefined,
        attemptId: typeof data.attemptId === "string" ? data.attemptId : undefined,
      },
      api
    );
    if (result.ok) return result;
    const error = new Error(result.code === "expired" ? "object_transfer_expired" : "object_transfer_unknown");
    (error as { code?: string }).code = result.code === "expired" ? "failed-precondition" : "unavailable";
    throw error;
  };
}

function generations(state: ReturnType<typeof ports>["state"], path: string): string[] {
  return (state.objects.get(path) ?? []).map((item) => item.generation);
}

async function uploadError(work: Promise<unknown>): Promise<OwnerObjectTransferError> {
  try {
    await work;
  } catch (error) {
    assert.ok(error instanceof OwnerObjectTransferError);
    if (error instanceof OwnerObjectTransferError) return error;
  }
  throw new Error("upload succeeded");
}

async function missingBytes(): Promise<void> {
  const late = ports();
  let hang = true;
  let staging = "";
  const lateGateway = createOwnerObjectGateway({
    waitMs: 20,
    call: async (data) => {
      if (data.operation === "begin") {
        const begun = await asGatewayCall(late.api)(data);
        if (begun && typeof begun === "object" && "stagingPath" in begun) staging = String(begun.stagingPath);
        return begun;
      }
      return asGatewayCall(late.api)(data);
    },
    async put() {
      if (hang) return new Promise<number>(() => undefined);
      late.store(staging, "1", PNG);
      return 200;
    },
    async localBytes() {
      return PNG.byteLength;
    },
  });
  const timedOut = await uploadError(
    lateGateway.upload({ storagePath: LETTER, contentType: "image/png", localUri: "file:///tmp/logo.png" })
  );
  assert.equal(timedOut.code, "unknown");
  assert.equal(timedOut.retryable, true);
  const empty = await uploadError(
    lateGateway.upload({ storagePath: LETTER, contentType: "image/png", localUri: "file:///tmp/logo.png" })
  );
  assert.equal(empty.code, "unknown");
  assert.equal(late.state.attempts.get("a".repeat(32))?.status, "validating");
  assert.equal(generations(late.state, staging).length, 0);
  late.store(staging, "1", PNG);
  const published = await lateGateway.upload({
    storagePath: LETTER,
    contentType: "image/png",
    localUri: "file:///tmp/logo.png",
  });
  assert.equal(published.generation, OURS);
  assert.equal(late.state.attempts.get("a".repeat(32))?.status, "committed");

  const never = ports();
  hang = true;
  staging = "";
  const calls: string[] = [];
  const neverGateway = createOwnerObjectGateway({
    waitMs: 20,
    call: async (data) => {
      calls.push(String(data.operation));
      if (data.operation === "begin") {
        const begun = await asGatewayCall(never.api)(data);
        if (begun && typeof begun === "object" && "stagingPath" in begun) staging = String(begun.stagingPath);
        return begun;
      }
      return asGatewayCall(never.api)(data);
    },
    async put() {
      if (hang) return new Promise<number>(() => undefined);
      never.store(staging, "1", PNG);
      return 200;
    },
    async localBytes() {
      return PNG.byteLength;
    },
  });
  await uploadError(neverGateway.upload({ storagePath: LETTER, contentType: "image/png", localUri: "file:///tmp/logo.png" }));
  const stillUnknown = await uploadError(
    neverGateway.upload({ storagePath: LETTER, contentType: "image/png", localUri: "file:///tmp/logo.png" })
  );
  assert.equal(stillUnknown.code, "unknown");
  assert.equal(never.state.attempts.get("a".repeat(32))?.status, "validating");
  const deadline = 10_000 + OBJECT_TRANSFER_UPLOAD_TTL_MS;
  never.state.now = deadline;
  const expired = await uploadError(
    neverGateway.upload({ storagePath: LETTER, contentType: "image/png", localUri: "file:///tmp/logo.png" })
  );
  assert.equal(expired.code, "expired");
  assert.equal(expired.retryable, true);
  assert.equal(never.state.attempts.get("a".repeat(32))?.status, "expired");
  const again = await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: "a".repeat(32) }, never.api);
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.code, "expired");
  hang = false;
  const begunAgain = await neverGateway.upload({
    storagePath: LETTER,
    contentType: "image/png",
    localUri: "file:///tmp/logo.png",
  });
  assert.equal(begunAgain.generation, OURS);
  assert.equal(never.state.attempts.get("a".repeat(32))?.status, "expired");
  assert.equal(never.state.attempts.get("b".repeat(32))?.status, "committed");
  assert.equal(calls.filter((operation) => operation === "begin").length, 2);
  assert.ok(calls.indexOf("commit") < calls.lastIndexOf("begin"));
}

function retained(worldObjects: Map<string, Gen[]>): boolean {
  return (worldObjects.get(LETTER) ?? []).some((item) => item.generation === REPLACEMENT);
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function deadlineAndStaleDenial(): Promise<void> {
  const late = ports();
  const begun = await performOwnerObjectTransfer(
    { uid: UID, operation: "begin", path: LETTER, contentType: "image/png" },
    late.api
  );
  if (!begun.ok || begun.operation !== "begin") throw new Error("late begin");
  late.store(begun.stagingPath, "1", PNG);
  late.state.now = begun.expiresAt;
  const published = await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: begun.attemptId }, late.api);
  if (!published.ok || published.operation !== "commit") throw new Error("late publish");
  assert.equal(published.generation, OURS);
  assert.equal(late.state.attempts.get(begun.attemptId)?.status, "committed");

  const empty = ports();
  const emptyBegin = await performOwnerObjectTransfer(
    { uid: UID, operation: "begin", path: LETTER, contentType: "image/png" },
    empty.api
  );
  if (!emptyBegin.ok || emptyBegin.operation !== "begin") throw new Error("empty begin");
  empty.state.now = emptyBegin.expiresAt;
  const expired = await performOwnerObjectTransfer(
    { uid: UID, operation: "commit", attemptId: emptyBegin.attemptId },
    empty.api
  );
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.code, "expired");
  assert.equal(empty.state.attempts.get(emptyBegin.attemptId)?.status, "expired");

  const publishing = ports();
  publishing.state.copyMode = "lost";
  const publishingBegin = await performOwnerObjectTransfer(
    { uid: UID, operation: "begin", path: LETTER, contentType: "image/png" },
    publishing.api
  );
  if (!publishingBegin.ok || publishingBegin.operation !== "begin") throw new Error("publishing begin");
  publishing.store(publishingBegin.stagingPath, "1", PNG);
  const lost = await performOwnerObjectTransfer(
    { uid: UID, operation: "commit", attemptId: publishingBegin.attemptId },
    publishing.api
  );
  assert.equal(lost.ok, false);
  publishing.state.now = publishingBegin.expiresAt + OBJECT_TRANSFER_UPLOAD_TTL_MS;
  const stillPublished = await performOwnerObjectTransfer(
    { uid: UID, operation: "commit", attemptId: publishingBegin.attemptId },
    publishing.api
  );
  if (!stillPublished.ok || stillPublished.operation !== "commit") throw new Error("publishing retry");
  assert.equal(stillPublished.generation, OURS);

  const raced = ports();
  raced.state.copyMode = "lost";
  const racedBegin = await performOwnerObjectTransfer(
    { uid: UID, operation: "begin", path: LETTER, contentType: "image/png" },
    raced.api
  );
  if (!racedBegin.ok || racedBegin.operation !== "begin") throw new Error("race begin");
  raced.store(racedBegin.stagingPath, "1", PNG);
  raced.store(LETTER, REPLACEMENT, OTHER, { vydAttempt: "e".repeat(32), vydSha256: sha(OTHER) });
  const readerInAdmit = deferred();
  const writerFinished = deferred();
  let readerResult: TransferResult | null = null;
  let admits = 0;
  raced.state.onAdmit = async () => {
    admits += 1;
    if (admits === 1) {
      void performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: racedBegin.attemptId }, raced.api).then(
        (result) => {
          readerResult = result;
        }
      );
      await readerInAdmit.promise;
      return true;
    }
    readerInAdmit.resolve();
    await writerFinished.promise;
    raced.state.deletion = "completed";
    return false;
  };
  const writer = await performOwnerObjectTransfer(
    { uid: UID, operation: "commit", attemptId: racedBegin.attemptId },
    raced.api
  );
  writerFinished.resolve();
  assert.equal(writer.ok, false);
  if (!writer.ok) assert.equal(writer.code, "unknown");
  for (let attempt = 0; attempt < 50 && readerResult == null; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(readerResult?.ok, false);
  if (readerResult && !readerResult.ok) assert.equal(readerResult.code, "denied");
  assert.equal(raced.state.attempts.get(racedBegin.attemptId)?.status, "failed");
  assert.equal(generations(raced.state, LETTER).includes(OURS), false);
  assert.equal(retained(raced.state.objects), true);
}

async function reconcile(): Promise<void> {
  const denied = ports();
  denied.state.copyMode = "lost";
  const begun = await performOwnerObjectTransfer(
    { uid: UID, operation: "begin", path: LETTER, contentType: "image/png" },
    denied.api
  );
  if (!begun.ok || begun.operation !== "begin") throw new Error("begin");
  denied.store(begun.stagingPath, "1", PNG);
  await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: begun.attemptId }, denied.api);
  denied.store(LETTER, REPLACEMENT, OTHER, { vydAttempt: "e".repeat(32), vydSha256: sha(OTHER) });
  denied.state.deletion = "completed";
  const first = await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: begun.attemptId }, denied.api);
  const second = await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: begun.attemptId }, denied.api);
  assert.equal(first.ok, false);
  if (!first.ok) assert.equal(first.code, "denied");
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.code, "denied");
  assert.equal(denied.state.attempts.get(begun.attemptId)?.status, "failed");
  assert.equal(generations(denied.state, LETTER).includes(OURS), false);
  assert.equal(retained(denied.state.objects), true);
  assert.equal(denied.state.removed.some((item) => item.generation === REPLACEMENT), false);
  assert.equal(denied.state.copyCalls, 1);

  const kept = ports();
  kept.state.copyMode = "lost";
  const keptBegin = await performOwnerObjectTransfer(
    { uid: UID, operation: "begin", path: LETTER, contentType: "image/png" },
    kept.api
  );
  if (!keptBegin.ok || keptBegin.operation !== "begin") throw new Error("kept");
  kept.store(keptBegin.stagingPath, "1", PNG);
  await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: keptBegin.attemptId }, kept.api);
  kept.store(LETTER, REPLACEMENT, OTHER, { vydAttempt: "e".repeat(32), vydSha256: sha(OTHER) });
  kept.state.deletion = "completed";
  kept.state.removeMode = "unknown-keep";
  const uncertain = await performOwnerObjectTransfer(
    { uid: UID, operation: "commit", attemptId: keptBegin.attemptId },
    kept.api
  );
  assert.equal(uncertain.ok, false);
  if (!uncertain.ok) assert.equal(uncertain.code, "unknown");
  assert.equal(kept.state.attempts.get(keptBegin.attemptId)?.status, "publishing");
  assert.equal(kept.state.attempts.get(keptBegin.attemptId)?.compensationGeneration, OURS);
  assert.equal(generations(kept.state, LETTER).includes(OURS), true);
  assert.equal(retained(kept.state.objects), true);
  const settled = await performOwnerObjectTransfer(
    { uid: UID, operation: "commit", attemptId: keptBegin.attemptId },
    kept.api
  );
  assert.equal(settled.ok, false);
  if (!settled.ok) assert.equal(settled.code, "denied");
  assert.equal(kept.state.attempts.get(keptBegin.attemptId)?.status, "failed");
  assert.equal(generations(kept.state, LETTER).includes(OURS), false);
  assert.equal(retained(kept.state.objects), true);

  const dropped = ports();
  dropped.state.copyMode = "lost";
  const droppedBegin = await performOwnerObjectTransfer(
    { uid: UID, operation: "begin", path: LETTER, contentType: "image/png" },
    dropped.api
  );
  if (!droppedBegin.ok || droppedBegin.operation !== "begin") throw new Error("dropped");
  dropped.store(droppedBegin.stagingPath, "1", PNG);
  await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: droppedBegin.attemptId }, dropped.api);
  dropped.store(LETTER, REPLACEMENT, OTHER, { vydAttempt: "e".repeat(32), vydSha256: sha(OTHER) });
  dropped.state.deletion = "completed";
  dropped.state.removeMode = "unknown-drop";
  const hidden = await performOwnerObjectTransfer(
    { uid: UID, operation: "commit", attemptId: droppedBegin.attemptId },
    dropped.api
  );
  assert.equal(hidden.ok, false);
  if (!hidden.ok) assert.equal(hidden.code, "unknown");
  assert.equal(dropped.state.attempts.get(droppedBegin.attemptId)?.status, "publishing");
  assert.equal(generations(dropped.state, LETTER).includes(OURS), false);
  const follow = await performOwnerObjectTransfer(
    { uid: UID, operation: "commit", attemptId: droppedBegin.attemptId },
    dropped.api
  );
  assert.equal(follow.ok, false);
  if (!follow.ok) assert.equal(follow.code, "denied");
  assert.equal(dropped.state.attempts.get(droppedBegin.attemptId)?.status, "failed");
  assert.equal(retained(dropped.state.objects), true);
  assert.equal(dropped.state.removed.filter((item) => item.generation === REPLACEMENT).length, 0);

  const raced = ports();
  raced.state.copyMode = "lost";
  const racedBegin = await performOwnerObjectTransfer(
    { uid: UID, operation: "begin", path: LETTER, contentType: "image/png" },
    raced.api
  );
  if (!racedBegin.ok || racedBegin.operation !== "begin") throw new Error("raced");
  raced.store(racedBegin.stagingPath, "1", PNG);
  await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: racedBegin.attemptId }, raced.api);
  raced.store(LETTER, REPLACEMENT, OTHER, { vydAttempt: "e".repeat(32), vydSha256: sha(OTHER) });
  raced.state.deletion = "completed";
  const [left, right] = await Promise.all([
    performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: racedBegin.attemptId }, raced.api),
    performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: racedBegin.attemptId }, raced.api),
  ]);
  assert.equal(left.ok, false);
  assert.equal(right.ok, false);
  assert.equal(raced.state.attempts.get(racedBegin.attemptId)?.status, "failed");
  assert.equal(generations(raced.state, LETTER).includes(OURS), false);
  assert.equal(retained(raced.state.objects), true);
  assert.equal(raced.state.removed.some((item) => item.generation === REPLACEMENT), false);
}

async function main(): Promise<void> {
  await missingBytes();
  await deadlineAndStaleDenial();
  await reconcile();
  console.log("ownerObjectTransfer.recovery.test.ts: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
