/**
 * Cash receipt photo ordering and PDF evidence.
 * HTML assertions only — this does not render a PDF page.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { BusinessEntry } from "@/domain/businessEntry";
import type { CreateBusinessEntryInput } from "@/services/diary/types";
import type { PreparedReceiptPhoto } from "@/services/attachments/preparedReceiptPhoto";

const NATIVE_STUB_RE = /^(react-native|expo|@react-native|@expo)(\/|$|-)/;
const nativeStub = new Proxy(
  {},
  {
    get: (_target, key) => {
      if (key === "__esModule") return true;
      if (key === "Platform") return { OS: "android" };
      if (key === "cacheDirectory" || key === "documentDirectory") return "/tmp/";
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

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function cashPayload() {
  return {
    amount: 250,
    givenToName: "Ravi",
    purpose: "Labour",
    paymentDate: 1_700_000_000_000,
    paymentMode: "Cash",
    settlementStatus: "pending" as const,
    contactMobile: null,
    businessRef: null,
    siteRef: null,
    expectedSettlementDate: null,
    remarks: null,
  };
}

function cashEntry(photo: "ref" | "none"): BusinessEntry {
  return {
    id: "cash-1",
    userId: "u1",
    ueid: "VYD-2026-TEST01",
    entryType: "business_cash_given",
    title: "Cash paid",
    entryDate: 1_700_000_000_000,
    notes: null,
    reminder: null,
    location: null,
    attachments:
      photo === "ref"
        ? [
            {
              id: "cash_paid_receipt",
              uri: "file:///cash-paid-photos/u1/cash-1.jpg",
              mimeType: "image/jpeg",
              name: "receipt.jpg",
              contentHash: "abc",
              revision: "abc",
              byteSize: 32,
            },
          ]
        : [],
    payload: cashPayload(),
    source: "composer",
    status: "active",
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    pdfUri: null,
    documentHistory: {
      firstGeneratedAt: null,
      lastGeneratedAt: null,
      lastEditedAt: null,
      versionNumber: 1,
      editHistory: [],
      pdfGenerationHistory: [],
    },
  };
}

const labels = {
  notes: "Notes",
  reminder: "Reminder",
  detailsSection: "Details",
  entryDate: "Date",
};

const readyPhoto: PreparedReceiptPhoto = {
  status: "ready",
  dataUri: "data:image/jpeg;base64,AAAA",
  mime: "image/jpeg",
  contentHash: "abc",
  width: 4,
  height: 3,
};

async function main(): Promise<void> {
  const { CASH_PAID_ATTACHMENT_ID } = await import("@/services/attachments/cashPaidPhotoRef");
  const { runCashPaidCreate } = await import("@/services/attachments/cashPaidSaveOrder");
  const { inspectReceiptBytes } = await import("@/services/attachments/receiptPhotoBytes");
  const { MAX_CASH_PAID_PHOTO_BYTES } = await import("@/services/attachments/cashPaidPhotoLimits");
  const { buildBusinessEntryBody } = await import("@/services/pdf/businessEntryPdfBodies");
  const { generateCashPaidVoucherPdf } = await import("@/services/pdf/cashPaidPdfService");

  const composer = readFileSync(resolve(root, "app/(app)/composer/[type].tsx"), "utf8");
  const placeAt = composer.indexOf("await placeCashPhotoOnCreateInput");
  const saveAt = composer.indexOf("await saveComposerEntry");
  assert.ok(placeAt > 0, "create path persists the photo before save");
  assert.ok(saveAt > placeAt, "saveComposerEntry runs after the attachment is on the create input");
  assert.match(composer, /saveComposerEntry\(ownerUid,\s*createInput/);
  assert.equal(composer.includes("resolveCashPaidAttachments"), false);

  const picker = readFileSync(
    resolve(root, "src/services/attachments/cashPaidPhotoService.ts"),
    "utf8"
  );
  assert.match(picker, /allowsEditing:\s*false/);
  assert.match(picker, /base64:\s*false/);
  assert.equal(picker.includes("aspect:"), false);

  const order: string[] = [];
  const input: CreateBusinessEntryInput = {
    clientRecordId: "cash-1",
    ueid: "VYD-2026-TEST01",
    entryType: "business_cash_given",
    title: "Cash paid",
    entryDate: 1_700_000_000_000,
    payload: cashPayload(),
    source: "composer",
  };
  const saved = await runCashPaidCreate({
    uid: "u1",
    entryId: "cash-1",
    picked: {
      uri: "file:///working/receipt.jpg",
      mimeType: "image/jpeg",
      byteSize: 32,
      contentHash: "abc",
      width: 4,
      height: 3,
    },
    input,
    readSessionUid: () => "u1",
    persist: async () => {
      order.push("persist");
      return {
        id: CASH_PAID_ATTACHMENT_ID,
        uri: "file:///cash-paid-photos/u1/cash-1.abc.jpg",
        mimeType: "image/jpeg",
        name: "receipt.jpg",
        contentHash: "abc",
        byteSize: 32,
        revision: "abc",
      };
    },
    save: async (next) => {
      order.push("save");
      const ref = next.attachments?.find((item) => item.id === CASH_PAID_ATTACHMENT_ID);
      assert.ok(ref, "create input includes the cash photo attachment");
      assert.equal(ref?.revision, "abc");
      assert.equal(ref?.contentHash, "abc");
      assert.equal(next.clientRecordId, "cash-1");
      return next;
    },
  });
  assert.deepEqual(order, ["persist", "save"]);
  assert.equal(saved.attachments?.[0]?.id, CASH_PAID_ATTACHMENT_ID);

  const html = buildBusinessEntryBody(cashEntry("ref"), labels, "en-IN", readyPhoto);
  assert.match(html, /<img[^>]*src="data:image\/jpeg;base64,AAAA"/);
  assert.match(html, /object-fit:contain/);
  assert.match(html, /max-width:100%/);
  assert.match(html, /height:auto/);
  assert.match(html, /page-break-inside:avoid/);
  assert.equal(html.includes("Photo attachment available"), false);

  const bare = buildBusinessEntryBody(cashEntry("none"), labels, "en-IN", { status: "none" });
  assert.equal(bare.includes("<img"), false);
  assert.equal(bare.includes("Photo attachment available"), false);

  const unavailable = await generateCashPaidVoucherPdf({
    entry: cashEntry("ref"),
    user: { uid: "u1", businessName: "Site" } as never,
    mode: "fieldVoucher",
    t: (key) => key,
    preparedPhoto: { status: "unavailable", reason: "missing_local" },
  });
  assert.equal(unavailable.status, "unavailable");
  if (unavailable.status !== "unavailable") return;
  assert.equal(unavailable.reason, "missing_local");
  assert.deepEqual(unavailable.recovery, ["retry", "generate_without_photo"]);
  assert.equal("html" in unavailable, false);

  const oversized = new Uint8Array(MAX_CASH_PAID_PHOTO_BYTES + 1);
  oversized[0] = 0xff;
  oversized[1] = 0xd8;
  oversized[2] = 0xff;
  const rejected = inspectReceiptBytes(oversized);
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.reason, "too_large");

  const jpeg = Uint8Array.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x02, 0x00, 0x03, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9,
  ]);
  const inspected = inspectReceiptBytes(jpeg);
  assert.equal(inspected.ok, true);
  if (inspected.ok) {
    assert.equal(inspected.mime, "image/jpeg");
    assert.equal(inspected.width, 3);
    assert.equal(inspected.height, 2);
    assert.match(inspected.dataUri, /^data:image\/jpeg;base64,/);
  }

  console.log("cashPaidPhotoFlow.test.ts ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
