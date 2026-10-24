import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PREVIOUS_VISIT_COPY, previousVisitCopy } from "../content/profile/previousVisitCopy";
import {
  APP_VISIT_GAP_MS,
  classifySessionFields,
  createMemoryPreviousVisitStore,
  markAppVisitBackground,
  openAppVisit,
  planAppVisit,
  resetAppVisitForTests,
  type OpenAppVisit,
  type OwnerVisitRecord,
} from "./previousVisit";

const root = join(__dirname, "../..");

function sessionFields(over: {
  lastLoginAt?: number | null;
  previousLoginAt?: number | null;
  signedInAt?: number | null;
  lastActiveAt?: number | null;
} = {}) {
  return {
    lastLoginAt: 11,
    previousLoginAt: 7,
    signedInAt: 11,
    lastActiveAt: 40,
    ...over,
  };
}

async function testFirstVisitIgnoresAccountFields() {
  resetAppVisitForTests();
  const store = createMemoryPreviousVisitStore();
  const input = {
    ownerUid: "owner-a",
    now: 5_000,
    ...sessionFields({ lastActiveAt: 1_000, previousLoginAt: 400, lastLoginAt: 2_000, signedInAt: 2_000 }),
  };
  const snapshot = await openAppVisit(input, store);
  assert.equal(snapshot.kind, "first");
  assert.equal(snapshot.previousVisitAt, null);
  assert.equal(snapshot.currentVisitStartedAt, 5_000);
  assert.equal(snapshot.scope, "device-local");
  assert.deepEqual(input.now, 5_000);
  const saved = JSON.parse(store.snapshot() ?? "{}") as {
    owners: Record<string, OwnerVisitRecord>;
  };
  assert.equal(saved.owners["owner-a"].previousVisitAt, null);
  assert.equal(saved.owners["owner-a"].currentVisitStartedAt, 5_000);
  assert.equal(JSON.stringify(saved).includes("lastActiveAt"), false);
  assert.equal(JSON.stringify(saved).includes("lastLoginAt"), false);
  const classified = classifySessionFields(input);
  assert.equal(classified.lastLoginAt.display, false);
  assert.equal(classified.previousLoginAt.display, false);
  assert.equal(classified.signedInAt.display, false);
  assert.equal(classified.lastActiveAt.display, false);
  assert.equal(classified.lastLoginAt.scope, "account-wide");
  assert.equal(classified.previousLoginAt.scope, "account-wide");
  assert.equal(classified.signedInAt.scope, "device-local");
  assert.equal(classified.lastActiveAt.scope, "account-synced");
}

async function testSameSessionStaysStable() {
  resetAppVisitForTests();
  const store = createMemoryPreviousVisitStore();
  let writes = 0;
  const counting = {
    read: () => store.read(),
    write: async (value: string) => {
      writes += 1;
      await store.write(value);
    },
  };
  const first = await openAppVisit(
    { ownerUid: "owner-a", now: 5_000, ...sessionFields() },
    counting
  );
  const second = await openAppVisit(
    { ownerUid: "owner-a", now: 5_001, ...sessionFields({ lastActiveAt: 5_001 }) },
    counting
  );
  const later = await openAppVisit(
    { ownerUid: "owner-a", now: 8_000, ...sessionFields({ lastActiveAt: 8_000 }) },
    counting
  );
  assert.equal(first.kind, "first");
  assert.equal(second.kind, "first");
  assert.equal(second.currentVisitStartedAt, 5_000);
  assert.equal(later.previousVisitAt, null);
  assert.equal(later.currentVisitStartedAt, 5_000);
  assert.equal(writes, 1);
}

async function testParallelOpenDoesNotAdvance() {
  resetAppVisitForTests();
  const store = createMemoryPreviousVisitStore();
  let writes = 0;
  const counting = {
    read: () => store.read(),
    write: async (value: string) => {
      writes += 1;
      await store.write(value);
    },
  };
  const [a, b] = await Promise.all([
    openAppVisit({ ownerUid: "owner-a", now: 5_000, ...sessionFields() }, counting),
    openAppVisit({ ownerUid: "owner-a", now: 5_000, ...sessionFields() }, counting),
  ]);
  assert.equal(a.kind, "first");
  assert.equal(b.kind, "first");
  assert.equal(a.currentVisitStartedAt, 5_000);
  assert.equal(b.currentVisitStartedAt, 5_000);
  assert.equal(writes, 1);
}

