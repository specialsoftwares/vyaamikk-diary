import assert from "node:assert/strict";

import {
  buildIdempotencyKey,
  createSaveIdempotencyContext,
  generateClientRecordId,
} from "./saveIdempotency";
import { dedupeProfessionalPacks } from "../professionalPack/dedupe";
import type { ProfessionalServicePack } from "@/domain/professionalPack";

assert.match(generateClientRecordId("psp"), /^psp_/);
assert.match(generateClientRecordId("entry"), /^entry_/);

const ctx = createSaveIdempotencyContext({
  userId: "user_a",
  recordKind: "professional_pack",
  clientRecordId: "psp_test_1",
  scopeKey: "ca_tax:gst_notice_query",
});
assert.equal(
  buildIdempotencyKey({
    userId: "user_a",
    recordKind: "professional_pack",
    clientRecordId: "psp_test_1",
    scopeKey: "ca_tax:gst_notice_query",
  }),
  ctx.idempotencyKey
);

function pack(id: string, title: string, matterDate: number): ProfessionalServicePack {
  return {
    id,
    userId: "u1",
    ueid: "VYD-0000-000001",
    professionalCategory: "ca_tax",
    matterType: "gst_notice_query",
    title,
    facts: {},
    linkedEntryIds: [],
    attachments: [],
    matterDate,
    dueDate: null,
    reminder: null,
    status: "active",
    professionalName: null,
    professionalContact: null,
    notes: null,
    pdfUri: null,
    createdAt: matterDate,
    updatedAt: matterDate,
    deletedAt: null,
  };
}

const dupPacks = [
  pack("id_a", "GST notice", 1000),
  pack("id_b", "GST notice", 1000),
  pack("id_c", "GST notice", 1000),
];
assert.equal(dedupeProfessionalPacks(dupPacks).length, 3, "distinct ids are kept");

const blankDup = [pack("", "x", 1), pack("", "x", 1), pack("real", "y", 2)];
assert.equal(dedupeProfessionalPacks(blankDup).length, 1, "blank ids dropped");

console.log("saveIdempotency.test.ts ok");
