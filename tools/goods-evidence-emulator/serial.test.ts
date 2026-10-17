import assert from "node:assert/strict";

import { allocateFromCounter, MAX_ISSUED_SERIAL } from "./serial";

const FY = "FY2026-27";

assert.deepEqual(allocateFromCounter(false, undefined, FY), { ok: true, serial: 1 });

assert.deepEqual(
  allocateFromCounter(true, { fyToken: FY, nextSerial: 2, lastIssuedSerial: 1 }, FY),
  { ok: true, serial: 2 }
);

{
  const stringNext = allocateFromCounter(true, { fyToken: FY, nextSerial: "2", lastIssuedSerial: 1 }, FY);
  assert.equal(stringNext.ok, false);
  if (!stringNext.ok) assert.equal(stringNext.code, "integrity");
}

{
  const missingNext = allocateFromCounter(true, { fyToken: FY, lastIssuedSerial: 1 }, FY);
  assert.equal(missingNext.ok, false);
  if (!missingNext.ok) assert.equal(missingNext.code, "integrity");
}

for (const nextSerial of [1.5, 0, -1, NaN, Infinity, MAX_ISSUED_SERIAL + 2]) {
  const result = allocateFromCounter(true, { fyToken: FY, nextSerial, lastIssuedSerial: 1 }, FY);
  assert.equal(result.ok, false, String(nextSerial));
  if (!result.ok) assert.equal(result.code, "integrity");
}

{
  const inconsistent = allocateFromCounter(true, { fyToken: FY, nextSerial: 5, lastIssuedSerial: 1 }, FY);
  assert.equal(inconsistent.ok, false);
  if (!inconsistent.ok) assert.equal(inconsistent.code, "integrity");
}

{
  const wrongFy = allocateFromCounter(true, { fyToken: "FY2025-26", nextSerial: 2, lastIssuedSerial: 1 }, FY);
  assert.equal(wrongFy.ok, false);
  if (!wrongFy.ok) assert.equal(wrongFy.code, "integrity");
}

{
  const exhausted = allocateFromCounter(
    true,
    { fyToken: FY, nextSerial: MAX_ISSUED_SERIAL + 1, lastIssuedSerial: MAX_ISSUED_SERIAL },
    FY
  );
  assert.equal(exhausted.ok, false);
  if (!exhausted.ok) assert.equal(exhausted.code, "serial_exhausted");
}

{
  const lastSlot = allocateFromCounter(
    true,
    { fyToken: FY, nextSerial: MAX_ISSUED_SERIAL, lastIssuedSerial: MAX_ISSUED_SERIAL - 1 },
    FY
  );
  assert.deepEqual(lastSlot, { ok: true, serial: MAX_ISSUED_SERIAL });
}

console.log("tools/goods-evidence-emulator/serial.test.ts: ok");
