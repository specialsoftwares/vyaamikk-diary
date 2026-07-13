/**
 * JS auth bridge — gating behaviour tests (node runtime, no Firebase).
 *
 * Run: npm run test:js-auth-bridge
 */

import { ensureJsAuthSession, getNativeAuthUid } from "./jsAuthBridge";
import { getActiveBackend } from "@/config/env";

let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ok - ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL - ${name}${detail ? ` (${detail})` : ""}`);
  }
}

async function main() {
  console.log("jsAuthBridge tests");

  const backend = getActiveBackend();
  check(
    "node test runtime is not firebase-production",
    backend !== "firebase-production",
    `backend=${backend}`
  );

  check(
    "getNativeAuthUid returns null when native module is not linked",
    getNativeAuthUid() === null
  );

  const result = await ensureJsAuthSession();
  check(
    "ensureJsAuthSession is a no-op (true) outside firebase-production",
    result === true
  );

  const second = await ensureJsAuthSession();
  check("ensureJsAuthSession is idempotent", second === true);

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all jsAuthBridge tests passed");
}

void main();
