import assert from "node:assert/strict";

import { p50, p95, percentile } from "@/services/diary/saveStageTiming";
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

  console.log("saveStageTiming.test.ts ok");
}

main();