async function testCapturesPreviousBeforeRecordingCurrent() {
  resetAppVisitForTests();
  const store = createMemoryPreviousVisitStore();
  await openAppVisit({ ownerUid: "owner-a", now: 5_000, ...sessionFields() }, store);
  markAppVisitBackground(6_000, "owner-a");
  const next = await openAppVisit(
    { ownerUid: "owner-a", now: 6_000 + APP_VISIT_GAP_MS, ...sessionFields() },
    store
  );
  assert.equal(next.kind, "previous");
  assert.equal(next.previousVisitAt, 5_000);
  assert.equal(next.currentVisitStartedAt, 6_000 + APP_VISIT_GAP_MS);
  assert.notEqual(next.previousVisitAt, sessionFields().lastLoginAt);
  assert.notEqual(next.previousVisitAt, sessionFields().previousLoginAt);
  const saved = JSON.parse(store.snapshot() ?? "{}") as {
    owners: Record<string, OwnerVisitRecord>;
  };
  assert.equal(saved.owners["owner-a"].previousVisitAt, 5_000);
  assert.equal(saved.owners["owner-a"].currentVisitStartedAt, next.currentVisitStartedAt);
}

async function testGapBoundary() {
  resetAppVisitForTests();
  const store = createMemoryPreviousVisitStore();
  await openAppVisit({ ownerUid: "owner-a", now: 1_000, signedInAt: 100 }, store);
  markAppVisitBackground(1_500, "owner-a");
  const inside = await openAppVisit(
    { ownerUid: "owner-a", now: 1_500 + APP_VISIT_GAP_MS - 1, signedInAt: 100 },
    store
  );
  assert.equal(inside.currentVisitStartedAt, 1_000);
  assert.equal(inside.previousVisitAt, null);
  markAppVisitBackground(1_500, "owner-a");
  const outside = await openAppVisit(
    { ownerUid: "owner-a", now: 1_500 + APP_VISIT_GAP_MS, signedInAt: 100 },
    store
  );
  assert.equal(outside.previousVisitAt, 1_000);
  assert.equal(outside.currentVisitStartedAt, 1_500 + APP_VISIT_GAP_MS);
}

async function testAuthSessionChangeCapturesVisitNotLogin() {
  resetAppVisitForTests();
  const store = createMemoryPreviousVisitStore();
  await openAppVisit(
    {
      ownerUid: "owner-a",
      now: 1_000,
      signedInAt: null,
      lastLoginAt: 100,
      previousLoginAt: 50,
      lastActiveAt: 1_000,
    },
    store
  );
  const learned = await openAppVisit(
    {
      ownerUid: "owner-a",
      now: 2_000,
      signedInAt: 500,
      lastLoginAt: 500,
      previousLoginAt: 100,
      lastActiveAt: 2_000,
    },
    store
  );
  assert.equal(learned.kind, "first");
  assert.equal(learned.currentVisitStartedAt, 1_000);
  assert.equal(learned.previousVisitAt, null);

  const relogin = await openAppVisit(
    {
      ownerUid: "owner-a",
      now: 3_000,
      signedInAt: 2_500,
      lastLoginAt: 2_500,
      previousLoginAt: 500,
      lastActiveAt: 3_000,
    },
    store
  );
  assert.equal(relogin.kind, "previous");
  assert.equal(relogin.previousVisitAt, 1_000);
  assert.notEqual(relogin.previousVisitAt, 500);
  assert.notEqual(relogin.previousVisitAt, 2_500);
}

