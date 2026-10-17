import assert from "node:assert/strict";

import { sampleRegisterBody } from "../../src/goodsEvidence/testFixtures";
import { commandIdError, documentIdError, lineIdError } from "./ids";
import {
  MAX_ENVELOPE_UTF8_BYTES,
  MAX_INPUT_DEPTH,
  envelopeByteError,
  extraEnvelopeKeyError,
  inputShapeError,
  lineCountError,
  normalizeJsonCopy,
  serverFieldError,
  sparseArrayError,
  textLimitError,
  utf8ByteLength,
} from "./limits";
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
  assert.equal(lineIdError("__proto__", 0), "line[0] lineId is not a valid line identity");
  assert.equal(lineIdError("constructor", 0), "line[0] lineId is not a valid line identity");
  assert.equal(lineIdError("toString"), null);
  assert.equal(lineIdError("line_1"), null);
}

{
  const dirty = sanitizeG1Meta({ code: "forbidden", message: "secret", attempt: 2, body: { a: 1 } });
  assert.deepEqual(dirty, { code: "forbidden", attempt: 2 });
  assert.doesNotMatch(formatG1Log("grin_g1_denied", { code: "forbidden", message: "nope" }), /nope/);
}

{
  let deep: unknown = { leaf: true };
  for (let i = 0; i < MAX_INPUT_DEPTH + 2; i++) deep = { nested: deep };
  assert.match(inputShapeError(deep, "command envelope") ?? "", /nesting limit/);
  assert.equal(inputShapeError({ ok: true, nested: { a: 1 } }, "command envelope"), null);
  assert.match(inputShapeError({ n: 1n }, "command envelope") ?? "", /non-JSON/);
}

// PURE_DOMAIN — undefined-object contract (reproduced at c9623dd).
{
  // Before the fix, this returned "request contains a non-JSON value".
  assert.equal(inputShapeError({ optional: undefined }, "request"), null);
  assert.equal(inputShapeError({ a: 1, optional: undefined, nested: { b: 2, skip: undefined } }, "request"), null);
  assert.match(inputShapeError([undefined], "request") ?? "", /must not be undefined/);
  const sparse: unknown[] = [];
  sparse[1] = 1;
  assert.match(inputShapeError(sparse, "request") ?? "", /sparse|undefined/);
  assert.equal(inputShapeError(undefined, "request"), "request contains a non-JSON value");

  const caller = { optional: undefined as undefined, keep: 1, nested: { skip: undefined as undefined, keep: "x" } };
  const copy = normalizeJsonCopy(caller) as { keep: number; nested: { keep: string } };
  assert.deepEqual(copy, { keep: 1, nested: { keep: "x" } });
  assert.equal("optional" in caller, true, "caller input must not be mutated");
  assert.equal(caller.optional, undefined);
  assert.equal("skip" in caller.nested, true);
  assert.notEqual(copy, caller);
  assert.throws(() => normalizeJsonCopy([1, undefined, 2]));
}

console.log("tools/goods-evidence-emulator/limits.test.ts: ok");
