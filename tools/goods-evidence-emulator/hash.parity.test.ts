import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { canonicalJson } from "../../src/goodsEvidence/canonical";
import { freezeCommand } from "../../src/goodsEvidence/command";
import { hashCanonical as domainHash, hashOriginalSnapshot } from "../../src/goodsEvidence/hashChain";
import { sampleRegisterBody } from "../../src/goodsEvidence/testFixtures";
import { freezeDigest, hashCanonical, hashOriginalSnapshot as adapterHashOriginal } from "./hash";

{
  const payload = { b: 2, a: "sample" };
  const node = createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex");
  assert.equal(hashCanonical(payload), node);
  assert.equal(hashCanonical(payload), domainHash(payload));
}

{
  const cmd = freezeCommand({
    commandId: "cmd_hash_1",
    type: "registerGoodsReceipt",
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    body: sampleRegisterBody(),
  });
  assert.equal(
    freezeDigest({
      commandId: cmd.commandId,
      type: cmd.type,
      ownerUid: cmd.ownerUid,
      ledgerId: cmd.ledgerId,
      body: cmd.body,
    }),
    cmd.digest
  );
}

{
  const original = {
    ...sampleRegisterBody(),
    schemaVersion: 1 as const,
    ownerUid: "owner_1",
    ledgerId: "ledger_1",
    serial: 1,
    issuedNumber: "GRIN/MAIN/FY2026-27/000001",
    fyToken: "FY2026-27",
    serverRegisteredAtUtc: "2026-09-28T12:00:00.000Z",
    originalSnapshotHash: null,
  };
  assert.equal(adapterHashOriginal(original), hashOriginalSnapshot(original));
}

console.log("tools/goods-evidence-emulator/hash.parity.test.ts: ok");
