import assert from "node:assert/strict";

import {
  classifyOwnedObjectPath,
  performOwnerObjectTransfer,
  sniffObjectBytes,
  type OwnerObjectPorts,
  type TransferAttempt,
} from "./ownerObjectTransfer";

const UID = "owner-a";
const OTHER = "owner-b";
const GRIN_KEY = "abcdEFGH1234_-ab";
const LETTER = `users/${UID}/letterhead/logo.png`;
const GRIN = `users/${UID}/grinEvidence/${GRIN_KEY}/original`;
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function memoryPorts(now = 1_000): OwnerObjectPorts & {
  attempts: Map<string, TransferAttempt>;
  objects: Map<string, { generation: string; size: number; contentType: string; prefix: Uint8Array }>;
  removed: string[];
  accountStatus: string;
  deletionStatus: string | null;
  grinState: string | null;
  copyMode: "ok" | "precondition" | "unknown";
} {
  const attempts = new Map<string, TransferAttempt>();
  const objects = new Map<string, { generation: string; size: number; contentType: string; prefix: Uint8Array }>();
  const removed: string[] = [];
  const ports = {
    attempts,
    objects,
    removed,
    accountStatus: "active",
    deletionStatus: null as string | null,
    grinState: "reserved" as string | null,
    copyMode: "ok" as "ok" | "precondition" | "unknown",
    now: () => now,
    newAttemptId: () => "a".repeat(32),
    async readAccount() {
      return { status: ports.accountStatus };
    },
    async readDeletion() {
      return ports.deletionStatus == null ? null : { status: ports.deletionStatus };
    },
    async readGrinKey(uid: string, objectKey: string) {
      if (ports.grinState == null) return null;
      return { ownerUid: uid, objectKey, state: ports.grinState };
    },
    async saveAttempt(attempt: TransferAttempt) {
      attempts.set(attempt.attemptId, { ...attempt });
    },
    async readAttempt(attemptId: string) {
      const found = attempts.get(attemptId);
      return found ? { ...found } : null;
    },
    async signUpload(path: string) {
      return `https://upload.test/${path}`;
    },
    async signRead(path: string) {
      return `https://read.test/${path}`;
    },
    async stat(path: string) {
      const found = objects.get(path);
      return found ? { generation: found.generation, size: found.size, contentType: found.contentType } : null;
    },
    async readPrefix(path: string) {
      return objects.get(path)?.prefix ?? new Uint8Array();
    },
    async copy(input: { from: string; to: string; contentType: string }) {
      if (ports.copyMode === "unknown") return { outcome: "unknown" as const };
      if (ports.copyMode === "precondition" || objects.has(input.to)) return { outcome: "precondition" as const };
      const source = objects.get(input.from);
      if (!source) return { outcome: "unknown" as const };
      objects.set(input.to, { ...source, generation: "44", contentType: input.contentType });
      return { outcome: "copied" as const, generation: "44", size: source.size };
    },
    async remove(path: string) {
      removed.push(path);
      objects.delete(path);
      return "removed" as const;
    },
  };
  return ports;
}