async function testOwnerChangeDoesNotLeak() {
  resetAppVisitForTests();
  const store = createMemoryPreviousVisitStore();
  await openAppVisit({ ownerUid: "owner-a", now: 1_000, signedInAt: 10 }, store);
  markAppVisitBackground(1_100, "owner-a");
  const other = await openAppVisit({ ownerUid: "owner-b", now: 2_000, signedInAt: 20 }, store);
  assert.equal(other.kind, "first");
  assert.equal(other.previousVisitAt, null);
  assert.equal(other.ownerUid, "owner-b");
  const saved = JSON.parse(store.snapshot() ?? "{}") as {
    owners: Record<string, OwnerVisitRecord>;
  };
  assert.equal(saved.owners["owner-a"].currentVisitStartedAt, 1_000);
  assert.equal(saved.owners["owner-b"].currentVisitStartedAt, 2_000);

  resetAppVisitForTests();
  const returned = await openAppVisit(
    { ownerUid: "owner-a", now: 9_000, signedInAt: 30 },
    store
  );
  assert.equal(returned.previousVisitAt, 1_000);
  assert.notEqual(returned.previousVisitAt, 2_000);
}

async function testOrderingRejectsRewindAndFuture() {
  resetAppVisitForTests();
  const store = createMemoryPreviousVisitStore();
  await openAppVisit({ ownerUid: "owner-a", now: 5_000, signedInAt: 10 }, store);
  const rewound = await openAppVisit({ ownerUid: "owner-a", now: 4_000, signedInAt: 10 }, store);
  assert.equal(rewound.currentVisitStartedAt, 5_000);
  assert.equal(rewound.previousVisitAt, null);
  const saved = JSON.parse(store.snapshot() ?? "{}") as {
    owners: Record<string, OwnerVisitRecord>;
  };
  assert.equal(saved.owners["owner-a"].currentVisitStartedAt, 5_000);

  resetAppVisitForTests();
  const futureStore = createMemoryPreviousVisitStore(
    JSON.stringify({
      version: 1,
      owners: {
        "owner-a": {
          ownerUid: "owner-a",
          currentVisitStartedAt: 9_000,
          previousVisitAt: null,
          signedInAt: 10,
        },
      },
    })
  );
  let writes = 0;
  const future = await openAppVisit({ ownerUid: "owner-a", now: 5_000, signedInAt: 10 }, {
    read: () => futureStore.read(),
    write: async (value: string) => {
      writes += 1;
      await futureStore.write(value);
    },
  });
  assert.equal(future.currentVisitStartedAt, 9_000);
  assert.equal(future.kind, "first");
  assert.equal(writes, 0);

  resetAppVisitForTests();
  const corrupt = createMemoryPreviousVisitStore(
    JSON.stringify({
      version: 1,
      owners: {
        "owner-a": {
          ownerUid: "owner-a",
          currentVisitStartedAt: 5_000,
          previousVisitAt: 8_000,
          signedInAt: 10,
        },
      },
    })
  );
  const adopted = await openAppVisit({ ownerUid: "owner-a", now: 5_000, signedInAt: 10 }, corrupt);
  assert.equal(adopted.kind, "unavailable");
  assert.equal(adopted.previousVisitAt, null);
  assert.equal(adopted.currentVisitStartedAt, 5_000);
}

async function testMissingAndReadFailureAreHonest() {
  resetAppVisitForTests();
  const missing = await openAppVisit({ ownerUid: "", now: 5_000 });
  assert.equal(missing.kind, "unavailable");
  const badNow = await openAppVisit({ ownerUid: "owner-a", now: Number.NaN, signedInAt: 1 });
  assert.equal(badNow.kind, "unavailable");

  resetAppVisitForTests();
  const failed = await openAppVisit(
    { ownerUid: "owner-a", now: 5_000, signedInAt: 1 },
    {
      read: async () => {
        throw new Error("disk");
      },
      write: async () => {
        throw new Error("disk");
      },
    }
  );
  assert.equal(failed.kind, "unavailable");
  assert.equal(failed.previousVisitAt, null);
}

