/**
 * Screen adapter for the legacy reader and list.
 * The live session is read from syncSessionOwnership at the check.
 * A session object copied at render time is not updated between renders.
 * Boundary: adapter plus deferred file checks. Not a mounted device.
 * An operating-system share sheet that has already opened is not revoked.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { syncSessionOwnership } from "@/sync/syncSessionOwnership";
import { isShareSheetCancellation } from "@/services/pdf/shareCancellation";

import {
  bindLegacyListRow,
  bindLegacyReaderFrame,
  readLegacyScreenSession,
} from "./legacyLetterheadScreenSession";
import {
  createLegacyLetterheadListRuntime,
  createLegacyLetterheadReaderRuntime,
  type LegacyLiveSession,
} from "./legacyLetterheadReadRuntime";
import type { LetterheadDocument, LetterheadDocumentInput } from "./types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function input(body: string): LetterheadDocumentInput {
  return {
    title: body,
    date: 10,
    subject: body,
    body,
    closing: "Regards",
    name: "N",
    designation: "D",
    place: "P",
  };
}

function letter(id: string, uid: string, body: string, pdfUri: string | null): LetterheadDocument {
  return {
    id,
    userId: uid,
    ueid: "ue",
    title: body,
    input: input(body),
    templateRefUpdatedAt: null,
    pdfUri,
    saved: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

test.beforeEach(() => {
  syncSessionOwnership.resetForTests();
});

test("share does not open after the process session retires without a new render", async () => {
  const shareFile = deferred<boolean>();
  let fileCalls = 0;
  const shares: string[] = [];
  let authUid: string | null = "a";
  const runtime = createLegacyLetterheadReaderRuntime({
    getDocument: async () => letter("doc-a", "a", "A-SECRET-BODY", "file:///a.pdf"),
    getDraft: async () => null,
    fileExists: () => {
      fileCalls += 1;
      if (fileCalls === 1) return Promise.resolve(true);
      return shareFile.promise;
    },
    sharePdf: async (uri) => {
      shares.push(uri);
    },
    isShareCancelled: isShareSheetCancellation,
    mapError: () => "failed",
    unavailableMessage: "unavailable",
    liveSession: () => readLegacyScreenSession(authUid),
  });

  const first = syncSessionOwnership.beginSession("a");
  runtime.setIdentity(first, { documentId: "doc-a" });
  await flush();
  const frame = bindLegacyReaderFrame(runtime, authUid, { documentId: "doc-a" });
  assert.equal(frame.view?.input.body, "A-SECRET-BODY");
  const sharing = frame.share();
  syncSessionOwnership.endSession();
  shareFile.resolve(true);
  assert.equal(await sharing, "refused");
  assert.deepEqual(shares, []);
  assert.equal(authUid, "a");
});

test("a cached render session cannot share after the same account mints a new generation", async () => {
  const shareFile = deferred<boolean>();
  let fileCalls = 0;
  const shares: string[] = [];
  const first = syncSessionOwnership.beginSession("a");
  const cached: LegacyLiveSession = { authUid: "a", session: first };
  const runtime = createLegacyLetterheadReaderRuntime({
    getDocument: async () => letter("doc-a", "a", "A-SECRET-BODY", "file:///a.pdf"),
    getDraft: async () => null,
    fileExists: () => {
      fileCalls += 1;
      if (fileCalls === 1) return Promise.resolve(true);
      return shareFile.promise;
    },
    sharePdf: async (uri) => {
      shares.push(uri);
    },
    isShareCancelled: isShareSheetCancellation,
    mapError: () => "failed",
    unavailableMessage: "unavailable",
    liveSession: () => cached,
  });

  runtime.setIdentity(first, { documentId: "doc-a" });
  await flush();
  const press = runtime.admitShare();
  assert.ok(press);
  const sharing = runtime.shareLoadedPdf(press);
  syncSessionOwnership.beginSession("a");
  shareFile.resolve(true);
  assert.equal(await sharing, "refused");
  assert.deepEqual(shares, []);
  assert.equal(cached.session?.generation, first.generation);
});

test("a route change masks the previous letter before the identity effect", async () => {
  let authUid: string | null = "a";
  const runtime = createLegacyLetterheadReaderRuntime({
    getDocument: async (_uid, id) => letter(id, "a", id === "one" ? "ONE-SECRET" : "TWO", null),
    getDraft: async (_uid, id) => ({
      id,
      userId: "a",
      draftKind: "letterhead",
      scopeKey: "letterhead_matter",
      entryId: null,
      title: id,
      status: "active",
      source: "user",
      payload: { ...input(id === "draft-one" ? "DRAFT-SECRET" : "DRAFT-NEXT") },
      updatedAt: 1,
    }),
    fileExists: async () => false,
    sharePdf: async () => undefined,
    isShareCancelled: isShareSheetCancellation,
    mapError: () => "failed",
    unavailableMessage: "unavailable",
    liveSession: () => readLegacyScreenSession(authUid),
  });
  const session = syncSessionOwnership.beginSession("a");
  runtime.setIdentity(session, { documentId: "one" });
  await flush();
  const nextDocument = bindLegacyReaderFrame(runtime, authUid, { documentId: "two" });
  assert.equal(nextDocument.view, null);
  assert.equal(JSON.stringify(nextDocument.snap).includes("ONE-SECRET"), false);

  runtime.setIdentity(session, { draftId: "draft-one" });
  await flush();
  const nextDraft = bindLegacyReaderFrame(runtime, authUid, { draftId: "draft-two" });
  assert.equal(nextDraft.view, null);
  assert.equal(JSON.stringify(nextDraft.snap).includes("DRAFT-SECRET"), false);
  assert.equal(authUid, "a");
});

test("an old share or row callback does not act on the record loaded later", async () => {
  const shares: string[] = [];
  const opened: string[] = [];
  let authUid: string | null = "a";
  const reader = createLegacyLetterheadReaderRuntime({
    getDocument: async (_uid, id) =>
      letter(id, authUid ?? "a", id === "one" ? "ONE-SECRET" : "TWO-BODY", "file:///next.pdf"),
    getDraft: async () => null,
    fileExists: async () => true,
    sharePdf: async (uri) => {
      shares.push(uri);
    },
    isShareCancelled: isShareSheetCancellation,
    mapError: () => "failed",
    unavailableMessage: "unavailable",
    liveSession: () => readLegacyScreenSession(authUid),
  });
  const session = syncSessionOwnership.beginSession("a");
  reader.setIdentity(session, { documentId: "one" });
  await flush();
  const oldShare = bindLegacyReaderFrame(reader, authUid, { documentId: "one" }).share;
  reader.setIdentity(session, { documentId: "two" });
  await flush();
  assert.equal(bindLegacyReaderFrame(reader, authUid, { documentId: "two" }).view?.input.body, "TWO-BODY");
  assert.equal(await oldShare(), "refused");
  assert.deepEqual(shares, []);

  const list = createLegacyLetterheadListRuntime({
    list: async (uid) => [letter("same-id", uid, uid === "a" ? "A-ROW" : "B-ROW", null)],
    mapError: () => "failed",
    navigate: (id) => opened.push(id),
    liveSession: () => readLegacyScreenSession(authUid),
  });
  list.setOwner(session);
  await flush();
  const oldRow = bindLegacyListRow(list, "same-id");
  assert.equal(oldRow.deleteStillCurrent(), true);
  authUid = "b";
  const next = syncSessionOwnership.beginSession("b");
  list.setOwner(next);
  await flush();
  assert.equal(oldRow.open(), false);
  assert.equal(oldRow.deleteStillCurrent(), false);
  assert.deepEqual(opened, []);
  const current = bindLegacyListRow(list, "same-id");
  assert.equal(current.deleteStillCurrent(), true);
  assert.equal(current.open(), true);
  assert.deepEqual(opened, ["same-id"]);
});

test("unmount refuses a share whose file check is still pending", async () => {
  const shareFile = deferred<boolean>();
  let fileCalls = 0;
  const shares: string[] = [];
  const authUid: string | null = "a";
  const runtime = createLegacyLetterheadReaderRuntime({
    getDocument: async () => letter("doc-a", "a", "MINE", "file:///mine.pdf"),
    getDraft: async () => null,
    fileExists: () => {
      fileCalls += 1;
      if (fileCalls === 1) return Promise.resolve(true);
      return shareFile.promise;
    },
    sharePdf: async (uri) => {
      shares.push(uri);
    },
    isShareCancelled: isShareSheetCancellation,
    mapError: () => "failed",
    unavailableMessage: "unavailable",
    liveSession: () => readLegacyScreenSession(authUid),
  });
  runtime.setIdentity(syncSessionOwnership.beginSession("a"), { documentId: "doc-a" });
  await flush();
  const sharing = bindLegacyReaderFrame(runtime, authUid, { documentId: "doc-a" }).share();
  runtime.dispose();
  shareFile.resolve(true);
  assert.equal(await sharing, "refused");
  assert.deepEqual(shares, []);
});

test("the same owner can still read and share the letter that is on screen", async () => {
  const shares: string[] = [];
  const authUid: string | null = "a";
  const runtime = createLegacyLetterheadReaderRuntime({
    getDocument: async () => letter("doc-a", "a", "MINE", "file:///mine.pdf"),
    getDraft: async () => null,
    fileExists: async () => true,
    sharePdf: async (uri) => {
      shares.push(uri);
    },
    isShareCancelled: () => false,
    mapError: () => "failed",
    unavailableMessage: "unavailable",
    liveSession: () => readLegacyScreenSession(authUid),
  });
  runtime.setIdentity(syncSessionOwnership.beginSession("a"), { documentId: "doc-a" });
  await flush();
  const frame = bindLegacyReaderFrame(runtime, authUid, { documentId: "doc-a" });
  assert.equal(frame.view?.input.body, "MINE");
  assert.equal(await frame.share(), "shared");
  assert.deepEqual(shares, ["file:///mine.pdf"]);
});
