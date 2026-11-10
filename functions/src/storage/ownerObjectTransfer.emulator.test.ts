/**
 * Firestore-emulator proof that commit and abort share one transactional
 * outcome, and that the production storage adapter passes generation strings
 * and the create-only precondition through.
 *
 * Run:
 *   firebase emulators:exec --only firestore --project demo-vyaamikk-object-transfer \
 *     "npx --yes tsx functions/src/storage/ownerObjectTransfer.emulator.test.ts"
 */
import assert from "node:assert/strict";

import { getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

import { admissionPath, evidenceObjectPath, ledgerPath, objectKeyPath, receiptPath, userPath } from "../goodsEvidence/g2/paths";
import {
  createOwnerObjectPorts,
  handleOwnerObjectTransfer,
  loadGrinUploadAuthority,
  type ObjectBucket,
} from "./ownerObjectCallable";
import { performOwnerObjectTransfer, type TransferAttempt } from "./ownerObjectTransfer";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const UID = "object-owner-1";
const LETTER = `users/${UID}/letterhead/logo.png`;

type Gen = {
  path: string;
  generation: string;
  bytes: Uint8Array;
  contentType: string;
  metadata: Record<string, string>;
};

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fakeBucket(options: { holdHash: Promise<void> | null; holdCopy: Promise<void> | null }): {
  bucket: ObjectBucket;
  copies: Array<{ fromGeneration: string; ifGenerationMatch: string }>;
  put(path: string, generation: string, bytes: Uint8Array): void;
} {
  const files = new Map<string, Gen[]>();
  const copies: Array<{ fromGeneration: string; ifGenerationMatch: string }> = [];
  function generations(path: string): Gen[] {
    return files.get(path) ?? [];
  }
  function file(path: string, generation?: string) {
    const current = () => generations(path).find((item) => (generation ? item.generation === generation : true));
    return {
      name: path,
      metadata: generation
        ? { generation, size: String(current()?.bytes.byteLength ?? 0), contentType: current()?.contentType ?? "", metadata: current()?.metadata ?? {} }
        : undefined,
      async exists() {
        return [Boolean(current())] as [boolean];
      },
      async getMetadata() {
        const found = current();
        if (!found) throw Object.assign(new Error("missing"), { code: 404 });
        return [{ generation: found.generation, size: String(found.bytes.byteLength), contentType: found.contentType, metadata: found.metadata }] as [
          { generation: string; size: string; contentType: string; metadata: Record<string, string> },
        ];
      },
      async download() {
        const found = current();
        if (!found) throw Object.assign(new Error("missing"), { code: 404 });
        return [Buffer.from(found.bytes)] as [Buffer];
      },
      createReadStream() {
        const found = current();
        return (async function* () {
          if (options.holdHash) await options.holdHash;
          if (!found) return;
          yield Buffer.from(found.bytes);
        })();
      },
      async getSignedUrl() {
        return [`https://ticket.test/${path}?generation=${generation ?? ""}`] as [string];
      },
      async copy(
        _destination: unknown,
        copyOptions: {
          preconditionOpts?: { ifGenerationMatch?: string };
          contentType?: string;
          metadata?: Record<string, string>;
        }
      ) {
        const ifGenerationMatch = String(copyOptions.preconditionOpts?.ifGenerationMatch ?? "");
        copies.push({ fromGeneration: generation ?? "", ifGenerationMatch });
        if (options.holdCopy) await options.holdCopy;
        if (generations(path).length > 0 && generation == null) {
          throw Object.assign(new Error("precondition"), { code: 412 });
        }
        const source = generations(path).find((item) => item.generation === generation);
        if (!source) {
          return [file(path, generation), { done: false }] as [ReturnType<typeof file>, { done: false }];
        }
        const published = "9007199254740993";
        const destPath = (_destination as { name?: string }).name ?? LETTER;
        const next = generations(destPath);
        if (next.length > 0 && ifGenerationMatch === "0") {
          throw Object.assign(new Error("precondition"), { code: 412 });
        }
        const metadata = { ...(copyOptions.metadata ?? {}) };
        next.push({
          path: destPath,
          generation: published,
          bytes: source.bytes,
          contentType: copyOptions.contentType ?? "",
          metadata,
        });
        files.set(destPath, next);
        return [
          file(destPath, published),
          {
            kind: "storage#rewriteResponse",
            done: true,
            resource: {
              generation: published,
              size: String(source.bytes.byteLength),
              contentType: copyOptions.contentType ?? "",
              metadata,
            },
          },
        ] as [ReturnType<typeof file>, { done: true; resource: { generation: string } }];
      },
      async delete() {
        if (!generation) return;
        files.set(path, generations(path).filter((item) => item.generation !== generation));
      },
    };
  }
  return {
    copies,
    put(path, generation, bytes) {
      const listed = generations(path);
      listed.push({ path, generation, bytes, contentType: "application/octet-stream", metadata: {} });
      files.set(path, listed);
    },
    bucket: {
      file(path, fileOptions) {
        return file(path, fileOptions?.generation);
      },
      async getFiles(query) {
        const matched = [...files.entries()]
          .filter(([path]) => path.startsWith(query.prefix))
          .flatMap(([path, listed]) => listed.map((item) => file(path, item.generation)));
        return [matched] as [ReturnType<typeof file>[]];
      },
    },
  };
}

async function waitFor(db: FirebaseFirestore.Firestore, attemptId: string, status: TransferAttempt["status"]): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const snap = await db.collection("ownerObjectTransfers").doc(attemptId).get();
    if (snap.data()?.status === status) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`attempt did not reach ${status}`);
}

