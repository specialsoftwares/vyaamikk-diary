import assert from "node:assert/strict";

import type { ProfessionalServicePack } from "@/domain/professionalPack";
import { dedupeProfessionalPacks } from "./dedupe";

function pack(id: string): ProfessionalServicePack {
  return {
    id,
    userId: "u1",
    ueid: "VYD-0000-000001",
    professionalCategory: "ca_tax",
    matterType: "gst_notice_query",
    title: "Test",
    facts: {},
    linkedEntryIds: [],
    attachments: [],
    matterDate: 1,
    dueDate: null,
    reminder: null,
    status: "active",
    professionalName: null,
    professionalContact: null,
    notes: null,
    pdfUri: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
  };
}

const rows = [pack(""), pack(""), pack("abc"), pack("abc"), pack("def")];
const out = dedupeProfessionalPacks(rows);
assert.equal(out.length, 2, "drops blank and duplicate ids");
assert.deepEqual(
  out.map((p) => p.id),
  ["abc", "def"]
);

console.log("professionalPack/dedupe.test.ts ok");
