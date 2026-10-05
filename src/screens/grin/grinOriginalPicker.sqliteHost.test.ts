/**
 * SQLITE_HOST / host-filesystem tests for grinOriginalPicker retention.
 *
 * NATIVE_DEVICE is not claimed. Injected OS picker + host fs. Production
 * expo-document-picker / camera are not launched.
 *
 * Covers: PDF import, image import, camera (injected bytes), cancel, denied
 * permission, missing/inaccurate picker size, oversize, changed bytes,
 * temporary source disappearance, sqlite reopen, account switch during await.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { HASH_CHUNK_BYTES, MAX_IMAGE_ORIGINAL_BYTES, MAX_PDF_ORIGINAL_BYTES } from "@/goodsEvidence/evidence";
import { sampleRegisterBody } from "@/goodsEvidence/testFixtures";
import { createFakeEvidenceUploadPort, createFakeGrinServerPort } from "@/services/grin/outbox/fakePorts";
import { openHostSqlite, SQLITE_HOST, type HostSqlite } from "@/services/grin/outbox/hostSqlite";
import type { GrinOutbox } from "@/services/grin/outbox/outbox";
import { APP_FILESYSTEM, SQLITE_HOST_NOT_NATIVE_DEVICE } from "@/services/grin/outbox/types";
import {
  GRIN_APPLICATION_LEDGER_ID,
  GRIN_BINDING_RETIRED,
  getGrinApplicationRepository,
  resetGrinApplicationRepositoryForTests,
  retireGrinOwnerSession,
  setGrinApplicationDbFactoryForTests,
  setGrinEvidencePortFactoryForTests,
  setGrinServerPortFactoryForTests,
  startGrinOwnerSession,
} from "@/services/grin/repository";
import { createUninjectedGrinEvidencePort, createUninjectedGrinServerPort } from "@/services/grin/repository/uninjectedServer";

import { installGrinScreenRuntime } from "./grinScreenHooks";
import {
  pickGrinOriginal,
  resetGrinOriginalPickerForTests,
  setGrinOriginalOsBridgeForTests,
} from "./grinOriginalPicker";
import {
  commitGrinOriginalRetention,
  discardUncommittedGrinOriginal,
  resetGrinOriginalRetentionForTests,
  setGrinOriginalHasherForTests,
  setGrinOriginalRetentionFsForTests,
  type GrinOriginalRetentionFs,
} from "./grinOriginalRetention";
import { lightColors } from "@/theme/palettes";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function createHostFs(rootDir: string): GrinOriginalRetentionFs {
  return {
    documentDirectory: rootDir,
    async ensureDir(dir: string) {
      fs.mkdirSync(dir, { recursive: true });
    },
    async copyFile(fromPath: string, toPath: string, maxBytes: number) {
      if (!fs.existsSync(fromPath)) throw new Error("source_missing");
      if (fs.statSync(fromPath).size > maxBytes) throw new Error("too_large");
      fs.mkdirSync(path.dirname(toPath), { recursive: true });
      const src = fs.openSync(fromPath, "r");
      const dest = fs.openSync(toPath, "w");
      try {
        const buf = Buffer.alloc(HASH_CHUNK_BYTES);
        let total = 0;
        for (;;) {
          const n = fs.readSync(src, buf, 0, HASH_CHUNK_BYTES, null);
          if (n <= 0) break;
          total += n;
          if (total > maxBytes) throw new Error("too_large");
          fs.writeSync(dest, buf, 0, n);
        }
      } finally {
        fs.closeSync(src);
        fs.closeSync(dest);
      }
    },
    async writeBytes(toPath: string, bytes: Uint8Array) {
      fs.mkdirSync(path.dirname(toPath), { recursive: true });
      fs.writeFileSync(toPath, bytes);
    },
    async deleteFile(filePath: string) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    },
    async fileExists(filePath: string) {
      return fs.existsSync(filePath);
    },
    async fileSize(filePath: string) {
      if (!fs.existsSync(filePath)) return null;
      return fs.statSync(filePath).size;
    },
    async *readChunks(filePath: string) {
      if (!fs.existsSync(filePath)) throw new Error("source_missing");
      const fd = fs.openSync(filePath, "r");
      try {
        const buf = Buffer.alloc(HASH_CHUNK_BYTES);
        for (;;) {
          const n = fs.readSync(fd, buf, 0, HASH_CHUNK_BYTES, null);
          if (n <= 0) break;
          yield new Uint8Array(buf.subarray(0, n));
        }
      } finally {
        fs.closeSync(fd);
      }
    },
  };
}

function writeTemp(dir: string, name: string, bytes: Uint8Array): string {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, bytes);
  return filePath;
}

async function main(): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-t4-picker-"));
  const dbPath = path.join(tmp, "grin-picker.sqlite");
  const retainRoot = path.join(tmp, "retain");
  fs.mkdirSync(retainRoot, { recursive: true });
  let db: HostSqlite | null = null;

  installGrinScreenRuntime({
    useT: () => (key) => key,
    useThemedStyles: (factory) => factory(lightColors),
    useRouter: () => ({ back: () => undefined, push: () => undefined, replace: () => undefined }),
    useLocalSearchParams: <T extends Record<string, string | undefined>>() => ({}) as T,
    useFocusEffect: () => undefined,
    getPickerHostAppState: () => "active",
  });

  try {
    db = openHostSqlite(dbPath);
    assert.equal(db.executionLabel, SQLITE_HOST);
    console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
    console.log(`HOST_FILESYSTEM=${os.platform()} ${retainRoot}`);
    console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);

    setGrinApplicationDbFactoryForTests(() => db as HostSqlite);
    setGrinServerPortFactoryForTests(() => createUninjectedGrinServerPort());
    setGrinEvidencePortFactoryForTests(() => createUninjectedGrinEvidencePort());
    setGrinOriginalRetentionFsForTests(createHostFs(retainRoot));
    setGrinOriginalHasherForTests(() => {
      const h = createHash("sha256");
      return {
        update(chunk) {
          h.update(chunk);
        },
        digestHex() {
          return h.digest("hex");
        },
      };
    });

    const sessionA = startGrinOwnerSession("owner_a");
    const repoA = getGrinApplicationRepository("owner_a", sessionA.dispatchGeneration);
    repoA.createQueued(
      sampleRegisterBody({
        receiptId: "grcp_pick_a",
        supplier: {
          name: { kind: "present", value: "Picker A" },
          registration: { kind: "registered", gstin: "29BBBBB0000B1Z5" },
          address: { kind: "not_supplied" },
          contact: { kind: "not_supplied" },
        },
      })
    );

    const pdfBytes = new Uint8Array(Buffer.from("%PDF-1.4 picker-original"));
    const pdfPath = writeTemp(tmp, "source.pdf", pdfBytes);
    setGrinOriginalOsBridgeForTests({
      async pickDocument() {
        return {
          uri: pdfPath,
          mime: "application/pdf",
          fileName: "do-not-log.pdf",
          size: 1,
        };
      },
      async requestMediaLibraryPermission() {
        return true;
      },
    });
    const pdfPicked = await pickGrinOriginal({ source: "library", category: "invoice", origin: sessionA });
    assert.ok(pdfPicked);
    assert.equal(pdfPicked.mime, "application/pdf");
    assert.equal(pdfPicked.captureProvenance, "imported_original");
    assert.equal(pdfPicked.osConversionOccurred, "unknown");
    assert.equal(pdfPicked.byteSize, pdfBytes.byteLength);
    assert.equal(pdfPicked.claimedSha256, sha256(pdfBytes));
    assert.notEqual(pdfPicked.localPath, pdfPath);
    assert.equal(fs.existsSync(pdfPicked.localPath), true);
    assert.equal(pdfPicked.byteSize !== 1, true, "must measure retained bytes, not trust inaccurate picker size");
    repoA.attachOriginal({
      receiptId: "grcp_pick_a",
      category: "invoice",
      localPath: pdfPicked.localPath,
      claimedSha256: pdfPicked.claimedSha256,
      byteSize: pdfPicked.byteSize,
      mime: pdfPicked.mime,
      captureProvenance: pdfPicked.captureProvenance,
      osConversionOccurred: pdfPicked.osConversionOccurred,
    });
    commitGrinOriginalRetention(pdfPicked.localPath);
    const attachedPdf = repoA.attachments("grcp_pick_a").find((item) => item.localPathPresent);
    assert.ok(attachedPdf);
    assert.equal(attachedPdf.originalDurable, false, "missing backend must not look like success");
    const storedPdf = db.getFirstSync<{
      capture_provenance: string | null;
      os_conversion_occurred: string | null;
      claimed_mime: string | null;
    }>(
      `SELECT capture_provenance, os_conversion_occurred, claimed_mime FROM grin_local_evidence_files WHERE owner_uid = ? AND receipt_id = ? AND claimed_sha256 = ?`,
      ["owner_a", "grcp_pick_a", sha256(pdfBytes)]
    );
    assert.equal(storedPdf?.capture_provenance, "imported_original");
    assert.equal(storedPdf?.os_conversion_occurred, "unknown");
    assert.equal(storedPdf?.claimed_mime, "application/pdf");

    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0x01, 0x02, 0x03, 0xd9]);
    const jpegPath = writeTemp(tmp, "source.jpg", jpegBytes);
    setGrinOriginalOsBridgeForTests({
      async pickDocument() {
        return { uri: jpegPath, mime: "image/jpeg", fileName: "hidden.jpg", size: null };
      },
      async requestMediaLibraryPermission() {
        return true;
      },
    });
    const jpegPicked = await pickGrinOriginal({ source: "library", category: "qc", origin: sessionA });
    assert.ok(jpegPicked);
    assert.equal(jpegPicked.mime, "image/jpeg");
    assert.equal(jpegPicked.captureProvenance, "os_conversion");
    assert.equal(jpegPicked.claimedSha256, sha256(jpegBytes));
    assert.equal(jpegPicked.byteSize, jpegBytes.byteLength);
    await discardUncommittedGrinOriginal(jpegPicked.localPath);
    assert.equal(fs.existsSync(jpegPicked.localPath), false, "uncommitted temp must be disposed");
    assert.equal(fs.existsSync(pdfPicked.localPath), true, "must never delete queued originals");

    const cameraBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xaa, 0xbb]);
    setGrinOriginalOsBridgeForTests({
      async requestCameraPermission() {
        return true;
      },
      async pickCamera() {
        return {
          uri: path.join(tmp, "camera-missing.jpg"),
          mime: "image/jpeg",
          fileName: null,
          size: cameraBytes.byteLength,
          injectedBytes: cameraBytes,
        };
      },
    });
    const cameraPicked = await pickGrinOriginal({ source: "camera", category: "vehicle", origin: sessionA });
    assert.ok(cameraPicked);
    assert.equal(cameraPicked.captureProvenance, "camera_capture");
    assert.equal(cameraPicked.osConversionOccurred, "unknown");
    assert.equal(cameraPicked.claimedSha256, sha256(cameraBytes));
    await discardUncommittedGrinOriginal(cameraPicked.localPath);

    setGrinOriginalOsBridgeForTests({
      async pickDocument() {
        return null;
      },
      async requestMediaLibraryPermission() {
        return true;
      },
    });
    const cancelled = await pickGrinOriginal({ source: "library", category: "invoice", origin: sessionA });
    assert.equal(cancelled, null);

    setGrinOriginalOsBridgeForTests({
      async requestCameraPermission() {
        return false;
      },
    });
    await assert.rejects(
      () => pickGrinOriginal({ source: "camera", category: "invoice", origin: sessionA }),
      (err: unknown) => err instanceof Error && err.message === "permission"
    );

    const gone = path.join(tmp, "gone.pdf");
    setGrinOriginalOsBridgeForTests({
      async pickDocument() {
        return { uri: gone, mime: "application/pdf", fileName: null, size: 12 };
      },
      async requestMediaLibraryPermission() {
        return true;
      },
    });
    await assert.rejects(
      () => pickGrinOriginal({ source: "library", category: "invoice", origin: sessionA }),
      (err: unknown) => err instanceof Error && err.message === "source_missing"
    );

    const oversize = new Uint8Array(MAX_PDF_ORIGINAL_BYTES + 1);
    oversize[0] = 0x25;
    const oversizePath = writeTemp(tmp, "oversize.pdf", oversize);
    setGrinOriginalOsBridgeForTests({
      async pickDocument() {
        return { uri: oversizePath, mime: "application/pdf", fileName: null, size: 10 };
      },
      async requestMediaLibraryPermission() {
        return true;
      },
    });
    await assert.rejects(
      () => pickGrinOriginal({ source: "library", category: "invoice", origin: sessionA }),
      (err: unknown) => err instanceof Error && err.message === "too_large"
    );
    assert.ok(MAX_IMAGE_ORIGINAL_BYTES > 0);

    const beforeSwitch = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const switchPath = writeTemp(tmp, "switch.pdf", beforeSwitch);
    let releasePick: (() => void) | null = null;
    const held = new Promise<void>((resolve) => {
      releasePick = resolve;
    });
    setGrinOriginalOsBridgeForTests({
      async pickDocument() {
        await held;
        return { uri: switchPath, mime: "application/pdf", fileName: null, size: beforeSwitch.byteLength };
      },
      async requestMediaLibraryPermission() {
        return true;
      },
    });
    const inFlight = pickGrinOriginal({ source: "library", category: "invoice", origin: sessionA });
    const sessionB = startGrinOwnerSession("owner_b");
    const repoB = getGrinApplicationRepository("owner_b", sessionB.dispatchGeneration);
    const listedBefore = repoB.attachments("grcp_pick_a").length;
    releasePick!();
    await assert.rejects(
      () => inFlight,
      (err: unknown) => err instanceof Error && err.message === GRIN_BINDING_RETIRED
    );
    assert.equal(repoB.attachments("grcp_pick_a").length, listedBefore);
    assert.throws(
      () => getGrinApplicationRepository("owner_a", sessionA.dispatchGeneration),
      (err: unknown) => err instanceof Error && err.message === GRIN_BINDING_RETIRED
    );

    db.close();
    db = openHostSqlite(dbPath);
    setGrinApplicationDbFactoryForTests(() => db as HostSqlite);
    const sessionA2 = startGrinOwnerSession("owner_a");
    const repoA2 = getGrinApplicationRepository("owner_a", sessionA2.dispatchGeneration);
    const afterReopen = repoA2.attachments("grcp_pick_a");
    assert.ok(afterReopen.some((item) => item.claimedSha256 === sha256(pdfBytes)));
    assert.equal(fs.existsSync(pdfPicked.localPath), true, "sqlite reopen must keep queued original bytes");
    const reopenedPdf = db.getFirstSync<{
      capture_provenance: string | null;
      os_conversion_occurred: string | null;
      claimed_mime: string | null;
    }>(
      `SELECT capture_provenance, os_conversion_occurred, claimed_mime FROM grin_local_evidence_files WHERE owner_uid = ? AND receipt_id = ? AND claimed_sha256 = ?`,
      ["owner_a", "grcp_pick_a", sha256(pdfBytes)]
    );
    assert.equal(reopenedPdf?.capture_provenance, "imported_original");
    assert.equal(reopenedPdf?.os_conversion_occurred, "unknown");
    assert.equal(reopenedPdf?.claimed_mime, "application/pdf");

    retireGrinOwnerSession();
    setGrinServerPortFactoryForTests(() => createFakeGrinServerPort());
    setGrinEvidencePortFactoryForTests(() => createFakeEvidenceUploadPort());
    const hasherPdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);
    const hasherPdfPath = writeTemp(tmp, "hasher.pdf", hasherPdfBytes);
    setGrinOriginalOsBridgeForTests({
      async pickDocument() {
        return { uri: hasherPdfPath, mime: "application/pdf", fileName: "hasher.pdf", size: hasherPdfBytes.byteLength };
      },
      async requestMediaLibraryPermission() {
        return true;
      },
    });
    const sessionH = startGrinOwnerSession("owner_hasher");
    const repoH = getGrinApplicationRepository("owner_hasher", sessionH.dispatchGeneration);
    const boxH = (repoH as unknown as { outbox: GrinOutbox }).outbox;
    const hasherLabel = (boxH as unknown as { localOriginalHasher: { executionLabel: string } | null }).localOriginalHasher;
    assert.equal(hasherLabel?.executionLabel, APP_FILESYSTEM);
    repoH.createQueued(
      sampleRegisterBody({
        receiptId: "grcp_hasher",
        supplier: {
          name: { kind: "present", value: "Hasher" },
          registration: { kind: "registered", gstin: "29BBBBB0000B1Z5" },
          address: { kind: "not_supplied" },
          contact: { kind: "not_supplied" },
        },
      })
    );
    const hasherPicked = await pickGrinOriginal({ source: "library", category: "invoice", origin: sessionH });
    assert.ok(hasherPicked);
    repoH.attachOriginal({
      receiptId: "grcp_hasher",
      category: "invoice",
      localPath: hasherPicked.localPath,
      claimedSha256: hasherPicked.claimedSha256,
      byteSize: hasherPicked.byteSize,
      mime: hasherPicked.mime,
      captureProvenance: hasherPicked.captureProvenance,
      osConversionOccurred: hasherPicked.osConversionOccurred,
    });
    commitGrinOriginalRetention(hasherPicked.localPath);
    const registered = await boxH.dispatchDue(sessionH, "worker_hasher");
    assert.ok(registered.results.some((item) => item.commandId && item.localState === "attachment_pending"));
    const uploaded = await boxH.dispatchDue(sessionH, "worker_hasher");
    assert.ok(uploaded.results.some((item) => item.localState === "issued"));
    const hasherFiles = boxH.listLocalFiles("owner_hasher", GRIN_APPLICATION_LEDGER_ID, "grcp_hasher");
    const durable = hasherFiles.find((file) => file.role === "original");
    assert.equal(durable?.originalDurable, true, "persistGrinOwnerSession hasher must admit known retained bytes");
    assert.equal(durable?.osConversionOccurred, "unknown");
    assert.equal(durable?.actualSha256, sha256(hasherPdfBytes));
  } finally {
    retireGrinOwnerSession();
    resetGrinApplicationRepositoryForTests();
    resetGrinOriginalPickerForTests();
    resetGrinOriginalRetentionForTests();
    try {
      db?.close();
    } catch {
      // ignore
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log("grinOriginalPicker.sqliteHost.test.ts: ok");
}

void main();
