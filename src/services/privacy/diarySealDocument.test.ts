import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { resolve } from "path";

import type { BusinessEntry } from "@/domain/businessEntry";
import { emptyDocumentHistory } from "@/domain/documentHistory";
import {
  shouldCreateContentSeals,
  shouldOpenContentSeals,
  shouldSealProductionWrites,
} from "@/constants/contentSeal";
import { PDF_CLOUD_BACKUP_ENABLED } from "@/constants/pdfPrivacy";
import {
  consentAppliesToAccount,
  withdrawalEffect,
} from "@/domain/processingPurpose";

import {
  cloudPayloadLeaksPlaintext,
  diaryPlaintextForSeal,
  sealedDiaryCloudPayload,
  type DiaryContentSeal,
} from "./diarySealDocument";

const record = {
  id: "rec-1",
  userId: "owner-a",
  ueid: "VYD-2026-TEST01",
  entryType: "legacy",
  title: "Warehouse gate replacement",
  entryDate: 10,
  createdAt: 10,
  updatedAt: 11,
  source: "app",
  status: "active",
  notes: "customer Rahul 9876543210",
  reminder: null,
  location: null,
  attachments: [],
  payload: { category: "work", quantity: null, issue: null, tags: [], locationName: null },
  pdfUri: "file:///tmp/local.pdf",
  documentHistory: emptyDocumentHistory(),
  deletedAt: null,
} as unknown as BusinessEntry;

const seal: DiaryContentSeal = {
  v: 1,
  alg: "AES-256-GCM",
  uid: "owner-a",
  collection: "entries",
  recordId: "rec-1",
  revision: 11,
  purpose: "diary",
  nonce: "nonce",
  ciphertext: "ciphertext-without-the-title",
  tag: "tag",
};

const cloud = sealedDiaryCloudPayload(record, seal);
assert.equal(cloud.title, "sealed");
assert.equal(cloud.pdfUri, null);
assert.equal(cloudPayloadLeaksPlaintext(cloud, "Warehouse gate replacement"), false);
assert.equal(cloudPayloadLeaksPlaintext(cloud, "9876543210"), false);
assert.equal(JSON.stringify(diaryPlaintextForSeal(record)).includes("Warehouse gate replacement"), true);
assert.throws(
  () => sealedDiaryCloudPayload(record, { ...seal, revision: 12 }),
  /seal_revision_mismatch/
);
assert.equal(PDF_CLOUD_BACKUP_ENABLED, false);
assert.equal(shouldSealProductionWrites("firebase-production"), true);
assert.equal(shouldOpenContentSeals("firebase-production"), true);
assert.equal(shouldCreateContentSeals("firebase-production", false), false);
assert.equal(shouldOpenContentSeals("firebase-shared-dev"), false);
assert.equal(shouldSealProductionWrites("firebase-production", false), false);
assert.equal(shouldSealProductionWrites("firebase-shared-dev"), false);

assert.deepEqual(withdrawalEffect("crash_diagnostics"), {
  stopsPurposeProcessing: true,
  deletesAccount: false,
});
assert.equal(withdrawalEffect("service_operation").stopsPurposeProcessing, false);
assert.equal(
  consentAppliesToAccount({ uid: "a", purpose: "crash_diagnostics" }, "b", "crash_diagnostics"),
  false
);

const root = resolve(__dirname, "../../..");
const diary = readFileSync(resolve(root, "src/services/diary/firebase.ts"), "utf8");
const storage = readFileSync(resolve(root, "src/services/storage/userStorage.ts"), "utf8");
const consent = readFileSync(resolve(root, "src/services/consent/purposeConsent.ts"), "utf8");
assert.match(diary, /sealDiaryCloudPayload/);
assert.match(diary, /openSealedDiaryEntry/);
assert.match(diary, /result.outcome === "existing"/);
assert.match(diary, /getByIdIncludingDeleted/);
assert.match(storage, /sealAttachmentBase64/);
assert.match(storage, /readProtectedLocalUri/);
assert.match(storage, /getDownloadURL/);
assert.match(storage, /pdf_cloud_backup_disabled/);
assert.match(consent, /applyDiagnosticsChoice\(false\)/);
assert.doesNotMatch(consent, /requestAccountDeletion/);

console.log("diarySealDocument.test.ts: ok");