async function testColdStartPromotesStoredVisit() {
  resetAppVisitForTests();
  const store = createMemoryPreviousVisitStore(
    JSON.stringify({
      version: 1,
      owners: {
        "owner-a": {
          ownerUid: "owner-a",
          currentVisitStartedAt: 1_000,
          previousVisitAt: null,
          signedInAt: 10,
        },
      },
    })
  );
  const snapshot = await openAppVisit(
    {
      ownerUid: "owner-a",
      now: 9_000,
      lastLoginAt: 9_000,
      previousLoginAt: 4_000,
      signedInAt: 10,
      lastActiveAt: 9_000,
    },
    store
  );
  assert.equal(snapshot.previousVisitAt, 1_000);
  assert.notEqual(snapshot.previousVisitAt, 4_000);
  assert.notEqual(snapshot.previousVisitAt, 9_000);
}

function testPlanDoesNotCopyHeartbeatWhenOpen() {
  const open: OpenAppVisit = {
    ownerUid: "owner-a",
    currentVisitStartedAt: 1_000,
    previousVisitAt: null,
    signedInAt: 10,
    kind: "first",
    backgroundedAt: null,
  };
  const plan = planAppVisit({
    ownerUid: "owner-a",
    now: 50_000,
    lastActiveAt: 49_000,
    lastLoginAt: 40_000,
    previousLoginAt: 30_000,
    signedInAt: 10,
    stored: null,
    open,
  });
  assert.equal(plan.persist, null);
  assert.equal(plan.snapshot.previousVisitAt, null);
  assert.equal(plan.snapshot.currentVisitStartedAt, 1_000);
}

function testCopyAndCardContract() {
  assert.equal(previousVisitCopy("en").label, "Previous visit");
  assert.equal(previousVisitCopy("hi").first, PREVIOUS_VISIT_COPY.hi.first);
  assert.equal(previousVisitCopy("zz").label, PREVIOUS_VISIT_COPY.en.label);
  assert.equal(previousVisitCopy(null).unavailable, "Not available");

  for (const lang of ["en", "hi", "ta", "te", "gu"] as const) {
    const catalog = JSON.parse(
      readFileSync(join(root, `src/i18n/locales/${lang}.json`), "utf8")
    ) as {
      you: { identityCard: { previousVisit: Record<string, string> } };
    };
    const copy = PREVIOUS_VISIT_COPY[lang];
    const row = catalog.you.identityCard.previousVisit;
    assert.equal(row.label, copy.label);
    assert.equal(row.first, copy.first);
    assert.equal(row.unavailable, copy.unavailable);
    assert.equal(row.a11yPrevious, copy.a11yPrevious.replace("{when}", "{{when}}"));
    assert.equal(row.a11yFirst, copy.a11yFirst);
    assert.equal(row.a11yUnavailable, copy.a11yUnavailable);
  }

  const card = readFileSync(
    join(root, "src/components/you/DigitalBusinessIdentityCard.tsx"),
    "utf8"
  );
  const share = readFileSync(
    join(root, "src/utils/profile/buildBusinessIdentityShareMessage.ts"),
    "utf8"
  );
  const screen = readFileSync(join(root, "src/components/ui/Screen.tsx"), "utf8");
  assert.ok(card.includes("usePreviousVisit"));
  assert.ok(card.includes("PreviousVisitMark"));
  assert.equal(card.includes("allowFontScaling={false}"), false);
  assert.equal(card.includes("tabBarInset"), false);
  assert.ok(card.includes("buildBusinessIdentityShareMessage"));
  assert.equal(share.includes("previousVisit"), false);
  assert.ok(screen.includes("tabBarInset"));
  const mark = readFileSync(
    join(root, "src/components/profile/PreviousVisitMark.tsx"),
    "utf8"
  );
  assert.equal(mark.includes("allowFontScaling={false}"), false);
}

async function main() {
  await testFirstVisitIgnoresAccountFields();
  await testSameSessionStaysStable();
  await testParallelOpenDoesNotAdvance();
  await testCapturesPreviousBeforeRecordingCurrent();
  await testGapBoundary();
  await testAuthSessionChangeCapturesVisitNotLogin();
  await testOwnerChangeDoesNotLeak();
  await testOrderingRejectsRewindAndFuture();
  await testMissingAndReadFailureAreHonest();
  await testColdStartPromotesStoredVisit();
  testPlanDoesNotCopyHeartbeatWhenOpen();
  testCopyAndCardContract();
  console.log("previousVisit.test.ts: ok");
}

void main();
