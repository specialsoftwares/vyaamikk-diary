/**
 * Deferred ownership through save boundary (in-memory repo mirroring mock/firebase checks).
 * Covers A→B and A→logout→A. Does not claim already-issued remote writes can be cancelled.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  assertDispatchedSession,
  syncSessionOwnership,
  type SyncSessionToken,
} from "@/sync/syncSessionOwnership";

import { validateWritingMargins } from "./letterheadGeneratedLayout";
import { DEFAULT_LETTERHEAD_MARGINS, type LetterheadConfig } from "./types";

const patch = {
  sourceType: "generated_layout" as const,
  generatedLayout: {
    version: 1 as const,
    logoAlign: "right" as const,
    appearance: "mono" as const,
    businessName: "Shop",
    address: null,
    contact: null,
    gstin: null,
    logoUri: null,
  },
  imageDataUri: null,
  imageWidth: 0,
  imageHeight: 0,
  margins: DEFAULT_LETTERHEAD_MARGINS,
  signatureDataUri: null,
  stampDataUri: null,
  defaultSenderName: "Shop",
  defaultSenderTitle: null,
  defaultComplimentaryClose: null,
  repeatTemplateAllPages: true,
};

/** Mirrors mock/firebase session rechecks around awaited preparation + write. */
async function saveWithOwnership(
  userId: string,
  body: typeof patch,
  session?: SyncSessionToken | null,
  store: Map<string, LetterheadConfig> = new Map()
): Promise<LetterheadConfig> {
  assertDispatchedSession(session, userId);
  if (!validateWritingMargins(body.margins).ok) throw new Error("bad_margins");
  await Promise.resolve(); // awaited preparation
  assertDispatchedSession(session, userId);
  const now = Date.now();
  const existing = store.get(userId) ?? null;
  const next: LetterheadConfig = {
    ...body,
    userId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  assertDispatchedSession(session, userId);
  store.set(userId, next);
  assertDispatchedSession(session, userId);
  return next;
}

test("save succeeds for live owner session", async () => {
  syncSessionOwnership.resetForTests();
  const session = syncSessionOwnership.beginSession("alice");
  const saved = await saveWithOwnership("alice", patch, session);
  assert.equal(saved.userId, "alice");
  assert.equal(saved.generatedLayout?.logoAlign, "right");
});

test("A→B: retired A session cannot save after B begins", async () => {
  syncSessionOwnership.resetForTests();
  const sessionA = syncSessionOwnership.beginSession("alice");
  syncSessionOwnership.beginSession("bob");
  await assert.rejects(() => saveWithOwnership("alice", patch, sessionA));
});

test("A→logout→A: old generation cannot save after re-login", async () => {
  syncSessionOwnership.resetForTests();
  const sessionA1 = syncSessionOwnership.beginSession("alice");
  syncSessionOwnership.endSession();
  const sessionA2 = syncSessionOwnership.beginSession("alice");
  assert.notEqual(sessionA1.generation, sessionA2.generation);
  await assert.rejects(() => saveWithOwnership("alice", patch, sessionA1));
  const ok = await saveWithOwnership("alice", patch, sessionA2);
  assert.equal(ok.userId, "alice");
});

test("explicit null session fails closed", async () => {
  syncSessionOwnership.resetForTests();
  syncSessionOwnership.beginSession("alice");
  await assert.rejects(() => saveWithOwnership("alice", patch, null));
});

test("ownership failure preserves previously saved template", async () => {
  syncSessionOwnership.resetForTests();
  const store = new Map<string, LetterheadConfig>();
  const sessionA = syncSessionOwnership.beginSession("alice");
  const prior = await saveWithOwnership("alice", patch, sessionA, store);
  assert.equal(store.get("alice")?.updatedAt, prior.updatedAt);

  const sessionStale = sessionA;
  syncSessionOwnership.beginSession("bob");
  await assert.rejects(() =>
    saveWithOwnership(
      "alice",
      {
        ...patch,
        generatedLayout: {
          ...patch.generatedLayout!,
          businessName: "Hijacked",
        },
      },
      sessionStale,
      store
    )
  );
  assert.equal(store.get("alice")?.generatedLayout?.businessName, "Shop");
  assert.equal(store.get("alice")?.updatedAt, prior.updatedAt);
});

test("setup/generate/firebase source pass session into save", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const setup = fs.readFileSync(
    path.join(import.meta.dirname, "../../../app/(app)/letterhead/setup.tsx"),
    "utf8"
  );
  const generate = fs.readFileSync(
    path.join(import.meta.dirname, "../../../app/(app)/letterhead/generate.tsx"),
    "utf8"
  );
  const firebase = fs.readFileSync(
    path.join(import.meta.dirname, "firebase.ts"),
    "utf8"
  );
  assert.match(setup, /\.save\(\s*user\.uid,\s*\{[\s\S]*\},\s*session\s*\)/);
  assert.match(generate, /\.save\(\s*user\.uid,\s*\{[\s\S]*\},\s*session\s*\)/);
  assert.match(firebase, /uploadLetterheadImage\(\s*userId,\s*incomingImage,\s*undefined,\s*session\s*\)/);
  assert.match(firebase, /assertDispatchedSession\(session, userId\)/);
  assert.match(setup, /clearRetiredEditorState/);
  assert.match(setup, /captureAsset[\s\S]*mayIssueRemoteWork/);
  assert.match(generate, /Stale completion/);
});
