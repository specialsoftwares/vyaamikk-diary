import assert from "node:assert/strict";

import {
  emailChallengeSpans,
  noteEmailChallengeSpan,
  resetEmailChallengeSpansForTests,
  timeEmailChallengeSpan,
} from "./challengeTiming";

resetEmailChallengeSpansForTests();
noteEmailChallengeSpan("challenge_db", 12, "ok");
noteEmailChallengeSpan("provider_request", 40, "error");
const spans = emailChallengeSpans();
assert.equal(spans.length, 2);
assert.equal(spans[0]?.stage, "challenge_db");
assert.equal(spans[1]?.stage, "provider_request");
assert.equal(spans[1]?.outcome, "error");
assert.ok(!JSON.stringify(spans).includes("@"));

async function main(): Promise<void> {
const value = await timeEmailChallengeSpan("verify_db", async () => 7);
assert.equal(value, 7);
assert.equal(emailChallengeSpans().at(-1)?.stage, "verify_db");
assert.equal(emailChallengeSpans().at(-1)?.outcome, "ok");

await assert.rejects(() =>
  timeEmailChallengeSpan("provider_request", async () => {
    throw new Error("provider down");
  })
);
assert.equal(emailChallengeSpans().at(-1)?.outcome, "error");
}

main().then(() => {
  console.log("challengeTiming.test.ts: ok");
});
