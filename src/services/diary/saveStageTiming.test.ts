import assert from "node:assert/strict";

import {
  beginSaveAttempt,
  p50,
  p95,
  percentile,
  resetSaveStageTimingsForTests,
} from "@/services/diary/saveStageTiming";
import {
  deriveComposerSaveStatus,
  shouldDisplayRemoteSynced,
} from "@/services/diary/composerSaveStatus";

function main(): void {
  const samples = [5, 1, 4, 2, 3];
  assert.equal(percentile(samples, 50), 3);
  assert.equal(p50(samples), 3);
  assert.equal(percentile(samples, 95), 5);
  assert.equal(p95(samples), 5);
  assert.equal(percentile([], 95), 0);
  assert.equal(p50([8]), 8);
  assert.equal(p95([8]), 8);

  assert.equal(shouldDisplayRemoteSynced(true), true);
  assert.equal(shouldDisplayRemoteSynced(false), false);
  assert.equal(shouldDisplayRemoteSynced(undefined), false);

  assert.equal(
    deriveComposerSaveStatus({
      localDurable: true,
      remoteAccepted: false,
      photo: "local",
      pdf: "ready",
    }),
    "ready"
  );
  assert.equal(
    deriveComposerSaveStatus({
      localDurable: true,
      remoteAccepted: false,
      photo: "syncing",
      pdf: "pending",
    }),
    "syncing_photo"
  );
  assert.equal(
    deriveComposerSaveStatus({
      localDurable: true,
      remoteAccepted: true,
      photo: "failed",
      pdf: "ready",
    }),
    "needs_attention"
  );

  resetSaveStageTimingsForTests();
  const a = beginSaveAttempt();
  const b = beginSaveAttempt();
  a.record("local_commit", 11);
  b.record("local_commit", 80);
  assert.equal(a.samples().length, 1);
  assert.equal(a.samples()[0]?.durationMs, 11);
  assert.equal(b.samples()[0]?.durationMs, 80);
  assert.notEqual(a.operationId, b.operationId);

  console.log("saveStageTiming.test.ts ok");
}

main();
