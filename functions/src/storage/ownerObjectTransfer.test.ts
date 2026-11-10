import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  OBJECT_TRANSFER_CREATE_HEADER,
  OBJECT_TRANSFER_CREATE_HEADER_VALUE,
  classifyOwnedObjectPath,
  evaluateGrinUploadAuthority,
  performOwnerObjectTransfer,
  sniffObjectBytes,
  type OwnerObjectPorts,
  type StoredGeneration,
  type TransferAttempt,
  type TransferResult,
} from "./ownerObjectTransfer";

const UID = "owner-a";
const OTHER = "owner-b";
const GRIN_KEY = "abcdEFGH1234_-ab";
const LETTER = `users/${UID}/letterhead/logo.png`;
const GRIN = `users/${UID}/grinEvidence/${GRIN_KEY}/original`;
const SCOPE = { ledgerId: "ledger1", receiptId: "receipt1", evidenceId: "evidence1" };
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);

type Bytes = Uint8Array;
type Gen = StoredGeneration & { bytes: Bytes };

function sha(bytes: Bytes): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function memoryPorts(now = 1_000): OwnerObjectPorts & {
  attempts: Map<string, TransferAttempt>;
  objects: Map<string, Gen[]>;
  removed: Array<{ path: string; generation: string }>;
  copyCalls: Array<{ from: string; fromGeneration: string; to: string; ifGenerationMatch: string; metadata: Record<string, string> }>;
  signReads: string[];
  accountStatus: string;
  deletionStatus: string | null;
  admittedSession: boolean;
  admittedRestore: boolean;
  evidenceState: string;
  userStatus: string;
  newCommands: "allow" | "deny";
  objectKeyBound: boolean;
  copyMode: "ok" | "unknown" | "lost";
  nextPublished: string;
  onHashed: (() => Promise<void>) | null;
  onCopy: (() => Promise<void>) | null;
} {
  const attempts = new Map<string, TransferAttempt>();
  const objects = new Map<string, Gen[]>();
  let chain = Promise.resolve();
  const exclusive = async <T>(fn: () => Promise<T> | T): Promise<T> => {
    const run = chain.then(() => fn());
    chain = run.then(() => undefined, () => undefined);
    return run;
  };
  const ports = {
    attempts,
    objects,
    removed: [] as Array<{ path: string; generation: string }>,
    copyCalls: [] as Array<{ from: string; fromGeneration: string; to: string; ifGenerationMatch: string; metadata: Record<string, string> }>,
    signReads: [] as string[],
    accountStatus: "active",
    deletionStatus: null as string | null,
    admittedSession: true,
    admittedRestore: true,
    evidenceState: "reserved",
    userStatus: "active",
    newCommands: "allow" as "allow" | "deny",
    objectKeyBound: true,
    copyMode: "ok" as "ok" | "unknown" | "lost",
    nextPublished: "44",
    lostOnce: false,
    onHashed: null as (() => Promise<void>) | null,
    onCopy: null as (() => Promise<void>) | null,
    now: () => now,
    newAttemptId: () => "a".repeat(32),
    newClaim: () => "c".repeat(32),
    async admitSession() {
      return ports.admittedSession;
    },
    async admitRestore() {
      return ports.admittedRestore;
    },
    async readAccount() {
      return { status: ports.accountStatus };
    },
    async readDeletion() {
      return ports.deletionStatus == null ? null : { status: ports.deletionStatus };
    },
    async authorizeGrin(attempt: TransferAttempt) {
      return evaluateGrinUploadAuthority({
        uid: attempt.uid,
        ledgerId: attempt.grin?.ledgerId ?? "",
        receiptId: attempt.grin?.receiptId ?? "",
        evidenceId: attempt.grin?.evidenceId ?? "",
        objectKey: GRIN_KEY,
        storagePath: attempt.path,
        user: { status: ports.userStatus },
        ledger: { ownerUid: attempt.uid, status: "active" },
        admission: { schemaVersion: 1, newCommands: ports.newCommands, reconciliation: "deny" },
        receiptExists: true,
        evidence: {
          ownerUid: attempt.uid,
          ledgerId: attempt.grin?.ledgerId,
          receiptId: attempt.grin?.receiptId,
          evidenceId: attempt.grin?.evidenceId,
          objectKey: GRIN_KEY,
          storagePath: attempt.path,
          state: ports.evidenceState,
        },
        objectKeyDoc: ports.objectKeyBound
          ? {
              schemaVersion: 1,
              objectKey: GRIN_KEY,
              evidenceId: attempt.grin?.evidenceId,
              ledgerId: attempt.grin?.ledgerId,
              receiptId: attempt.grin?.receiptId,
              ownerUid: attempt.uid,
              state: ports.evidenceState,
            }
          : null,
      });
    },
    async createAttempt(attempt: TransferAttempt) {
      return exclusive(() => {
        if (attempts.has(attempt.attemptId)) return "exists" as const;
        attempts.set(attempt.attemptId, { ...attempt });
        return "created" as const;
      });
    },
    async readAttempt(attemptId: string) {
      const found = attempts.get(attemptId);
      return found ? { ...found, grin: found.grin ? { ...found.grin } : null } : null;
    },
    async transition(attemptId, from, expectedClaim, next) {
      return exclusive(() => {
        const current = attempts.get(attemptId);
        if (!current) return { applied: false as const, attempt: null };
        if (!from.includes(current.status) || (expectedClaim != null && current.publicationClaim !== expectedClaim)) {
          return { applied: false as const, attempt: { ...current } };
        }
        const updated = next({ ...current, grin: current.grin ? { ...current.grin } : null });
        attempts.set(attemptId, updated);
        return { applied: true as const, attempt: updated };
      });
    },
    async signUpload(path: string) {
      return { url: `https://upload.test/${path}`, requiredHeaders: { [OBJECT_TRANSFER_CREATE_HEADER]: OBJECT_TRANSFER_CREATE_HEADER_VALUE } };
    },
    async signRead(path: string, generation: string) {
      ports.signReads.push(`${path}#${generation}`);
      return `https://read.test/${path}?generation=${generation}`;
    },
    async listGenerations(path: string) {
      return (objects.get(path) ?? []).map((item) => ({ ...item, metadata: { ...item.metadata } }));
    },
    async readGeneration(path: string, generation: string) {
      const found = (objects.get(path) ?? []).find((item) => item.generation === generation);
      return found ? { ...found, metadata: { ...found.metadata } } : null;
    },
    async readBytes(path: string, generation: string, length: number) {
      const found = (objects.get(path) ?? []).find((item) => item.generation === generation);
      return found ? found.bytes.slice(0, length) : null;
    },
    async hashGeneration(path: string, generation: string, maxBytes: number) {
      const found = (objects.get(path) ?? []).find((item) => item.generation === generation);
      if (!found || found.bytes.byteLength > maxBytes) return null;
      const digest = sha(found.bytes);
      if (ports.onHashed) await ports.onHashed();
      return digest;
    },
    async copyGeneration(input) {
      ports.copyCalls.push({
        from: input.from,
        fromGeneration: input.fromGeneration,
        to: input.to,
        ifGenerationMatch: input.ifGenerationMatch,
        metadata: input.metadata,
      });
      if (ports.onCopy) await ports.onCopy();
      const source = (objects.get(input.from) ?? []).find((item) => item.generation === input.fromGeneration);
      if (!source) return { outcome: "unknown" as const };
      const destination = objects.get(input.to) ?? [];
      if (ports.copyMode === "unknown") return { outcome: "unknown" as const };
      if (ports.copyMode === "lost" && !ports.lostOnce) {
        const generation = ports.nextPublished;
        destination.push({
          generation,
          size: source.bytes.byteLength,
          contentType: input.contentType,
          metadata: { ...input.metadata },
          bytes: source.bytes.slice(),
        });
        objects.set(input.to, destination);
        ports.lostOnce = true;
        return { outcome: "unknown" as const };
      }
      if (destination.length > 0) return { outcome: "precondition" as const };
      const generation = ports.nextPublished;
      destination.push({
        generation,
        size: source.bytes.byteLength,
        contentType: input.contentType,
        metadata: { ...input.metadata },
        bytes: source.bytes.slice(),
      });
      objects.set(input.to, destination);
      return { outcome: "copied" as const, generation, size: source.bytes.byteLength };
    },
    async removeGeneration(path: string, generation: string) {
      ports.removed.push({ path, generation });
      const listed = objects.get(path) ?? [];
      objects.set(path, listed.filter((item) => item.generation !== generation));
      return "removed" as const;
    },
  };
  return ports;
}

