import assert from "node:assert/strict";
import { retryOwnedMobileBind } from "./ownedMobileBindRetry";

async function main() {
  for (const phase of ["bind", "wait"] as const) {
    let current = true, calls = 0;
    await assert.rejects(retryOwnedMobileBind({
      isCurrent: () => current,
      bind: async () => { calls++; if (phase === "bind") current = false; throw new Error("network"); },
      wait: async () => { current = false; },
    }), /session_changed/);
    assert.equal(calls, 1, `${phase} retirement cannot acquire a fresh claim on retry`);
  }
  let calls = 0;
  await assert.rejects(retryOwnedMobileBind({ isCurrent: () => true, bind: async () => { calls++; throw new Error("session_changed"); }, wait: async () => undefined }), /session_changed/);
  assert.equal(calls, 1);
  calls = 0;
  assert.equal(await retryOwnedMobileBind({ isCurrent: () => true, bind: async () => { calls++; if (calls < 2) throw new Error("network"); return "bound"; }, wait: async () => undefined }), "bound");
  assert.equal(calls, 2);
  let current = true;
  await assert.rejects(retryOwnedMobileBind({ isCurrent: () => current, bind: async () => { current = false; return "stale success"; } }), /session_changed/);
  console.log("ownedMobileBindRetry.test.ts: ok");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