async function main(): Promise<void> {
  assert.equal(classifyOwnedObjectPath(UID, `users/${OTHER}/letterhead/logo.png`), null);
  assert.equal(classifyOwnedObjectPath(UID, `users/${UID}/../${OTHER}/letterhead/logo.png`), null);
  assert.equal(classifyOwnedObjectPath(UID, "company/invoices/secret.pdf"), null);
  assert.equal(sniffObjectBytes("pdfs", PNG), null);
  assert.equal(sniffObjectBytes("letterhead", PNG), "image/png");
  assert.equal(sniffObjectBytes("pdfs", Uint8Array.from(Buffer.from("%PDF-1.7"))), "application/pdf");

  const cross = await performOwnerObjectTransfer(
    { uid: UID, operation: "begin", path: LETTER, contentType: "image/png", payloadUid: OTHER },
    memoryPorts()
  );
  assert.equal(cross.ok, false);
  if (!cross.ok) assert.equal(cross.code, "denied");

  const inactive = memoryPorts();
  inactive.accountStatus = "pending_deletion";
  const inactiveBegin = await performOwnerObjectTransfer(
    { uid: UID, operation: "begin", path: LETTER, contentType: "image/png" },
    inactive
  );
  assert.equal(inactiveBegin.ok, false);

  const ports = memoryPorts();
  const begun = await performOwnerObjectTransfer(
    { uid: UID, operation: "begin", path: LETTER, contentType: "image/png" },
    ports
  );
  assert.equal(begun.ok, true);
  if (!begun.ok || begun.operation !== "begin") throw new Error("begin");
  assert.equal(begun.stagingPath, `users/${UID}/.objectTransfer/${"a".repeat(32)}`);
  ports.objects.set(begun.stagingPath, { generation: "1", size: PNG.length, contentType: "text/plain", prefix: PNG });
  const committed = await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: begun.attemptId }, ports);
  assert.equal(committed.ok, true);
  if (!committed.ok || committed.operation !== "commit") throw new Error("commit");
  assert.equal(committed.generation, "44");
  assert.equal(ports.objects.has(begun.stagingPath), false);
  assert.equal(ports.objects.get(LETTER)?.contentType, "image/png");
  assert.equal(ports.removed.includes(LETTER), false);

  const html = memoryPorts();
  const htmlBegin = await performOwnerObjectTransfer(
    { uid: UID, operation: "begin", path: LETTER, contentType: "image/png" },
    html
  );
  if (!htmlBegin.ok || htmlBegin.operation !== "begin") throw new Error("html begin");
  html.objects.set(htmlBegin.stagingPath, {
    generation: "1",
    size: 5,
    contentType: "image/png",
    prefix: Uint8Array.from(Buffer.from("<html")),
  });
  const typed = await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: htmlBegin.attemptId }, html);
  assert.equal(typed.ok, false);
  if (!typed.ok) assert.equal(typed.code, "type");
  assert.equal(html.objects.has(LETTER), false);

  const published = `users/${UID}/attachments/rec/photo.jpg`;
  const first = memoryPorts();
  const firstBegin = await performOwnerObjectTransfer(
    { uid: UID, operation: "begin", path: published, contentType: "image/jpeg" },
    first
  );
  if (!firstBegin.ok || firstBegin.operation !== "begin") throw new Error("first");
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
  first.objects.set(firstBegin.stagingPath, { generation: "1", size: jpeg.length, contentType: "image/jpeg", prefix: jpeg });
  await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: firstBegin.attemptId }, first);
  const secondId = "b".repeat(32);
  first.newAttemptId = () => secondId;
  const secondBegin = await performOwnerObjectTransfer(
    { uid: UID, operation: "begin", path: published, contentType: "image/jpeg" },
    first
  );
  if (!secondBegin.ok || secondBegin.operation !== "begin") throw new Error("second");
  const other = Uint8Array.from([0xff, 0xd8, 0xff, 0x00]);
  first.objects.set(secondBegin.stagingPath, { generation: "9", size: other.length, contentType: "image/jpeg", prefix: other });
  const conflict = await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: secondId }, first);
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.code, "conflict");
  assert.equal(first.objects.get(published)?.generation, "44");
  assert.equal(first.removed.includes(published), false);
  assert.equal(first.objects.has(secondBegin.stagingPath), false);

  const lost = memoryPorts();
  const lostBegin = await performOwnerObjectTransfer(
    { uid: UID, operation: "begin", path: LETTER, contentType: "image/png" },
    lost
  );
  if (!lostBegin.ok || lostBegin.operation !== "begin") throw new Error("lost");
  lost.objects.set(lostBegin.stagingPath, { generation: "1", size: PNG.length, contentType: "image/png", prefix: PNG });
  lost.copyMode = "unknown";
  const unknown = await performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: lostBegin.attemptId }, lost);
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.retryable, true);
  assert.equal(lost.objects.has(LETTER), false);
  assert.equal(lost.attempts.get(lostBegin.attemptId)?.status, "open");

  const grin = memoryPorts();
  grin.grinState = "verified";
  const grinDenied = await performOwnerObjectTransfer(
    { uid: UID, operation: "begin", path: GRIN, contentType: "image/png" },
    grin
  );
  assert.equal(grinDenied.ok, false);
  grin.grinState = "reserved";
  const grinBegin = await performOwnerObjectTransfer(
    { uid: UID, operation: "begin", path: GRIN, contentType: "image/png" },
    grin
  );
  assert.equal(grinBegin.ok, true);

  const foreign = memoryPorts();
  const foreignBegin = await performOwnerObjectTransfer(
    { uid: UID, operation: "begin", path: LETTER, contentType: "image/png" },
    foreign
  );
  if (!foreignBegin.ok || foreignBegin.operation !== "begin") throw new Error("foreign");
  const stolen = await performOwnerObjectTransfer({ uid: OTHER, operation: "abort", attemptId: foreignBegin.attemptId }, foreign);
  assert.equal(stolen.ok, false);
  assert.equal(foreign.attempts.get(foreignBegin.attemptId)?.status, "open");

  console.log("ownerObjectTransfer.test.ts: ok");
}

void main();