function put(ports: ReturnType<typeof memoryPorts>, path: string, generation: string, bytes: Bytes, metadata: Record<string, string> = {}): void {
  const listed = ports.objects.get(path) ?? [];
  listed.push({ generation, size: bytes.byteLength, contentType: "application/octet-stream", metadata, bytes });
  ports.objects.set(path, listed);
}

function assertFail(result: TransferResult, code: string): void {
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, code);
}

async function main(): Promise<void> {
  assert.equal(classifyOwnedObjectPath(UID, `users/${OTHER}/letterhead/logo.png`), null);
  assert.equal(classifyOwnedObjectPath(UID, `users/${UID}/../${OTHER}/letterhead/logo.png`), null);
  assert.equal(classifyOwnedObjectPath(UID, "company/invoices/secret.pdf"), null);
  assert.equal(sniffObjectBytes("pdfs", PNG), null);
  assert.equal(sniffObjectBytes("letterhead", PNG), "image/png");
  assert.equal(evaluateGrinUploadAuthority({
    uid: UID,
    ledgerId: SCOPE.ledgerId,
    receiptId: SCOPE.receiptId,
    evidenceId: SCOPE.evidenceId,
    objectKey: GRIN_KEY,
    storagePath: GRIN,
    user: { status: "active" },
    ledger: { ownerUid: UID, status: "active" },
    admission: { schemaVersion: 1, newCommands: "deny", reconciliation: "allow" },
    receiptExists: true,
    evidence: { ownerUid: UID, ledgerId: SCOPE.ledgerId, receiptId: SCOPE.receiptId, evidenceId: SCOPE.evidenceId, objectKey: GRIN_KEY, storagePath: GRIN, state: "verified" },
    objectKeyDoc: { schemaVersion: 1, objectKey: GRIN_KEY, evidenceId: SCOPE.evidenceId, ledgerId: SCOPE.ledgerId, receiptId: SCOPE.receiptId, ownerUid: UID },
  }), false);

  const cross = await performOwnerObjectTransfer(
    { uid: UID, operation: "begin", path: LETTER, contentType: "image/png", payloadUid: OTHER },
    memoryPorts()
  );
  assertFail(cross, "denied");

  const inactive = memoryPorts();
  inactive.accountStatus = "pending_deletion";
  assert.equal((await performOwnerObjectTransfer({ uid: UID, operation: "begin", path: LETTER, contentType: "image/png" }, inactive)).ok, false);

  const ports = memoryPorts();
  const begun = await performOwnerObjectTransfer({ uid: UID, operation: "begin", path: LETTER, contentType: "image/png" }, ports);
  assert.equal(begun.ok, true);
  if (!begun.ok || begun.operation !== "begin") throw new Error("begin");
  assert.equal(begun.requiredHeaders[OBJECT_TRANSFER_CREATE_HEADER], OBJECT_TRANSFER_CREATE_HEADER_VALUE);
  put(ports, begun.stagingPath, "1", PNG);
  ports.nextPublished = "9007199254740993";
  const committed = await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: begun.attemptId }, ports);
  assert.equal(committed.ok, true);
  if (!committed.ok || committed.operation !== "commit") throw new Error("commit");
  assert.equal(committed.generation, "9007199254740993");
  assert.equal(ports.copyCalls[0]?.fromGeneration, "1");
  assert.equal(ports.copyCalls[0]?.ifGenerationMatch, "0");
  assert.equal(ports.objects.has(begun.stagingPath) ? ports.objects.get(begun.stagingPath)?.length : 0, 0);
  assert.equal(ports.removed.some((item) => item.path === LETTER), false);
  const again = await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: begun.attemptId }, ports);
  if (!again.ok || again.operation !== "commit") throw new Error("retry");
  assert.equal(again.generation, "9007199254740993");
  assert.equal(ports.copyCalls.length, 1);

  const html = memoryPorts();
  const htmlBegin = await performOwnerObjectTransfer({ uid: UID, operation: "begin", path: LETTER, contentType: "image/png" }, html);
  if (!htmlBegin.ok || htmlBegin.operation !== "begin") throw new Error("html begin");
  put(html, htmlBegin.stagingPath, "1", Uint8Array.from(Buffer.from("<html>")));
  assertFail(await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: htmlBegin.attemptId }, html), "type");
  assert.equal(html.objects.has(LETTER), false);

  const different = memoryPorts();
  const differentBegin = await performOwnerObjectTransfer({ uid: UID, operation: "begin", path: LETTER, contentType: "image/png" }, different);
  if (!differentBegin.ok || differentBegin.operation !== "begin") throw new Error("different");
  const original = Uint8Array.from([...PNG, 1, 2, 3, 4]);
  const unrelated = Uint8Array.from([...PNG, 9, 9, 9, 9]);
  assert.equal(original.byteLength, unrelated.byteLength);
  assert.equal(Buffer.from(original.subarray(0, 16)).equals(Buffer.from(unrelated.subarray(0, 16))), true);
  put(different, differentBegin.stagingPath, "1", original);
  put(different, LETTER, "77", unrelated, { vydAttempt: "f".repeat(32), vydSha256: sha(unrelated) });
  const rejected = await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: differentBegin.attemptId }, different);
  assertFail(rejected, "conflict");
  assert.equal(different.objects.get(LETTER)?.length, 1);
  assert.equal(Buffer.from(different.objects.get(LETTER)?.[0]?.bytes ?? new Uint8Array()).equals(Buffer.from(unrelated)), true);
  assert.equal(different.attempts.get(differentBegin.attemptId)?.status, "failed");

  const replaced = memoryPorts();
  const replacedBegin = await performOwnerObjectTransfer({ uid: UID, operation: "begin", path: LETTER, contentType: "image/png" }, replaced);
  if (!replacedBegin.ok || replacedBegin.operation !== "begin") throw new Error("replaced");
  put(replaced, replacedBegin.stagingPath, "1", original);
  replaced.onHashed = async () => {
    put(replaced, replacedBegin.stagingPath, "2", unrelated);
  };
  const replacement = await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: replacedBegin.attemptId }, replaced);
  assertFail(replacement, "conflict");
  assert.equal(replaced.copyCalls.some((call) => call.fromGeneration === "2"), false);
  assert.equal(replaced.objects.has(LETTER), false);

  const published = `users/${UID}/attachments/rec/photo.jpg`;
  const first = memoryPorts();
  const firstBegin = await performOwnerObjectTransfer({ uid: UID, operation: "begin", path: published, contentType: "image/jpeg" }, first);
  if (!firstBegin.ok || firstBegin.operation !== "begin") throw new Error("first");
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
  put(first, firstBegin.stagingPath, "1", jpeg);
  await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: firstBegin.attemptId }, first);
  const secondId = "b".repeat(32);
  first.newAttemptId = () => secondId;
  const secondBegin = await performOwnerObjectTransfer({ uid: UID, operation: "begin", path: published, contentType: "image/jpeg" }, first);
  if (!secondBegin.ok || secondBegin.operation !== "begin") throw new Error("second");
  put(first, secondBegin.stagingPath, "9", Uint8Array.from([0xff, 0xd8, 0xff, 0x00]));
  assertFail(await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: secondId }, first), "conflict");
  assert.equal(first.objects.get(published)?.[0]?.generation, "44");
  assert.equal(first.removed.some((item) => item.path === published), false);

  const lost = memoryPorts();
  const lostBegin = await performOwnerObjectTransfer({ uid: UID, operation: "begin", path: LETTER, contentType: "image/png" }, lost);
  if (!lostBegin.ok || lostBegin.operation !== "begin") throw new Error("lost");
  put(lost, lostBegin.stagingPath, "1", original);
  lost.copyMode = "unknown";
  const unknown = await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: lostBegin.attemptId }, lost);
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.retryable, true);
  assert.equal(lost.objects.has(LETTER), false);
  assert.equal(lost.attempts.get(lostBegin.attemptId)?.status, "publishing");
  lost.copyMode = "ok";
  lost.nextPublished = "9007199254740993";
  const recoveredUnknown = await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: lostBegin.attemptId }, lost);
  if (!recoveredUnknown.ok || recoveredUnknown.operation !== "commit") throw new Error("recovered unknown");
  assert.equal(recoveredUnknown.generation, "9007199254740993");

  const lostResponse = memoryPorts();
  const lostResponseBegin = await performOwnerObjectTransfer({ uid: UID, operation: "begin", path: LETTER, contentType: "image/png" }, lostResponse);
  if (!lostResponseBegin.ok || lostResponseBegin.operation !== "begin") throw new Error("lost response");
  put(lostResponse, lostResponseBegin.stagingPath, "1", original);
  lostResponse.copyMode = "lost";
  lostResponse.nextPublished = "9007199254740993";
  const firstLost = await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: lostResponseBegin.attemptId }, lostResponse);
  assert.equal(firstLost.ok, false);
  put(lostResponse, LETTER, "9007199254740995", unrelated, { vydAttempt: "e".repeat(32), vydSha256: sha(unrelated) });
  const retryLost = await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: lostResponseBegin.attemptId }, lostResponse);
  if (!retryLost.ok || retryLost.operation !== "commit") throw new Error("retry lost");
  assert.equal(retryLost.generation, "9007199254740993");
  assert.notEqual(retryLost.generation, "9007199254740995");

  const raced = memoryPorts();
  const racedBegin = await performOwnerObjectTransfer({ uid: UID, operation: "begin", path: LETTER, contentType: "image/png" }, raced);
  if (!racedBegin.ok || racedBegin.operation !== "begin") throw new Error("race");
  put(raced, racedBegin.stagingPath, "1", PNG);
  let abortDuringHash: TransferResult | null = null;
  raced.onHashed = async () => {
    abortDuringHash = await performOwnerObjectTransfer({ uid: UID, operation: "abort", attemptId: racedBegin.attemptId }, raced);
  };
  const commitDuringAbort = await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: racedBegin.attemptId }, raced);
  assert.equal(abortDuringHash?.ok, true);
  assertFail(commitDuringAbort, "conflict");
  assert.equal(raced.attempts.get(racedBegin.attemptId)?.status, "aborted");
  assert.equal(raced.objects.has(LETTER), false);
  assertFail(await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: racedBegin.attemptId }, raced), "conflict");
  assert.equal(raced.attempts.get(racedBegin.attemptId)?.status, "aborted");

  const publishing = memoryPorts();
  const publishingBegin = await performOwnerObjectTransfer({ uid: UID, operation: "begin", path: LETTER, contentType: "image/png" }, publishing);
  if (!publishingBegin.ok || publishingBegin.operation !== "begin") throw new Error("publishing");
  put(publishing, publishingBegin.stagingPath, "1", PNG);
  let abortDuringCopy: TransferResult | null = null;
  publishing.onCopy = async () => {
    abortDuringCopy = await performOwnerObjectTransfer({ uid: UID, operation: "abort", attemptId: publishingBegin.attemptId }, publishing);
  };
  const commitWins = await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: publishingBegin.attemptId }, publishing);
  assert.equal(abortDuringCopy?.ok, false);
  assert.equal(commitWins.ok, true);
  assert.equal(publishing.attempts.get(publishingBegin.attemptId)?.status, "committed");

  const duplicate = memoryPorts();
  const duplicateBegin = await performOwnerObjectTransfer({ uid: UID, operation: "begin", path: LETTER, contentType: "image/png" }, duplicate);
  if (!duplicateBegin.ok || duplicateBegin.operation !== "begin") throw new Error("duplicate");
  put(duplicate, duplicateBegin.stagingPath, "1", PNG);
  duplicate.nextPublished = "9007199254740993";
  const [left, right] = await Promise.all([
    performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: duplicateBegin.attemptId }, duplicate),
    performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: duplicateBegin.attemptId }, duplicate),
  ]);
  const follow = await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: duplicateBegin.attemptId }, duplicate);
  const successes = [left, right, follow].filter((result) => result.ok && result.operation === "commit");
  assert.equal(successes.length >= 1, true);
  for (const result of successes) {
    if (result.ok && result.operation === "commit") assert.equal(result.generation, "9007199254740993");
  }
  assert.equal(duplicate.objects.get(LETTER)?.length, 1);
  assert.equal(duplicate.attempts.get(duplicateBegin.attemptId)?.status, "committed");

  const deleted = memoryPorts();
  const deletedBegin = await performOwnerObjectTransfer({ uid: UID, operation: "begin", path: LETTER, contentType: "image/png" }, deleted);
  if (!deletedBegin.ok || deletedBegin.operation !== "begin") throw new Error("deleted");
  put(deleted, deletedBegin.stagingPath, "1", PNG);
  deleted.onHashed = async () => {
    deleted.deletionStatus = "completed";
  };
  assertFail(await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: deletedBegin.attemptId }, deleted), "denied");
  assert.equal(deleted.objects.has(LETTER), false);

  const cutoff = memoryPorts();
  const cutoffBegin = await performOwnerObjectTransfer({ uid: UID, operation: "begin", path: LETTER, contentType: "image/png" }, cutoff);
  if (!cutoffBegin.ok || cutoffBegin.operation !== "begin") throw new Error("cutoff");
  put(cutoff, cutoffBegin.stagingPath, "1", PNG);
  cutoff.onHashed = async () => {
    cutoff.admittedSession = false;
  };
  assertFail(await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: cutoffBegin.attemptId }, cutoff), "denied");
  assert.equal(cutoff.objects.has(LETTER), false);

  const restore = memoryPorts();
  const restoreBegin = await performOwnerObjectTransfer({ uid: UID, operation: "begin", path: LETTER, contentType: "image/png" }, restore);
  if (!restoreBegin.ok || restoreBegin.operation !== "begin") throw new Error("restore");
  put(restore, restoreBegin.stagingPath, "1", PNG);
  restore.onHashed = async () => {
    restore.admittedRestore = false;
  };
  assertFail(await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: restoreBegin.attemptId }, restore), "denied");
  assert.equal(restore.objects.has(LETTER), false);

  const grin = memoryPorts();
  grin.evidenceState = "verified";
  assertFail(await performOwnerObjectTransfer({ uid: UID, operation: "begin", path: GRIN, contentType: "image/png", grin: SCOPE }, grin), "denied");
  grin.evidenceState = "reserved";
  grin.newCommands = "deny";
  assertFail(await performOwnerObjectTransfer({ uid: UID, operation: "begin", path: GRIN, contentType: "image/png", grin: SCOPE }, grin), "denied");
  grin.newCommands = "allow";
  grin.userStatus = "pending_deletion";
  assertFail(await performOwnerObjectTransfer({ uid: UID, operation: "begin", path: GRIN, contentType: "image/png", grin: SCOPE }, grin), "denied");
  grin.userStatus = "active";
  grin.objectKeyBound = false;
  assertFail(await performOwnerObjectTransfer({ uid: UID, operation: "begin", path: GRIN, contentType: "image/png", grin: SCOPE }, grin), "denied");
  grin.objectKeyBound = true;
  const grinBegin = await performOwnerObjectTransfer({ uid: UID, operation: "begin", path: GRIN, contentType: "image/png", grin: SCOPE }, grin);
  assert.equal(grinBegin.ok, true);
  if (!grinBegin.ok || grinBegin.operation !== "begin") throw new Error("grin begin");
  put(grin, grinBegin.stagingPath, "1", PNG);
  grin.onHashed = async () => {
    grin.evidenceState = "rejected";
  };
  assertFail(await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: grinBegin.attemptId }, grin), "denied");
  assert.equal(grin.signReads.length, 0);
  assertFail(await performOwnerObjectTransfer({ uid: UID, operation: "read", path: GRIN }, grin), "denied");
  assertFail(await performOwnerObjectTransfer({ uid: UID, operation: "delete", path: GRIN }, grin), "denied");
  assert.equal(grin.signReads.length, 0);
  assert.equal(grin.removed.some((item) => item.path === GRIN), false);

  const legacy = memoryPorts();
  legacy.accountStatus = "pending_deletion";
  put(legacy, LETTER, "8", PNG);
  const readable = await performOwnerObjectTransfer({ uid: UID, operation: "read", path: LETTER }, legacy);
  assert.equal(readable.ok, true);
  if (!readable.ok || readable.operation !== "read") throw new Error("read");
  assert.equal(readable.generation, "8");
  assert.equal(typeof readable.expiresAt, "number");
  assert.equal(legacy.signReads[0], `${LETTER}#8`);

  const foreign = memoryPorts();
  const foreignBegin = await performOwnerObjectTransfer({ uid: UID, operation: "begin", path: LETTER, contentType: "image/png" }, foreign);
  if (!foreignBegin.ok || foreignBegin.operation !== "begin") throw new Error("foreign");
  assertFail(await performOwnerObjectTransfer({ uid: OTHER, operation: "abort", attemptId: foreignBegin.attemptId }, foreign), "denied");
  assert.equal(foreign.attempts.get(foreignBegin.attemptId)?.status, "open");

  console.log("ownerObjectTransfer.test.ts: ok");
}

void main();
