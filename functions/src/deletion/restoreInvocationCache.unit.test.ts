import assert from "node:assert/strict";

import { rememberInvocationValue } from "./restoreInvocationCache";

async function main() {
  const slot: { value?: string } = {};
  let reads = 0;
  const first = rememberInvocationValue(slot, async () => {
    reads += 1;
    return "fence";
  });
  const second = rememberInvocationValue(slot, async () => {
    reads += 1;
    return "other";
  });
  assert.equal(await first, "fence");
  assert.equal(await second, "fence");
  assert.equal(reads, 1);

  const failed: { value?: string } = {};
  await assert.rejects(
    rememberInvocationValue(failed, async () => {
      throw new Error("unreadable");
    })
  );
  assert.equal(failed.value, undefined);
  const recovered = await rememberInvocationValue(failed, async () => "reread");
  assert.equal(recovered, "reread");

  console.log("restoreInvocationCache.unit.test.ts: ok");
}

void main();
