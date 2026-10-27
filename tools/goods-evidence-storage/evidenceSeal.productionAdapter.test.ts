/**
 * Production Storage orchestration for GRIN seals.
 * The bucket is a controlled double. It is not the in-memory byte helper.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { Readable, Writable } from "node:stream";

import { createComposedGrinCallables } from "../../functions/src/goodsEvidence/composed";
import { GoodsEvidenceStorageAdapter } from "../../functions/src/goodsEvidence/g2/adapter";
import { evidenceLinkPath, evidenceObjectPath, storageAccountingPath } from "../../functions/src/goodsEvidence/g2/paths";
import { wrapAdminBlobStore } from "../../functions/src/goodsEvidence/productionCompose";
import { FAKE_createInjectedFirestore, FAKE_seedOwner } from "./FAKE_injectedFirestore";
import { testClock } from "./testSupport";

const OWNER = "owner_g2";
const LEDGER = "ledger_g2";
const RECEIPT = "receipt_g2";
const PATH = `users/${OWNER}/grinEvidence/original`;

type Stored = {
  generation: string;
  bytes: Buffer;
  contentType: string;
  metadata: Record<string, string>;
};

type DeleteCall = { path: string; generation: string | null };

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function pdf(fill: number, length = 64): Buffer {
  const bytes = Buffer.alloc(length);
  bytes[0] = 0x25;
  bytes[1] = 0x50;
  bytes[2] = 0x44;
  bytes[3] = 0x46;
  bytes.fill(fill, 4);
  return bytes;
}

function contentKey(): string {
  return randomBytes(32).toString("base64");
}

class ControlledBucket {
  objects = new Map<string, Stored>();
  deletes: DeleteCall[] = [];
  copies: { from: string; to: string; ifGenerationMatch: string | null }[] = [];
  private next = 1;
  holdSealFinish = false;
  private held: Array<() => void> = [];
  readMode: "full" | "error" | "short" = "full";
  writeMode: "ok" | "error" | "close" | "ended" = "ok";

  put(path: string, bytes: Buffer, metadata: Record<string, string>, contentType = "application/pdf"): string {
    const generation = String(this.next++);
    this.objects.set(path, { generation, bytes: Buffer.from(bytes), contentType, metadata: { ...metadata } });
    return generation;
  }

  file(path: string, options?: { generation?: string | number }) {
    const bound = options?.generation == null ? null : String(options.generation);
    const bucket = this;
    return {
      path,
      async exists() {
        return [bucket.objects.has(path)];
      },
      async getMetadata() {
        const stored = bucket.require(path, bound);
        return [{
          generation: stored.generation,
          size: stored.bytes.length,
          contentType: stored.contentType,
          metadata: stored.metadata,
        }];
      },
      createReadStream() {
        const stored = bucket.require(path, bound);
        if (bucket.readMode === "error") {
          const stream = new Readable({ read() {} });
          queueMicrotask(() => stream.destroy(new Error("read_failed")));
          return stream;
        }
        const bytes = bucket.readMode === "short" ? stored.bytes.subarray(0, 4) : stored.bytes;
        return Readable.from([bytes]);
      },
      createWriteStream(options?: { preconditionOpts?: { ifGenerationMatch?: string | number } }) {
        const match = options?.preconditionOpts?.ifGenerationMatch;
        if (match === 0 && bucket.objects.has(path)) {
          const stream = new Writable({
            write(_chunk, _enc, callback) {
              callback(new Error("precondition"));
            },
          });
          return stream;
        }
        const chunks: Buffer[] = [];
        if (bucket.writeMode === "ended") {
          const stream = new Writable({
            highWaterMark: 1,
            write(chunk, _encoding, callback) {
              chunks.push(Buffer.from(chunk));
              callback();
              queueMicrotask(() => {
                stream.emit("finish");
                stream.emit("close");
              });
            },
            final(callback) {
              const generation = String(bucket.next++);
              bucket.objects.set(path, {
                generation,
                bytes: Buffer.concat(chunks),
                contentType: "application/octet-stream",
                metadata: {},
              });
              callback();
            },
          });
          const emit = stream.emit.bind(stream);
          stream.emit = ((event: string | symbol, ...args: unknown[]) => {
            if (event === "drain") return true;
            return emit(event, ...args);
          }) as typeof stream.emit;
          return stream;
        }
        return new Writable({
          highWaterMark: 1,
          write(chunk, _encoding, callback) {
            chunks.push(Buffer.from(chunk));
            if (bucket.writeMode === "error") {
              queueMicrotask(() => this.destroy(new Error("drain_failed")));
              return;
            }
            if (bucket.writeMode === "close") {
              queueMicrotask(() => this.destroy());
              return;
            }
            callback();
          },
          final(callback) {
            const publish = () => {
              const generation = String(bucket.next++);
              bucket.objects.set(path, {
                generation,
                bytes: Buffer.concat(chunks),
                contentType: "application/octet-stream",
                metadata: {},
              });
              callback();
            };
            if (bucket.holdSealFinish && path.includes(".vyd-seal.")) {
              bucket.held.push(publish);
              if (bucket.held.length >= 2) {
                const queued = bucket.held.splice(0);
                for (const finish of queued) finish();
              }
              return;
            }
            publish();
          },
        });
      },
      async setMetadata(input: { metadata?: Record<string, string> }) {
        const stored = bucket.require(path, bound);
        stored.metadata = { ...stored.metadata, ...(input.metadata ?? {}) };
      },
      async copy(destination: { path: string }, options?: { preconditionOpts?: { ifGenerationMatch?: string | number } }) {
        const source = bucket.require(path, bound);
        const match = options?.preconditionOpts?.ifGenerationMatch;
        const current = bucket.objects.get(destination.path);
        if (current && match != null && current.generation !== String(match)) {
          throw new Error("generation_conflict");
        }
        bucket.copies.push({
          from: path,
          to: destination.path,
          ifGenerationMatch: match == null ? null : String(match),
        });
        bucket.objects.set(destination.path, {
          generation: String(bucket.next++),
          bytes: Buffer.from(source.bytes),
          contentType: source.contentType,
          metadata: { ...source.metadata },
        });
      },
      async delete(options?: { ignoreNotFound?: boolean }) {
        bucket.deletes.push({ path, generation: bound });
        const stored = bucket.objects.get(path);
        if (!stored) return;
        if (bound != null && stored.generation !== bound) return;
        bucket.objects.delete(path);
      },
    };
  }

  private require(path: string, bound: string | null): Stored {
    const stored = this.objects.get(path);
    if (!stored || (bound != null && stored.generation !== bound)) {
      throw new Error("generation_conflict");
    }
    return stored;
  }
}

async function settled<T>(work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("unresolved_stream")), 1000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function plaintext(chunks: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const chunk of chunks) parts.push(Buffer.from(chunk));
  return Buffer.concat(parts);
}

function recordState(db: ReturnType<typeof FAKE_createInjectedFirestore>, evidenceId: string): Record<string, unknown> {
  const raw = db.snapshot.get(evidenceObjectPath(OWNER, LEDGER, evidenceId));
  if (!raw) throw new Error("missing evidence");
  return JSON.parse(raw) as Record<string, unknown>;
}

async function main(): Promise<void> {
  const env = { CONTENT_DATA_KEY: contentKey() };
  const image = pdf(0x41);

  {
    const bucket = new ControlledBucket();
    bucket.holdSealFinish = true;
    const generation = bucket.put(PATH, image, { vydEvidence: "pending" });
    const blobs = wrapAdminBlobStore(bucket as never, env);
    const [first, second] = await Promise.allSettled([
      settled(blobs.open(PATH, generation)),
      settled(blobs.open(PATH, generation)),
    ]);
    const fulfilled = [first, second].filter((item) => item.status === "fulfilled");
    const rejected = [first, second].filter((item) => item.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    const stored = bucket.objects.get(PATH);
    assert.ok(stored);
    assert.notEqual(stored.generation, generation);
    assert.equal(stored.bytes.subarray(0, 4).toString("utf8"), "VYD1");
    assert.equal(stored.bytes.equals(image), false);
    const tempDeletes = bucket.deletes.filter((item) => item.path.includes(".vyd-seal."));
    assert.equal(tempDeletes.length, 2);
    assert.equal(new Set(tempDeletes.map((item) => item.path)).size, 2);
    assert.equal(bucket.deletes.some((item) => item.path === PATH), false);
    assert.equal(bucket.copies.length, 1);
  }

  {
    const bucket = new ControlledBucket();
    const generation = bucket.put(PATH, image, { vydEvidence: "pending" });
    bucket.writeMode = "error";
    const blobs = wrapAdminBlobStore(bucket as never, env);
    await assert.rejects(settled(blobs.open(PATH, generation)), /drain_failed|write_closed/);
    const stored = bucket.objects.get(PATH);
    assert.equal(stored?.generation, generation);
    assert.equal(stored?.bytes.equals(image), true);
    assert.equal(bucket.copies.length, 0);
    assert.equal(bucket.deletes.some((item) => item.path === PATH), false);
  }

  {
    const bucket = new ControlledBucket();
    const generation = bucket.put(PATH, image, { vydEvidence: "pending" });
    bucket.writeMode = "close";
    const blobs = wrapAdminBlobStore(bucket as never, env);
    await assert.rejects(settled(blobs.open(PATH, generation)), /write_closed|drain_failed/);
    assert.equal(bucket.objects.get(PATH)?.bytes.equals(image), true);
    assert.equal(bucket.copies.length, 0);
  }

  {
    const bucket = new ControlledBucket();
    const generation = bucket.put(PATH, image, { vydEvidence: "pending" });
    bucket.readMode = "short";
    const blobs = wrapAdminBlobStore(bucket as never, env);
    await assert.rejects(settled(blobs.open(PATH, generation)), /content_tampered/);
    assert.equal(bucket.objects.get(PATH)?.generation, generation);
    assert.equal(bucket.objects.get(PATH)?.bytes.equals(image), true);
    assert.equal(bucket.copies.length, 0);
  }

  {
    const bucket = new ControlledBucket();
    const generation = bucket.put(PATH, image, { vydEvidence: "pending" });
    bucket.readMode = "error";
    const blobs = wrapAdminBlobStore(bucket as never, env);
    await assert.rejects(settled(blobs.open(PATH, generation)), /read_failed/);
    assert.equal(bucket.objects.get(PATH)?.bytes.equals(image), true);
    assert.equal(bucket.copies.length, 0);
  }

  {
    const bucket = new ControlledBucket();
    const generation = bucket.put(PATH, image, { vydEvidence: "pending" });
    const blobs = wrapAdminBlobStore(bucket as never, {});
    await assert.rejects(settled(blobs.open(PATH, generation)), /content_key_unavailable/);
    assert.equal(bucket.objects.get(PATH)?.bytes.equals(image), true);
    const malformed = wrapAdminBlobStore(bucket as never, { CONTENT_DATA_KEY: "%%%" });
    await assert.rejects(settled(malformed.open(PATH, generation)), /content_key_unavailable/);
    assert.equal(bucket.copies.length, 0);
  }

  {
    const bucket = new ControlledBucket();
    const generation = bucket.put(PATH, image, {});
    const blobs = wrapAdminBlobStore(bucket as never, env);
    const opened = await blobs.open(PATH, generation);
    assert.ok(opened);
    assert.equal(opened.generation, generation);
    assert.equal((await plaintext(opened.chunks)).equals(image), true);
    assert.equal(bucket.objects.get(PATH)?.generation, generation);
    assert.equal(bucket.copies.length, 0);
  }

  {
    const bucket = new ControlledBucket();
    const generation = bucket.put(PATH, image, { vydEvidence: "pending" });
    const blobs = wrapAdminBlobStore(bucket as never, env);
    const sealed = await blobs.open(PATH, generation);
    assert.ok(sealed);
    const stored = bucket.objects.get(PATH);
    assert.ok(stored);
    const intact = Buffer.from(stored.bytes);
    stored.bytes[stored.bytes.length - 1] ^= 0xff;
    const tampered = await blobs.open(PATH, generation);
    assert.equal(tampered, null);
    const foreign = `users/owner-b/grinEvidence/original`;
    const foreignGeneration = bucket.put(foreign, intact, { vydEvidence: "sealed" });
    const wrongOwner = await blobs.open(foreign, generation);
    assert.equal(wrongOwner, null);
    assert.notEqual(foreignGeneration, generation);
  }

  {
    const db = FAKE_createInjectedFirestore();
    FAKE_seedOwner(db, OWNER, LEDGER, RECEIPT);
    const bucket = new ControlledBucket();
    const blobs = wrapAdminBlobStore(bucket as never, env);
    const adapter = new GoodsEvidenceStorageAdapter(db, blobs, testClock());
    const reserved = await adapter.reserve({ uid: OWNER }, {
      evidenceId: "ev_interrupt",
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: sha256(image),
      claimedByteSize: image.length,
    });
    assert.equal(reserved.ok, true);
    if (!reserved.ok) throw new Error("reserve");
    await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_interrupt", ledgerId: LEDGER });
    const uploadedGeneration = bucket.put(reserved.storagePath, image, { vydEvidence: "pending" });
    const completed = await adapter.completeUpload({ uid: OWNER }, { evidenceId: "ev_interrupt", ledgerId: LEDGER });
    assert.equal(completed.ok, true);
    if (!completed.ok) throw new Error("complete");
    assert.equal(completed.generation, uploadedGeneration);
    const sealed = await blobs.open(reserved.storagePath, uploadedGeneration);
    assert.ok(sealed);
    assert.notEqual(sealed.generation, uploadedGeneration);
    assert.equal(recordState(db, "ev_interrupt").state, "uploaded_unverified");
    const verified = await adapter.verify({ uid: OWNER }, { evidenceId: "ev_interrupt", ledgerId: LEDGER });
    assert.equal(verified.ok, true);
    if (!verified.ok) throw new Error("verify");
    assert.equal(verified.state, "verified");
    assert.equal(verified.generation, sealed.generation);
    assert.equal(verified.actualSha256, sha256(image));
    const again = await adapter.verify({ uid: OWNER }, { evidenceId: "ev_interrupt", ledgerId: LEDGER });
    assert.equal(again.ok, true);
    if (!again.ok) throw new Error("replay");
    assert.equal(again.state, "verified");
    assert.equal(again.replayed, true);
    const opened = await blobs.open(reserved.storagePath, verified.generation);
    assert.ok(opened);
    assert.equal((await plaintext(opened.chunks)).equals(image), true);
  }

  {
    const db = FAKE_createInjectedFirestore();
    FAKE_seedOwner(db, OWNER, LEDGER, RECEIPT);
    const bucket = new ControlledBucket();
    const blobs = wrapAdminBlobStore(bucket as never, env);
    const adapter = new GoodsEvidenceStorageAdapter(db, blobs, testClock());
    const reserved = await adapter.reserve({ uid: OWNER }, {
      evidenceId: "ev_replaced",
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: sha256(image),
      claimedByteSize: image.length,
    });
    assert.equal(reserved.ok, true);
    if (!reserved.ok) throw new Error("reserve");
    await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_replaced", ledgerId: LEDGER });
    bucket.put(reserved.storagePath, image, { vydEvidence: "pending" });
    const completed = await adapter.completeUpload({ uid: OWNER }, { evidenceId: "ev_replaced", ledgerId: LEDGER });
    assert.equal(completed.ok, true);
    bucket.put(reserved.storagePath, pdf(0x42), {});
    const replaced = await adapter.verify({ uid: OWNER }, { evidenceId: "ev_replaced", ledgerId: LEDGER });
    assert.equal(replaced.ok, false);
    if (replaced.ok) throw new Error("expected integrity deny");
    assert.equal(replaced.code, "integrity");
    assert.equal(recordState(db, "ev_replaced").state, "uploaded_unverified");
  }

  {
    const bucket = new ControlledBucket();
    const generation = bucket.put(PATH, image, { vydEvidence: "pending" });
    bucket.writeMode = "ended";
    const blobs = wrapAdminBlobStore(bucket as never, env);
    const opened = await settled(blobs.open(PATH, generation));
    assert.ok(opened);
    const stored = bucket.objects.get(PATH);
    assert.ok(stored);
    assert.equal(stored.bytes.subarray(0, 4).toString("utf8"), "VYD1");
    assert.equal((await plaintext(opened.chunks)).equals(image), true);
    assert.equal(bucket.copies.length, 1);
  }

  {
    const db = FAKE_createInjectedFirestore();
    FAKE_seedOwner(db, OWNER, LEDGER, RECEIPT);
    const bucket = new ControlledBucket();
    const blobs = wrapAdminBlobStore(bucket as never, env);
    const adapter = new GoodsEvidenceStorageAdapter(db, blobs, testClock());
    const reserved = await adapter.reserve({ uid: OWNER }, {
      evidenceId: "ev_orphan_pending",
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: sha256(image),
      claimedByteSize: image.length,
    });
    assert.equal(reserved.ok, true);
    if (!reserved.ok) throw new Error("reserve");
    await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_orphan_pending", ledgerId: LEDGER });
    bucket.put(reserved.storagePath, image, { vydEvidence: "pending" });
    const completed = await adapter.completeUpload({ uid: OWNER }, { evidenceId: "ev_orphan_pending", ledgerId: LEDGER });
    assert.equal(completed.ok, true);
    await bucket.file(reserved.storagePath).delete();
    const orphaned = await adapter.recoverOrphan({ uid: OWNER }, { evidenceId: "ev_orphan_pending", ledgerId: LEDGER });
    assert.equal(orphaned.ok, true);
    if (!orphaned.ok) throw new Error("orphan");
    assert.equal(orphaned.state, "orphan_pending_review");
    const replacement = pdf(0x43);
    bucket.put(reserved.storagePath, replacement, { vydEvidence: "pending" });
    const recovered = await adapter.recoverOrphan({ uid: OWNER }, { evidenceId: "ev_orphan_pending", ledgerId: LEDGER });
    assert.equal(recovered.ok, false);
    if (recovered.ok) throw new Error("expected integrity deny");
    assert.equal(recovered.code, "integrity");
    assert.equal(recordState(db, "ev_orphan_pending").state, "orphan_pending_review");
    const stored = bucket.objects.get(reserved.storagePath);
    assert.ok(stored);
    assert.equal(stored.bytes.equals(replacement), true);
    assert.equal(stored.metadata.vydEvidence, "pending");
    assert.equal(bucket.copies.length, 0);
  }

  {
    const db = FAKE_createInjectedFirestore();
    FAKE_seedOwner(db, OWNER, LEDGER, RECEIPT);
    const bucket = new ControlledBucket();
    const blobs = wrapAdminBlobStore(bucket as never, env);
    const adapter = new GoodsEvidenceStorageAdapter(db, blobs, testClock());
    const reserved = await adapter.reserve({ uid: OWNER }, {
      evidenceId: "ev_orphan_plain",
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: sha256(image),
      claimedByteSize: image.length,
    });
    assert.equal(reserved.ok, true);
    if (!reserved.ok) throw new Error("reserve");
    await adapter.beginUpload({ uid: OWNER }, { evidenceId: "ev_orphan_plain", ledgerId: LEDGER });
    bucket.put(reserved.storagePath, image, { vydEvidence: "pending" });
    const completed = await adapter.completeUpload({ uid: OWNER }, { evidenceId: "ev_orphan_plain", ledgerId: LEDGER });
    assert.equal(completed.ok, true);
    await bucket.file(reserved.storagePath).delete();
    const orphaned = await adapter.recoverOrphan({ uid: OWNER }, { evidenceId: "ev_orphan_plain", ledgerId: LEDGER });
    assert.equal(orphaned.ok, true);
    if (!orphaned.ok) throw new Error("orphan");
    const restoredGeneration = bucket.put(reserved.storagePath, image, {});
    const recovered = await adapter.recoverOrphan({ uid: OWNER }, { evidenceId: "ev_orphan_plain", ledgerId: LEDGER });
    assert.equal(recovered.ok, true);
    if (!recovered.ok) throw new Error("restore");
    assert.equal(recovered.state, "verified");
    assert.equal(recovered.generation, restoredGeneration);
    assert.equal(recovered.actualSha256, sha256(image));
    const stored = bucket.objects.get(reserved.storagePath);
    assert.equal(stored?.bytes.equals(image), true);
    assert.equal(stored?.bytes.subarray(0, 4).toString("utf8") === "VYD1", false);
    assert.equal(bucket.copies.length, 0);
  }

  {
    const db = FAKE_createInjectedFirestore();
    FAKE_seedOwner(db, OWNER, LEDGER, RECEIPT);
    const bucket = new ControlledBucket();
    const blobs = wrapAdminBlobStore(bucket as never, env);
    const adapter = new GoodsEvidenceStorageAdapter(db, blobs, testClock());
    const composed = createComposedGrinCallables({
      evidence: adapter,
      env: { GRIN_GOODS_EVIDENCE_FUNCTIONS: "true" },
    });
    const evidenceId = "ev_callable_retry";
    const reserved = await composed.reserveEvidence({
      auth: { uid: OWNER },
      data: {
        evidenceId,
        ledgerId: LEDGER,
        receiptId: RECEIPT,
        category: "invoice",
        mime: "application/pdf",
        claimedSha256: sha256(image),
        claimedByteSize: image.length,
      },
    });
    assert.equal(reserved.ok, true);
    if (!reserved.ok) throw new Error("reserve");
    const began = await composed.beginEvidenceUpload({
      auth: { uid: OWNER },
      data: { evidenceId, ledgerId: LEDGER, receiptId: RECEIPT },
    });
    assert.equal(began.ok, true);
    const uploadedGeneration = bucket.put(reserved.storagePath, image, { vydEvidence: "pending" });
    const completed = await adapter.completeUpload(
      { uid: OWNER },
      { evidenceId, ledgerId: LEDGER, receiptId: RECEIPT }
    );
    assert.equal(completed.ok, true);
    if (!completed.ok) throw new Error("complete");
    assert.equal(completed.state, "uploaded_unverified");
    assert.equal(completed.generation, uploadedGeneration);
    const sealed = await blobs.open(reserved.storagePath, uploadedGeneration);
    assert.ok(sealed);
    assert.notEqual(sealed.generation, uploadedGeneration);
    assert.equal(recordState(db, evidenceId).state, "uploaded_unverified");
    const stranger = await composed.uploadEvidence({
      auth: { uid: "owner-b" },
      data: { evidenceId, ledgerId: LEDGER, receiptId: RECEIPT },
    });
    assert.equal(stranger.ok, false);
    assert.equal(stranger.originalDurable, false);
    assert.equal(recordState(db, evidenceId).state, "uploaded_unverified");
    const retried = await composed.uploadEvidence({
      auth: { uid: OWNER },
      data: { evidenceId, ledgerId: LEDGER, receiptId: RECEIPT },
    });
    assert.equal(retried.ok, true);
    assert.equal(retried.originalDurable, true);
    assert.equal(retried.evidenceId, evidenceId);
    assert.equal(retried.actualSha256, sha256(image));
    assert.equal(retried.generation, sealed.generation);
    assert.equal(retried.sizeBytes, image.length);
    assert.equal(recordState(db, evidenceId).state, "linked");
    const linkPath = evidenceLinkPath(OWNER, LEDGER, RECEIPT, evidenceId);
    const accountingPath = storageAccountingPath(OWNER);
    const linkBefore = db.snapshot.get(linkPath);
    const accountingBefore = db.snapshot.get(accountingPath);
    const objectBefore = db.snapshot.get(evidenceObjectPath(OWNER, LEDGER, evidenceId));
    assert.ok(linkBefore);
    const lost = await composed.uploadEvidence({
      auth: { uid: OWNER },
      data: { evidenceId, ledgerId: LEDGER, receiptId: RECEIPT },
    });
    assert.equal(lost.ok, true);
    assert.equal(lost.originalDurable, true);
    assert.equal(lost.evidenceId, evidenceId);
    assert.equal(lost.generation, retried.generation);
    assert.equal(lost.actualSha256, retried.actualSha256);
    assert.equal(lost.reservationId, retried.reservationId);
    assert.equal(db.snapshot.get(linkPath), linkBefore);
    assert.equal(db.snapshot.get(accountingPath), accountingBefore);
    assert.equal(db.snapshot.get(evidenceObjectPath(OWNER, LEDGER, evidenceId)), objectBefore);
    const opened = await blobs.open(reserved.storagePath, sealed.generation);
    assert.ok(opened);
    assert.equal((await plaintext(opened.chunks)).equals(image), true);
    const replacement = pdf(0x44);
    bucket.put(reserved.storagePath, replacement, {});
    const retrieved = await adapter.retrieveOriginal(
      { uid: OWNER },
      { evidenceId, ledgerId: LEDGER, receiptId: RECEIPT }
    );
    assert.equal(retrieved.ok, false);
    const downloaded = await adapter.downloadOriginal(
      { uid: OWNER },
      { evidenceId, ledgerId: LEDGER, receiptId: RECEIPT }
    );
    assert.equal(downloaded.ok, false);
    const afterReplace = await composed.uploadEvidence({
      auth: { uid: OWNER },
      data: { evidenceId, ledgerId: LEDGER, receiptId: RECEIPT },
    });
    assert.equal(afterReplace.ok, false);
    assert.equal(afterReplace.originalDurable, false);
    assert.equal(recordState(db, evidenceId).state, "linked");
    assert.equal(bucket.objects.get(reserved.storagePath)?.bytes.equals(replacement), true);
  }

  {
    const db = FAKE_createInjectedFirestore();
    FAKE_seedOwner(db, OWNER, LEDGER, RECEIPT);
    const bucket = new ControlledBucket();
    const blobs = wrapAdminBlobStore(bucket as never, env);
    const adapter = new GoodsEvidenceStorageAdapter(db, blobs, testClock());
    const composed = createComposedGrinCallables({
      evidence: adapter,
      env: { GRIN_GOODS_EVIDENCE_FUNCTIONS: "true" },
    });
    const evidenceId = "ev_callable_unrelated";
    const reserved = await adapter.reserve({ uid: OWNER }, {
      evidenceId,
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: sha256(image),
      claimedByteSize: image.length,
    });
    assert.equal(reserved.ok, true);
    if (!reserved.ok) throw new Error("reserve");
    await adapter.beginUpload({ uid: OWNER }, { evidenceId, ledgerId: LEDGER });
    bucket.put(reserved.storagePath, image, { vydEvidence: "pending" });
    const completed = await adapter.completeUpload({ uid: OWNER }, { evidenceId, ledgerId: LEDGER });
    assert.equal(completed.ok, true);
    const unrelated = pdf(0x45);
    bucket.put(reserved.storagePath, unrelated, { vydEvidence: "pending" });
    const retried = await composed.uploadEvidence({
      auth: { uid: OWNER },
      data: { evidenceId, ledgerId: LEDGER, receiptId: RECEIPT },
    });
    assert.equal(retried.ok, false);
    assert.equal(retried.originalDurable, false);
    assert.equal(recordState(db, evidenceId).state, "uploaded_unverified");
    assert.equal(bucket.objects.get(reserved.storagePath)?.bytes.equals(unrelated), true);
    assert.equal(bucket.copies.length, 0);
  }

  {
    const db = FAKE_createInjectedFirestore();
    FAKE_seedOwner(db, OWNER, LEDGER, RECEIPT);
    const bucket = new ControlledBucket();
    const blobs = wrapAdminBlobStore(bucket as never, env);
    const adapter = new GoodsEvidenceStorageAdapter(db, blobs, testClock());
    const composed = createComposedGrinCallables({
      evidence: adapter,
      env: { GRIN_GOODS_EVIDENCE_FUNCTIONS: "true" },
    });
    const evidenceId = "ev_callable_tamper";
    const reserved = await adapter.reserve({ uid: OWNER }, {
      evidenceId,
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: sha256(image),
      claimedByteSize: image.length,
    });
    assert.equal(reserved.ok, true);
    if (!reserved.ok) throw new Error("reserve");
    await adapter.beginUpload({ uid: OWNER }, { evidenceId, ledgerId: LEDGER });
    const uploadedGeneration = bucket.put(reserved.storagePath, image, { vydEvidence: "pending" });
    await adapter.completeUpload({ uid: OWNER }, { evidenceId, ledgerId: LEDGER });
    const sealed = await blobs.open(reserved.storagePath, uploadedGeneration);
    assert.ok(sealed);
    const stored = bucket.objects.get(reserved.storagePath);
    assert.ok(stored);
    stored.bytes[stored.bytes.length - 1] ^= 0xff;
    const retried = await composed.uploadEvidence({
      auth: { uid: OWNER },
      data: { evidenceId, ledgerId: LEDGER, receiptId: RECEIPT },
    });
    assert.equal(retried.ok, false);
    assert.equal(retried.originalDurable, false);
    assert.equal(recordState(db, evidenceId).state, "uploaded_unverified");
  }

  {
    const db = FAKE_createInjectedFirestore();
    FAKE_seedOwner(db, OWNER, LEDGER, RECEIPT);
    const bucket = new ControlledBucket();
    const blobs = wrapAdminBlobStore(bucket as never, {});
    const adapter = new GoodsEvidenceStorageAdapter(db, blobs, testClock());
    const composed = createComposedGrinCallables({
      evidence: adapter,
      env: { GRIN_GOODS_EVIDENCE_FUNCTIONS: "true" },
    });
    const evidenceId = "ev_callable_nokey";
    const reserved = await adapter.reserve({ uid: OWNER }, {
      evidenceId,
      ledgerId: LEDGER,
      receiptId: RECEIPT,
      category: "invoice",
      mime: "application/pdf",
      claimedSha256: sha256(image),
      claimedByteSize: image.length,
    });
    assert.equal(reserved.ok, true);
    if (!reserved.ok) throw new Error("reserve");
    await adapter.beginUpload({ uid: OWNER }, { evidenceId, ledgerId: LEDGER });
    bucket.put(reserved.storagePath, image, { vydEvidence: "pending" });
    await adapter.completeUpload({ uid: OWNER }, { evidenceId, ledgerId: LEDGER });
    await assert.rejects(
      composed.uploadEvidence({
        auth: { uid: OWNER },
        data: { evidenceId, ledgerId: LEDGER, receiptId: RECEIPT },
      }),
      /content_key_unavailable/
    );
    assert.equal(recordState(db, evidenceId).state, "uploaded_unverified");
    assert.equal(bucket.objects.get(reserved.storagePath)?.bytes.equals(image), true);
    assert.equal(bucket.copies.length, 0);
  }

  console.log("tools/goods-evidence-storage/evidenceSeal.productionAdapter.test.ts: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