async function main(): Promise<void> {
  assert.ok(getApps().length > 0, "admin app");
  const db = getFirestore();
  await db.doc(userPath(UID)).set({ status: "active" });

  const hashGate = deferred();
  const aborting = fakeBucket({ holdHash: hashGate.promise, holdCopy: null });
  const abortPorts = createOwnerObjectPorts({
    db: db as never,
    bucket: aborting.bucket,
    admitSession: async () => true,
    admitRestore: async () => true,
  });
  const begun = await performOwnerObjectTransfer(
    { uid: UID, operation: "begin", path: LETTER, contentType: "image/png" },
    abortPorts
  );
  if (!begun.ok || begun.operation !== "begin") throw new Error("begin");
  aborting.put(begun.stagingPath, "1", PNG);
  const commit = performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: begun.attemptId }, abortPorts);
  await waitFor(db, begun.attemptId, "validating");
  const aborted = await performOwnerObjectTransfer({ uid: UID, operation: "abort", attemptId: begun.attemptId }, abortPorts);
  hashGate.resolve();
  const afterAbort = await commit;
  assert.equal(aborted.ok, true);
  assert.equal(afterAbort.ok, false);
  if (!afterAbort.ok) assert.equal(afterAbort.code, "conflict");
  assert.equal((await db.collection("ownerObjectTransfers").doc(begun.attemptId).get()).data()?.status, "aborted");

  const copyGate = deferred();
  const publishing = fakeBucket({ holdHash: null, holdCopy: copyGate.promise });
  const publishPorts = createOwnerObjectPorts({
    db: db as never,
    bucket: publishing.bucket,
    admitSession: async () => true,
    admitRestore: async () => true,
    newAttemptId: () => "b".repeat(32),
  });
  const second = await performOwnerObjectTransfer(
    { uid: UID, operation: "begin", path: LETTER, contentType: "image/png" },
    publishPorts
  );
  if (!second.ok || second.operation !== "begin") throw new Error("second");
  publishing.put(second.stagingPath, "1", PNG);
  const finishing = performOwnerObjectTransfer({ uid: UID, operation: "commit", attemptId: second.attemptId }, publishPorts);
  await waitFor(db, second.attemptId, "publishing");
  const lateAbort = await performOwnerObjectTransfer({ uid: UID, operation: "abort", attemptId: second.attemptId }, publishPorts);
  copyGate.resolve();
  const published = await finishing;
  assert.equal(lateAbort.ok, false);
  assert.equal(published.ok, true);
  if (published.ok && published.operation === "commit") assert.equal(published.generation, "9007199254740993");
  assert.equal((await db.collection("ownerObjectTransfers").doc(second.attemptId).get()).data()?.status, "committed");
  assert.equal(publishing.copies[0]?.fromGeneration, "1");
  assert.equal(publishing.copies[0]?.ifGenerationMatch, "0");

  const grinUid = "grin-owner-1";
  const scope = { ledgerId: "ledger1", receiptId: "receipt1", evidenceId: "evidence1" };
  const objectKey = "abcdEFGH1234_-ab";
  const grinPath = `users/${grinUid}/grinEvidence/${objectKey}/original`;
  await db.doc(userPath(grinUid)).set({ status: "active" });
  await db.doc(ledgerPath(grinUid, scope.ledgerId)).set({ ownerUid: grinUid, status: "active" });
  await db.doc(admissionPath(grinUid)).set({ schemaVersion: 1, newCommands: "allow", reconciliation: "deny" });
  await db.doc(receiptPath(grinUid, scope.ledgerId, scope.receiptId)).set({ ownerUid: grinUid });
  await db.doc(evidenceObjectPath(grinUid, scope.ledgerId, scope.evidenceId)).set({
    ownerUid: grinUid,
    ledgerId: scope.ledgerId,
    receiptId: scope.receiptId,
    evidenceId: scope.evidenceId,
    objectKey,
    storagePath: grinPath,
    state: "reserved",
  });
  await db.doc(objectKeyPath(grinUid, objectKey)).set({
    schemaVersion: 1,
    objectKey,
    evidenceId: scope.evidenceId,
    ledgerId: scope.ledgerId,
    receiptId: scope.receiptId,
    ownerUid: grinUid,
    state: "reserved",
  });
  assert.equal(await loadGrinUploadAuthority(db, grinUid, scope, grinPath, objectKey), true);
  await db.doc(admissionPath(grinUid)).set({ schemaVersion: 1, newCommands: "deny", reconciliation: "allow" });
  assert.equal(await loadGrinUploadAuthority(db, grinUid, scope, grinPath, objectKey), false);
  await db.doc(admissionPath(grinUid)).set({ schemaVersion: 1, newCommands: "allow", reconciliation: "deny" });
  await db.doc(evidenceObjectPath(grinUid, scope.ledgerId, scope.evidenceId)).update({ state: "rejected" });
  assert.equal(await loadGrinUploadAuthority(db, grinUid, scope, grinPath, objectKey), false);
  await db.doc(userPath(grinUid)).set({ status: "disabled" });
  assert.equal(await loadGrinUploadAuthority(db, grinUid, scope, grinPath, objectKey), false);
  await db.doc(objectKeyPath(grinUid, objectKey)).delete();
  assert.equal(await loadGrinUploadAuthority(db, grinUid, scope, grinPath, objectKey), false);

  await assert.rejects(
    () => handleOwnerObjectTransfer({ data: { operation: "read", path: LETTER }, rawRequest: { headers: {} } } as never),
    (error: unknown) => error instanceof HttpsError && error.code === "unauthenticated"
  );

  console.log("ownerObjectTransfer.emulator.test.ts: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
