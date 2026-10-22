/**
 * EMULATOR: production upload adapter, Storage rules, then a second client.
 * The local plaintext is removed before recovery. Opening happens before
 * image validation and the voucher HTML includes the recovered image.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { createMockUserToken } from "@firebase/util";
import { doc, setDoc } from "firebase/firestore";
import { getBytes, getMetadata, ref } from "firebase/storage";

import type { BusinessEntry } from "@/domain/businessEntry";
import { CONTENT_SEAL_MEDIA_TYPE } from "@/constants/contentSeal";
import { openContent, sealContent } from "../../../functions/src/privacy/contentEncryption";
import { encodeBase64 } from "./receiptPhotoBytes";
import {
  buildMediaUploadUrl,
  uploadLocalFileViaMediaApi,
  type MediaUploadPorts,
} from "@/services/storage/userStorageUploadCore";

const NATIVE_STUB_RE = /^(react-native|expo|@react-native|@expo)(\/|$|-)/;
const nativeStub = new Proxy(
  {},
  {
    get: (_target, key) => {
      if (key === "__esModule") return true;
      if (key === "default") return {};
      return () => undefined;
    },
  }
);
type Loader = (request: string, ...rest: unknown[]) => unknown;
const moduleLoader = Module as unknown as { _load: Loader };
const originalLoad = moduleLoader._load;
moduleLoader._load = function patchedLoad(this: unknown, request: string, ...rest: unknown[]) {
  if (NATIVE_STUB_RE.test(request)) return nativeStub;
  return originalLoad.call(this, request, ...rest);
};

const PROJECT_ID = "vyaamikk-diary-storage-rules-test";
const OWNER = "receipt-owner";
const PATH = `users/${OWNER}/attachments/cash-1/receipt.bin`;
const KEY = Buffer.alloc(32, 9);
const REVISION = 1_700_000_000_000;
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function bearer(uid: string): string {
  return createMockUserToken({ sub: uid, user_id: uid }, PROJECT_ID);
}

function ports(uid: string, storage: ReturnType<RulesTestEnvironment["authenticatedContext"]>["storage"]): MediaUploadPorts {
  const emulatorHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST?.trim() || "127.0.0.1:9199";
  return {
    async getLocalBytes(localUri) {
      return readFileSync(localUri.replace(/^file:\/\//, "")).byteLength;
    },
    async getAuthHeaders(contentType) {
      return { Authorization: `Firebase ${bearer(uid)}`, "Content-Type": contentType };
    },
    buildUploadUrl(storagePath) {
      const mediaUrl = buildMediaUploadUrl(storagePath, { bucket: PROJECT_ID, emulatorHost });
      assert.match(mediaUrl, /uploadType=media/);
      assert.doesNotMatch(mediaUrl, /firebasestorage\.googleapis\.com/);
      return mediaUrl.replace("uploadType=media", "uploadType=multipart");
    },
    async uploadBinary({ url, localUri, headers }) {
      const bytes = readFileSync(localUri.replace(/^file:\/\//, ""));
      const contentType = headers["Content-Type"] || "application/octet-stream";
      const boundary = `vydboundary${Date.now()}`;
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${JSON.stringify({ contentType })}\r\n` +
            `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`
        ),
        bytes,
        Buffer.from(`\r\n--${boundary}--`),
      ]);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: headers.Authorization,
          "X-Goog-Upload-Protocol": "multipart",
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      });
      return { status: res.status, body: await res.text() };
    },
    async getRemoteSize(storagePath) {
      const meta = await getMetadata(ref(storage(), storagePath));
      return typeof meta.size === "number" ? meta.size : -1;
    },
    async getDownloadUrl() {
      return undefined;
    },
  };
}

function fileDeps(
  dir: string,
  download: (dest: string) => Promise<"ok" | "missing">,
  session: { uid: string },
  flipAfterOpen = false
) {
  return {
    cacheDir() {
      return dir;
    },
    async ensureDir() {
      return undefined;
    },
    async info(uri: string) {
      try {
        const size = readFileSync(uri).byteLength;
        return { exists: true, size };
      } catch {
        return { exists: false };
      }
    },
    async readBase64(uri: string) {
      return readFileSync(uri).toString("base64");
    },
    async move(from: string, to: string) {
      writeFileSync(to, readFileSync(from));
      unlinkSync(from);
    },
    async remove(uri: string) {
      try {
        unlinkSync(uri);
      } catch {
        // best-effort
      }
    },
    async writeBase64(uri: string, base64: string) {
      writeFileSync(uri, Buffer.from(base64, "base64"));
    },
    async downloadOwned(_path: string, dest: string) {
      return download(dest);
    },
    async openSeal(seal: {
      uid: string;
      collection: string;
      recordId: string;
      revision: number;
      purpose: string;
      nonce: string;
      ciphertext: string;
      tag: string;
      v: 1;
      alg: "AES-256-GCM";
    }) {
      if (session.uid !== OWNER) throw Object.assign(new Error("owner_changed"), { code: "owner_changed" });
      const plain = openContent({
        key: KEY,
        uid: OWNER,
        collection: "attachments",
        recordId: seal.recordId,
        revision: seal.revision,
        purpose: "attachment",
        seal,
      });
      if (flipAfterOpen) session.uid = "other-session";
      return plain.toString("base64");
    },
  };
}

async function main() {
  const { prepareReceiptPhoto } = await import("./prepareReceiptPhoto");
  process.env.FIREBASE_STORAGE_EMULATOR_HOST =
    process.env.FIREBASE_STORAGE_EMULATOR_HOST || "127.0.0.1:9199";
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8") },
    storage: { rules: readFileSync(resolve(process.cwd(), "storage.rules"), "utf8") },
  });
  const dir = mkdtempSync(join(tmpdir(), "cash-receipt-"));
  const localPng = join(dir, "receipt.png");
  const envelopeFile = join(dir, "envelope.json");
  writeFileSync(localPng, PNG);
  const seal = sealContent({
    key: KEY,
    uid: OWNER,
    collection: "attachments",
    recordId: PATH,
    revision: REVISION,
    purpose: "attachment",
    plaintext: PNG,
  });
  writeFileSync(envelopeFile, JSON.stringify(seal));
  unlinkSync(localPng);

  try {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", OWNER), {
        uid: OWNER,
        status: "active",
        ageEligibility: "eligible",
      });
    });
    const ownerStorage = () => testEnv.authenticatedContext(OWNER).storage();
    const uploaded = await uploadLocalFileViaMediaApi({
      storagePath: PATH,
      localUri: `file://${envelopeFile}`,
      contentType: CONTENT_SEAL_MEDIA_TYPE,
      userId: OWNER,
      ports: ports(OWNER, ownerStorage),
    });
    assert.equal(uploaded.remoteBytes, Buffer.from(JSON.stringify(seal)).byteLength);
    unlinkSync(envelopeFile);

    const second = testEnv.authenticatedContext(OWNER).storage();
    const recoveredBytes = Buffer.from(await getBytes(ref(second, PATH)));
    assert.equal(JSON.parse(recoveredBytes.toString("utf8")).ciphertext, seal.ciphertext);
    await assertFails(getBytes(ref(testEnv.authenticatedContext("mallory").storage(), PATH)));

    const session = { uid: OWNER };
    const prepared = await prepareReceiptPhoto({
      uid: OWNER,
      entry: {
        userId: OWNER,
        attachments: [],
        payload: { photoAttachmentStoragePath: PATH },
      } as unknown as BusinessEntry,
      readSessionUid: () => session.uid,
      deps: fileDeps(dir, async (dest) => {
        writeFileSync(dest, recoveredBytes);
        return "ok";
      }, session),
    });
    assert.equal(prepared.status, "ready");
    if (prepared.status !== "ready") return;
    assert.match(prepared.dataUri, /^data:image\/png;base64,/);
    assert.equal(prepared.dataUri, `data:image/png;base64,${encodeBase64(PNG)}`);

    const { generateCashPaidVoucherPdf } = await import("@/services/pdf/cashPaidPdfService");
    const voucher = await generateCashPaidVoucherPdf({
      entry: {
        id: "cash-1",
        userId: OWNER,
        entryType: "business_cash_given",
        entryDate: REVISION,
        title: "Cash",
        payload: {
          paymentDate: REVISION,
          cashPaidVoucherSerial: "CPV-1",
          receiverMobile: "9999999999",
          photoAttachmentStoragePath: PATH,
        },
      } as unknown as BusinessEntry,
      user: { uid: OWNER, businessName: "Fixture" } as never,
      mode: "fieldVoucher",
      t: (key: string) => key,
      preparedPhoto: prepared,
    });
    assert.equal(voucher.status, "ready");
    if (voucher.status === "ready") {
      assert.match(voucher.html, /data:image\/png;base64,/);
    }

    session.uid = OWNER;
    const denied = await prepareReceiptPhoto({
      uid: OWNER,
      entry: {
        userId: OWNER,
        attachments: [],
        payload: { photoAttachmentStoragePath: PATH },
      } as unknown as BusinessEntry,
      readSessionUid: () => session.uid,
      deps: fileDeps(
        dir,
        async (dest) => {
          writeFileSync(dest, recoveredBytes);
          return "ok";
        },
        session,
        true
      ),
    });
    assert.equal(denied.status, "unavailable");
    if (denied.status === "unavailable") assert.equal(denied.reason, "access_denied");
    console.log("cashReceiptEnvelope.emulator.test.ts: ok");
  } finally {
    await testEnv.cleanup();
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
