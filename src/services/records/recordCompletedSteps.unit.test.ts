/**
 * Coordination-metadata writes must not bump diary content `updatedAt`.
 * Boundary: in-process patch shape + AsyncStorage mock path (not emulator).
 */
import assert from "node:assert/strict";

import { arrayUnion } from "firebase/firestore";

import {
  appendRecordCompletedStep,
  completedStepsCoordinationPatch,
  COMPLETED_STEPS_AT_FIELD,
  fetchRecordCompletedSteps,
} from "@/services/records/recordCompletedSteps";
import { SAVE_STEP } from "@/services/records/saveLockTypes";

function installAsyncStoragePolyfill(): void {
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;
  const mem = new Map<string, string>();
  (globalThis as unknown as { window: { localStorage: Storage } }).window = {
    localStorage: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
      clear: () => {
        mem.clear();
      },
      get length() {
        return mem.size;
      },
      key: (i: number) => [...mem.keys()][i] ?? null,
    } as Storage,
  };
}

async function main() {
  installAsyncStoragePolyfill();
  const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();

  const primary = completedStepsCoordinationPatch(arrayUnion(SAVE_STEP.BASE_RECORD_CREATED), 42);
  assert.equal(primary[COMPLETED_STEPS_AT_FIELD], 42);
  assert.equal("updatedAt" in primary, false, "primary write must not bump content updatedAt");
  assert.ok(primary.completedSteps);

  const fallback = completedStepsCoordinationPatch(
    [SAVE_STEP.BASE_RECORD_CREATED, SAVE_STEP.PDF_GENERATED],
    99
  );
  assert.equal(fallback[COMPLETED_STEPS_AT_FIELD], 99);
  assert.equal("updatedAt" in fallback, false, "fallback write must not bump content updatedAt");
  assert.deepEqual(fallback.completedSteps, [
    SAVE_STEP.BASE_RECORD_CREATED,
    SAVE_STEP.PDF_GENERATED,
  ]);

  const first = await appendRecordCompletedStep(
    "u_steps",
    "business_entry",
    "en_steps_1",
    SAVE_STEP.BASE_RECORD_CREATED
  );
  assert.deepEqual(first, [SAVE_STEP.BASE_RECORD_CREATED]);
  const again = await appendRecordCompletedStep(
    "u_steps",
    "business_entry",
    "en_steps_1",
    SAVE_STEP.BASE_RECORD_CREATED
  );
  assert.deepEqual(again, [SAVE_STEP.BASE_RECORD_CREATED], "completedSteps dedupe");
  const pdf = await appendRecordCompletedStep(
    "u_steps",
    "business_entry",
    "en_steps_1",
    SAVE_STEP.PDF_GENERATED
  );
  assert.deepEqual(pdf, [SAVE_STEP.BASE_RECORD_CREATED, SAVE_STEP.PDF_GENERATED]);
  const fetched = await fetchRecordCompletedSteps("u_steps", "business_entry", "en_steps_1");
  assert.deepEqual(fetched, pdf);

  console.log("recordCompletedSteps.unit.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
