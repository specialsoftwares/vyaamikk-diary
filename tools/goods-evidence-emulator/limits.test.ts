import assert from "node:assert/strict";

import { sampleRegisterBody } from "../../src/goodsEvidence/testFixtures";
import {
  MAX_ENVELOPE_UTF8_BYTES,
  envelopeByteError,
  extraEnvelopeKeyError,
  lineCountError,
  serverFieldError,
  sparseArrayError,
  textLimitError,
  utf8ByteLength,
} from "./limits";
import { commandIdError, documentIdError } from "./ids";
import { formatG1Log, sanitizeG1Meta } from "./log";

{
  const envelope = {
    commandId: "cmd_limit_1",
    type: "registerGoodsReceipt",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    body: sampleRegisterBody(),
  };
  assert.equal(envelopeByteError(envelope), null);
  assert.ok(utf8ByteLength(JSON.stringify(envelope)) < MAX_ENVELOPE_UTF8_BYTES);
}

{
  const huge = { commandId: "cmd_limit_1", type: "registerGoodsReceipt", ledgerId: "ledger_1", body: { blob: "x".repeat(MAX_ENVELOPE_UTF8_BYTES) } };
  assert.equal(envelopeByteError(huge), "request body exceeds the technical UTF-8 byte limit");
}

{
  assert.equal(extraEnvelopeKeyError({ commandId: "a", extra: true }), "extra envelope fields are not allowed");
}

{
  const lines = Array.from({ length: 51 }, (_, i) => ({ lineId: `l${i}` }));
  assert.equal(lineCountError({ lines }), "line count exceeds the technical limit");
}

{
  const sparse: unknown[] = [];
  sparse[1] = "x";
  assert.match(sparseArrayError(sparse, "body") ?? "", /sparse|undefined/);
}

{
  assert.equal(serverFieldError({ issuedNumber: "GRIN/MAIN/FY2026-27/000001" }), "server-generated fields are not client authority");
}

{
  assert.equal(textLimitError({ remarks: { kind: "present", value: "a".repeat(501) } }), "body.remarks.value exceeds the technical text limit");
  assert.equal(textLimitError({ remarks: { kind: "present", value: "a".repeat(500) } }), null);
}

{
  assert.equal(documentIdError("receiptId", "a/b"), "receiptId is not a valid document id");
  assert.equal(documentIdError("receiptId", ".."), "receiptId is not a valid document id");
  assert.equal(commandIdError("short"), "commandId is not a valid document id");
  assert.equal(commandIdError("command1"), null);
}

{
  const dirty = sanitizeG1Meta({ code: "forbidden", message: "secret", attempt: 2, body: { a: 1 } });
  assert.deepEqual(dirty, { code: "forbidden", attempt: 2 });
  assert.doesNotMatch(formatG1Log("grin_g1_denied", { code: "forbidden", message: "nope" }), /nope/);
}

console.log("tools/goods-evidence-emulator/limits.test.ts: ok");
