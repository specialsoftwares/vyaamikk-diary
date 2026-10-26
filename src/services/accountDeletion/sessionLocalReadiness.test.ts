import assert from "node:assert/strict";

import { commitAfterLocalReadiness } from "@/services/accountDeletion/sessionLocalReadiness";

async function main(): Promise<void> {
let saved = 0;
await assert.rejects(
  commitAfterLocalReadiness({
    isCurrent: () => false,
    prepare: async () => ({ state: "ready", key: new Uint8Array(32) }),
    save: async () => {
      saved += 1;
    },
  })
);
assert.equal(saved, 0);

let current = true;
await assert.rejects(
  commitAfterLocalReadiness({
    isCurrent: () => current,
    prepare: async () => {
      current = false;
      return { state: "ready", key: new Uint8Array(32) };
    },
    save: async () => {
      saved += 1;
    },
  })
);
assert.equal(saved, 0);

await assert.rejects(
  commitAfterLocalReadiness({
    isCurrent: () => true,
    prepare: async () => ({ state: "unavailable", reason: "key_missing" }),
    save: async () => {
      saved += 1;
    },
  })
);
assert.equal(saved, 0);

await commitAfterLocalReadiness({
  isCurrent: () => true,
  prepare: async () => ({ state: "ready", key: new Uint8Array(32) }),
  save: async () => {
    saved += 1;
  },
});
assert.equal(saved, 1);
console.log("sessionLocalReadiness.test.ts: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
