/**
 * Production reader and list runtime used by the legacy Letterhead screens.
 * Deferred loads prove a retired account cannot publish text or open a share.
 * Boundary: inert runtime. Not a mounted device and not an OS share sheet.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import type { FormDraftRecord } from "@/repositories/formDraftsRepository";
import type { SyncSessionToken } from "@/sync/syncSessionOwnership";
import { isShareSheetCancellation } from "@/services/pdf/shareCancellation";

import {
  createLegacyLetterheadListRuntime,
  createLegacyLetterheadReaderRuntime,
  maskLegacyList,
  maskLegacyReader,
  type LegacyLiveSession,
} from "./legacyLetterheadReadRuntime";
import type { LetterheadDocument, LetterheadDocumentInput } from "./types";

const root = path.join(import.meta.dirname, "../../..");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function token(uid: string, generation: number): SyncSessionToken {
  return { uid, generation };
}

function liveFor(session: SyncSessionToken | null): LegacyLiveSession {
  return { authUid: session?.uid ?? null, session };
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

function draft(id: string, uid: string, body: string): FormDraftRecord {
  return {
    id,
    userId: uid,
    draftKind: "letterhead",
    scopeKey: "letterhead_matter",
    entryId: null,
    title: body,
    status: "active",
    source: "user",
    payload: { ...input(body) },
    updatedAt: 1,
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

function textOf(body: string | undefined): string {
  return body ?? "";
}

test("reader drops A's document when B becomes current, including a late file check", async () => {
  const reads: { promise: Promise<LetterheadDocument | null>; resolve: (value: LetterheadDocument | null) => void }[] = [];
  const files: ReturnType<typeof deferred<boolean>>[] = [];
  let live = liveFor(token("a", 1));
  const shares: string[] = [];
  const runtime = createLegacyLetterheadReaderRuntime({
    getDocument: () => {
      const gate = deferred<LetterheadDocument | null>();
      reads.push(gate);
      return gate.promise;
    },
    getDraft: async () => null,
    fileExists: () => {
      const gate = deferred<boolean>();
      files.push(gate);
      return gate.promise;
    },
    sharePdf: async (uri) => {
      shares.push(uri);
    },
    isShareCancelled: isShareSheetCancellation,
    mapError: () => "failed",
    unavailableMessage: "unavailable",
    liveSession: () => live,
  });

  runtime.setIdentity(token("a", 1), { documentId: "doc-a" });
  assert.equal(reads.length, 1);
  reads[0]!.resolve(letter("doc-a", "a", "A-SECRET-BODY", "file:///a.pdf"));
  await flush();
  assert.equal(files.length, 1);
  live = liveFor(token("b", 2));
  runtime.setIdentity(token("b", 2), { documentId: "doc-b" });
  files[0]!.resolve(true);
  await flush();
  assert.equal(textOf(maskLegacyReader(runtime.snapshot(), live).view?.input.body), "");
  reads[1]!.resolve(letter("doc-b", "b", "B-BODY", null));
  await flush();
  const shown = maskLegacyReader(runtime.snapshot(), live);
  assert.equal(shown.view?.input.body, "B-BODY");
  assert.equal(shown.view?.pdfState, "none");
  assert.equal(shares.length, 0);
  assert.equal(JSON.stringify(shown).includes("A-SECRET-BODY"), false);
});

test("reader drops a draft and a same-account new generation", async () => {
  const drafts: ReturnType<typeof deferred<FormDraftRecord | null>>[] = [];
  let live = liveFor(token("a", 1));
  const runtime = createLegacyLetterheadReaderRuntime({
    getDocument: async () => null,
    getDraft: () => {
      const gate = deferred<FormDraftRecord | null>();
      drafts.push(gate);
      return gate.promise;
    },
    fileExists: async () => false,
    sharePdf: async () => {
      throw new Error("share should not run");
    },
    isShareCancelled: isShareSheetCancellation,
    mapError: () => "failed",
    unavailableMessage: "unavailable",
    liveSession: () => live,
  });

  runtime.setIdentity(token("a", 1), { draftId: "draft-a" });
  live = liveFor(null);
  runtime.setIdentity(null, { draftId: "draft-a" });
  assert.equal(maskLegacyReader(runtime.snapshot(), live).view, null);
  live = liveFor(token("a", 2));
  runtime.setIdentity(token("a", 2), { draftId: "draft-a" });
  drafts[0]!.resolve(draft("draft-a", "a", "OLD-GENERATION-SECRET"));
  await flush();
  assert.equal(maskLegacyReader(runtime.snapshot(), live).view, null);
  drafts[1]!.resolve(draft("draft-a", "a", "NEW-GENERATION"));
  await flush();
  assert.equal(maskLegacyReader(runtime.snapshot(), live).view?.input.body, "NEW-GENERATION");
  runtime.setIdentity(token("a", 2), { draftId: "draft-old" });
  runtime.setIdentity(token("a", 2), { draftId: "draft-new" });
  drafts[2]!.resolve(draft("draft-old", "a", "OLD-DRAFT-SECRET"));
  await flush();
  assert.equal(JSON.stringify(runtime.snapshot()).includes("OLD-DRAFT-SECRET"), false);
  drafts[3]!.resolve(draft("draft-new", "a", "NEXT-DRAFT"));
  await flush();
  assert.equal(runtime.snapshot().view?.input.body, "NEXT-DRAFT");
});

test("a new document id ignores the previous letter's late result and error", async () => {
  const reads: ReturnType<typeof deferred<LetterheadDocument | null>>[] = [];
  const live = liveFor(token("a", 1));
  const runtime = createLegacyLetterheadReaderRuntime({
    getDocument: () => {
      const gate = deferred<LetterheadDocument | null>();
      reads.push(gate);
      return gate.promise;
    },
    getDraft: async () => null,
    fileExists: async () => false,
    sharePdf: async () => undefined,
    isShareCancelled: isShareSheetCancellation,
    mapError: () => "failed",
    unavailableMessage: "unavailable",
    liveSession: () => live,
  });

  runtime.setIdentity(token("a", 1), { documentId: "one" });
  runtime.setIdentity(token("a", 1), { documentId: "two" });
  reads[1]!.resolve(letter("two", "a", "SECOND", null));
  await flush();
  reads[0]!.resolve(letter("one", "a", "OLD-SECRET", null));
  await flush();
  assert.equal(runtime.snapshot().view?.input.body, "SECOND");
  assert.equal(JSON.stringify(runtime.snapshot()).includes("OLD-SECRET"), false);
  runtime.setIdentity(token("a", 1), { documentId: "three" });
  runtime.setIdentity(token("a", 1), { documentId: "four" });
  reads[2]!.reject(new Error("OLD-ERROR"));
  await flush();
  assert.equal(runtime.snapshot().error, null);
  assert.equal(runtime.snapshot().recordKey, "doc:four");
  reads[3]!.resolve(letter("four", "a", "FOURTH", null));
  await flush();
  assert.equal(runtime.snapshot().view?.input.body, "FOURTH");
});

test("share rechecks the file and refuses a retired session before the share call", async () => {
  const shares: string[] = [];
  const fileGate = deferred<boolean>();
  let fileCalls = 0;
  let live = liveFor(token("a", 1));
  const runtime = createLegacyLetterheadReaderRuntime({
    getDocument: async () => letter("doc-a", "a", "A-SECRET-BODY", "file:///a.pdf"),
    getDraft: async () => null,
    fileExists: () => {
      fileCalls += 1;
      if (fileCalls === 1) return Promise.resolve(true);
      return fileGate.promise;
    },
    sharePdf: async (uri) => {
      shares.push(uri);
    },
    isShareCancelled: isShareSheetCancellation,
    mapError: () => "failed",
    unavailableMessage: "unavailable",
    liveSession: () => live,
  });

  runtime.setIdentity(token("a", 1), { documentId: "doc-a" });
  await flush();
  assert.equal(runtime.snapshot().view?.pdfState, "present");
  const sharing = runtime.shareLoadedPdf();
  live = liveFor(token("b", 2));
  runtime.setIdentity(token("b", 2), { documentId: "doc-b" });
  fileGate.resolve(true);
  assert.equal(await sharing, "refused");
  assert.deepEqual(shares, []);
  assert.equal(JSON.stringify(maskLegacyReader(runtime.snapshot(), live)).includes("A-SECRET-BODY"), false);
});

test("a share already handed to the system cannot write the previous account after it returns", async () => {
  const shareGate = deferred<void>();
  const later: ReturnType<typeof deferred<LetterheadDocument | null>>[] = [];
  let calls = 0;
  let live = liveFor(token("a", 1));
  const runtime = createLegacyLetterheadReaderRuntime({
    getDocument: () => {
      calls += 1;
      if (calls === 1) return Promise.resolve(letter("doc-a", "a", "A-SECRET-BODY", "file:///a.pdf"));
      const gate = deferred<LetterheadDocument | null>();
      later.push(gate);
      return gate.promise;
    },
    getDraft: async () => null,
    fileExists: async () => true,
    sharePdf: async () => {
      await shareGate.promise;
    },
    isShareCancelled: isShareSheetCancellation,
    mapError: () => "SHARE-FAILED",
    unavailableMessage: "unavailable",
    liveSession: () => live,
  });

  runtime.setIdentity(token("a", 1), { documentId: "doc-a" });
  await flush();
  const sharing = runtime.shareLoadedPdf();
  await flush();
  live = liveFor(token("b", 2));
  runtime.setIdentity(token("b", 2), { documentId: "doc-b" });
  shareGate.resolve();
  assert.equal(await sharing, "refused");
  const hidden = maskLegacyReader(runtime.snapshot(), live);
  assert.equal(hidden.view, null);
  assert.equal(hidden.error, null);
  assert.equal(JSON.stringify(hidden).includes("A-SECRET-BODY"), false);
  later[0]!.resolve(letter("doc-b", "b", "B-BODY", null));
  await flush();
  assert.equal(maskLegacyReader(runtime.snapshot(), live).view?.input.body, "B-BODY");
});

test("same-owner share, missing file, and cancelled share stay on that letter", async () => {
  const shares: string[] = [];
  let fileExistsResult = true;
  let cancelShare = false;
  const live = liveFor(token("a", 1));
  const runtime = createLegacyLetterheadReaderRuntime({
    getDocument: async () => letter("doc-a", "a", "MINE", "file:///mine.pdf"),
    getDraft: async () => null,
    fileExists: async () => fileExistsResult,
    sharePdf: async (uri) => {
      shares.push(uri);
      if (cancelShare) throw new Error("User cancelled the share sheet");
    },
    isShareCancelled: isShareSheetCancellation,
    mapError: () => "failed",
    unavailableMessage: "unavailable",
    liveSession: () => live,
  });

  runtime.setIdentity(token("a", 1), { documentId: "doc-a" });
  await flush();
  assert.equal(runtime.snapshot().view?.pdfState, "present");
  assert.equal(await runtime.shareLoadedPdf(), "shared");
  assert.deepEqual(shares, ["file:///mine.pdf"]);

  cancelShare = true;
  assert.equal(await runtime.shareLoadedPdf(), "cancelled");
  assert.equal(runtime.snapshot().error, null);
  assert.equal(runtime.snapshot().view?.input.body, "MINE");
  assert.equal(runtime.snapshot().sharing, false);
  assert.deepEqual(shares, ["file:///mine.pdf", "file:///mine.pdf"]);

  fileExistsResult = false;
  runtime.reload();
  await flush();
  assert.equal(runtime.snapshot().view?.pdfState, "missing");
  assert.equal(await runtime.shareLoadedPdf(), "refused");
  assert.deepEqual(shares, ["file:///mine.pdf", "file:///mine.pdf"]);

  fileExistsResult = true;
  runtime.reload();
  await flush();
  fileExistsResult = false;
  assert.equal(await runtime.shareLoadedPdf(), "missing");
  assert.equal(runtime.snapshot().view?.pdfState, "missing");
  assert.equal(runtime.snapshot().view?.input.body, "MINE");
  assert.deepEqual(shares, ["file:///mine.pdf", "file:///mine.pdf"]);
});

test("list hides A's rows from B and from A's next generation", async () => {
  const lists: ReturnType<typeof deferred<LetterheadDocument[]>>[] = [];
  let live = liveFor(token("a", 1));
  const opened: string[] = [];
  const runtime = createLegacyLetterheadListRuntime({
    list: () => {
      const gate = deferred<LetterheadDocument[]>();
      lists.push(gate);
      return gate.promise;
    },
    mapError: () => "failed",
    navigate: (id) => opened.push(id),
    liveSession: () => live,
  });

  runtime.setOwner(token("a", 1));
  live = liveFor(token("b", 2));
  runtime.setOwner(token("b", 2));
  lists[0]!.resolve([letter("a-row", "a", "A-LIST-SECRET", null)]);
  await flush();
  assert.equal(maskLegacyList(runtime.snapshot(), live).rows.length, 0);
  assert.equal(runtime.openRow("a-row"), false);
  lists[1]!.resolve([letter("b-row", "b", "B-LIST", null)]);
  await flush();
  const shown = maskLegacyList(runtime.snapshot(), live);
  assert.deepEqual(shown.rows.map((row) => row.body), ["B-LIST"]);
  assert.equal(JSON.stringify(shown).includes("A-LIST-SECRET"), false);
  assert.equal(runtime.openRow("b-row"), true);
  assert.deepEqual(opened, ["b-row"]);
  const keep = runtime.admitRowDelete("b-row");
  assert.ok(keep);
  assert.equal(runtime.rowDeleteStillCurrent(keep!), true);
  runtime.reload();
  assert.equal(runtime.rowDeleteStillCurrent(keep!), true);
  live = liveFor(null);
  runtime.setOwner(null);
  lists[2]!.resolve([letter("b-row", "b", "STALE-AFTER-LOGOUT", null)]);
  await flush();
  assert.equal(runtime.rowDeleteStillCurrent(keep!), false);
  assert.equal(runtime.openRow("b-row"), false);
  assert.equal(JSON.stringify(maskLegacyList(runtime.snapshot(), live)).includes("STALE-AFTER-LOGOUT"), false);
  live = liveFor(token("a", 3));
  runtime.setOwner(token("a", 3));
  lists[3]!.resolve([letter("a-row", "a", "AFTER-LOGIN", null)]);
  await flush();
  assert.deepEqual(
    maskLegacyList(runtime.snapshot(), live).rows.map((row) => row.body),
    ["AFTER-LOGIN"]
  );
});

test("production screens publish through the session runtime", () => {
  const create = fs.readFileSync(path.join(root, "app/(app)/letterhead/create.tsx"), "utf8");
  const history = fs.readFileSync(path.join(root, "app/(app)/letterhead/history.tsx"), "utf8");
  assert.match(create, /createLegacyLetterheadReaderRuntime/);
  assert.match(create, /maskLegacyReader/);
  assert.match(create, /shareLoadedPdf/);
  assert.match(create, /onPress=\{\(\) => void runtime\.shareLoadedPdf\(\)\}/);
  assert.match(history, /createLegacyLetterheadListRuntime/);
  assert.match(history, /maskLegacyList/);
  assert.match(history, /openRow\(item\.id\)/);
  assert.match(history, /confirmAdmit: \(\) => runtime\.rowDeleteStillCurrent\(admission\)/);
  assert.doesNotMatch(history, /buildLetterheadHtml|saveLetterheadCreateWithPdf/);
  const hook = fs.readFileSync(path.join(root, "src/hooks/useRecordDelete.ts"), "utf8");
  assert.match(hook, /if \(options\?\.confirmAdmit && !options\.confirmAdmit\(\)\) return/);
});
