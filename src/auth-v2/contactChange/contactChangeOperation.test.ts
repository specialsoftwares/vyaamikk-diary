import assert from "node:assert/strict";
import { createContactChangeOperations } from "./contactChangeOperation";
import type { PhoneAuthWait } from "@/auth-v2/phoneAuthOperation";

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
async function main() {
  let owner = { uid: "owner-a", generation: 1, epoch: 1 };
  let retired = 0;
  let now = 0;
  const timers: { promise: Promise<void>; resolve: (value: void) => void }[] = [];
  const wait: PhoneAuthWait = () => { const timer = deferred<void>(); timers.push(timer); return { promise: timer.promise, cancel: () => undefined }; };
  const operations = createContactChangeOperations(() => owner, () => { retired++; }, () => now, wait);
  const attempt = operations.begin()!;
  assert.ok(attempt);
  const pending = deferred<string>();
  const result = operations.run(attempt, () => pending.promise);
  const rejected = assert.rejects(result, error => (error as { details?: { phoneAuthSettlement?: string } }).details?.phoneAuthSettlement === "unknown");
  now = 20_000; timers[0].resolve(); await rejected;
  assert.equal(operations.current(attempt), true, "own timeout can show recovery UI");
  assert.equal(operations.mayPublish(attempt), false, "timeout cannot publish late session writes");
  assert.equal(retired, 1);
  operations.finish(attempt);
  const replacement = operations.begin()!;
  pending.resolve("late success");
  await Promise.resolve();
  assert.equal(operations.mayPublish(replacement), true);
  operations.retire();
  assert.equal(operations.current(replacement), false);
  let called = 0;
  await assert.rejects(operations.run(replacement, async () => { called++; }));
  assert.equal(called, 0, "retired work is not dispatched");
  const sameUid = operations.begin()!;
  owner = { ...owner, epoch: 2 };
  await assert.rejects(operations.run(sameUid, async () => { called++; }));
  assert.equal(called, 0, "same UID with a newer session is a different owner");
  const retireCount = retired;
  operations.retire();
  assert.equal(retired, retireCount, "a stale screen cannot retire a replacement session's native work");
  // Two mounted editor instances share the same account epoch. An old editor's
  // cleanup is not permission to retire another editor's running native task.
  const first = createContactChangeOperations(() => owner, () => { retired++; });
  const second = createContactChangeOperations(() => owner, () => { retired++; });
  const firstClaim = first.begin()!;
  await first.run(firstClaim, async () => "done");
  first.finish(firstClaim);
  const secondClaim = second.begin()!;
  const beforeCleanup = retired;
  first.retire();
  assert.equal(retired, beforeCleanup, "finished A cannot retire running B");
  assert.equal(second.mayPublish(secondClaim), true);
  second.retire();
  console.log("contactChangeOperation.test.ts: ok");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
