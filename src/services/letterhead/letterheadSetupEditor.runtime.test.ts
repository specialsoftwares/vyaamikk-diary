/**
 * Production setup editor runtime (used by setup.tsx) with deferred ports.
 * Exercises the real memory repository save path (same session checks as mock/firebase).
 * Does not claim already-issued remote writes can be cancelled.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { syncSessionOwnership } from "@/sync/syncSessionOwnership";

import {
  createLetterheadSetupEditorRuntime,
  type LetterheadSetupEditorRuntime,
} from "./letterheadSetupEditorRuntime";
import { createMemoryLetterheadRepository } from "./memoryLetterheadRepository";
import { DEFAULT_LETTERHEAD_MARGINS } from "./types";
import type { LetterheadConfig } from "./types";
import type { LetterheadCandidateImage } from "./letterheadCandidateImage";

function fakeConfig(partial: Partial<LetterheadConfig> & Pick<LetterheadConfig, "userId">): LetterheadConfig {
  const now = Date.now();
  return {
    imageWidth: 800,
    imageHeight: 1100,
    margins: { ...DEFAULT_LETTERHEAD_MARGINS },
    sourceType: "imported_image",
    generatedLayout: null,
    imageDataUri: "data:image/jpeg;base64,/9j/x",
    signatureDataUri: null,
    stampDataUri: null,
    defaultSenderName: null,
    defaultSenderTitle: null,
    defaultComplimentaryClose: null,
    repeatTemplateAllPages: true,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

function candidate(ownerUid: string, generation: number): LetterheadCandidateImage {
  return {
    localUri: `file:///tmp/${ownerUid}-tpl.jpg`,
    mimeType: "image/jpeg",
    width: 800,
    height: 1100,
    approxBytes: 12_000,
    ownerUid,
    sessionGeneration: generation,
    fileGeneration: "f1",
  };
}

function makeRuntime(repo = createMemoryLetterheadRepository()) {
  const retired: string[] = [];
  const runtime = createLetterheadSetupEditorRuntime({
    get: (uid) => repo.get(uid),
    save: (uid, patch, session) => repo.save(uid, patch, session),
    useLocalFileForSave: true,
    retireCandidate: (c) => {
      if (c) retired.push(c.localUri);
    },
    liveSession: () => syncSessionOwnership.capture(),
  });
  return { runtime, repo, retired };
}

async function seedAlice(repo: ReturnType<typeof createMemoryLetterheadRepository>) {
  syncSessionOwnership.resetForTests();
  const session = syncSessionOwnership.beginSession("alice");
  await repo.save(
    "alice",
    {
      sourceType: "imported_image",
      generatedLayout: null,
      imageDataUri: "data:image/jpeg;base64,/9j/alice",
      imageWidth: 800,
      imageHeight: 1100,
      margins: DEFAULT_LETTERHEAD_MARGINS,
      signatureDataUri: "data:image/png;base64,sigA",
      stampDataUri: "data:image/png;base64,stampA",
      defaultSenderName: "Alice Shop",
      defaultSenderTitle: "Owner",
      defaultComplimentaryClose: "Regards",
      repeatTemplateAllPages: true,
    },
    session
  );
  return session;
}

async function main() {
  // Screen wires the production runtime.
  {
    const setupSrc = fs.readFileSync(
      path.join(import.meta.dirname, "../../../app/(app)/letterhead/setup.tsx"),
      "utf8"
    );
    assert.match(setupSrc, /createLetterheadSetupEditorRuntime/);
    assert.match(setupSrc, /setOwner\(/);
    assert.match(setupSrc, /clearRetiredOwnerFields|runtime\.save/);
  }

  // A begins save → B becomes current and loads editor → A rejects.
  // A's completion must neither restore A's state nor clear B's.
  {
    syncSessionOwnership.resetForTests();
    const repo = createMemoryLetterheadRepository();
    const sessionA = syncSessionOwnership.beginSession("alice");
    await repo.save(
      "alice",
      {
        sourceType: "imported_image",
        generatedLayout: null,
        imageDataUri: "data:image/jpeg;base64,/9j/alice",
        imageWidth: 100,
        imageHeight: 100,
        margins: DEFAULT_LETTERHEAD_MARGINS,
        signatureDataUri: "data:image/png;base64,sigA",
        stampDataUri: null,
        defaultSenderName: "Alice",
        defaultSenderTitle: null,
        defaultComplimentaryClose: null,
        repeatTemplateAllPages: true,
      },
      sessionA
    );

    const saveHold = deferred<never>();
    let saveCalls = 0;
    const runtime = createLetterheadSetupEditorRuntime({
      get: (uid) => repo.get(uid),
      save: async (uid, patch, session) => {
        saveCalls += 1;
        if (saveCalls === 1) {
          await saveHold.promise;
          return repo.save(uid, patch, session);
        }
        return repo.save(uid, patch, session);
      },
      useLocalFileForSave: true,
      liveSession: () => syncSessionOwnership.capture(),
    });

    runtime.setOwner(sessionA);
    await flush();
    runtime.setCandidate(candidate("alice", sessionA.generation));
    assert.equal(runtime.snapshot().defaultName, "Alice");
    assert.equal(runtime.snapshot().signatureUri, "data:image/png;base64,sigA");

    const savePromise = runtime.save();
    await flush();

    // B becomes current and loads (no saved template).
    const sessionB = syncSessionOwnership.beginSession("bob");
    runtime.setOwner(sessionB);
    await flush();
    const bSnap = runtime.snapshot();
    assert.equal(bSnap.ownerKey, `bob#${sessionB.generation}`);
    assert.equal(bSnap.existing, null);
    assert.equal(bSnap.signatureUri, null);
    assert.equal(bSnap.defaultName, "");
    assert.equal(bSnap.candidate, null);

    // A rejects (session retired at repo boundary).
    saveHold.reject(new Error("should_not_write"));
    const aResult = await savePromise;
    assert.equal(aResult.navigate, false);
    await flush();

    // B's editor unchanged — not restored to Alice, not cleared by A's catch.
    const after = runtime.snapshot();
    assert.equal(after.ownerKey, `bob#${sessionB.generation}`);
    assert.equal(after.defaultName, "");
    assert.equal(after.signatureUri, null);
    assert.equal(after.existing, null);
    // Alice's stored template preserved in repo (issued write not claimed cancelled —
    // here the write never completed).
    assert.equal(repo.store.get("alice")?.defaultSenderName, "Alice");
    runtime.dispose();
  }

  // A begins save → B loads → A completes successfully (stale): no A restore onto B.
  {
    syncSessionOwnership.resetForTests();
    const repo = createMemoryLetterheadRepository();
    const sessionA = syncSessionOwnership.beginSession("alice");
    await repo.save(
      "alice",
      {
        sourceType: "imported_image",
        generatedLayout: null,
        imageDataUri: "data:image/jpeg;base64,/9j/a",
        imageWidth: 10,
        imageHeight: 10,
        margins: DEFAULT_LETTERHEAD_MARGINS,
        signatureDataUri: null,
        stampDataUri: null,
        defaultSenderName: "Alice",
        defaultSenderTitle: null,
        defaultComplimentaryClose: null,
        repeatTemplateAllPages: true,
      },
      sessionA
    );

    const saveHold = deferred<{
      uid: string;
      patch: Parameters<typeof repo.save>[1];
      session: Parameters<typeof repo.save>[2];
    }>();
    const runtime = createLetterheadSetupEditorRuntime({
      get: (uid) => repo.get(uid),
      save: async (uid, patch, session) => {
        const held = await saveHold.promise;
        return repo.save(held.uid, held.patch, held.session);
      },
      useLocalFileForSave: true,
      liveSession: () => syncSessionOwnership.capture(),
    });

    runtime.setOwner(sessionA);
    await flush();
    runtime.setCandidate(candidate("alice", sessionA.generation));
    const savePromise = runtime.save();
    await flush();

    const sessionB = syncSessionOwnership.beginSession("bob");
    runtime.setOwner(sessionB);
    await flush();
    runtime.setDefaultName("Bob Draft");
    assert.equal(runtime.snapshot().defaultName, "Bob Draft");

    // Complete A's held save against Alice's session (repo will reject — session retired).
    // Even if we force-resolve a synthetic saved config, runtime must ignore it.
    saveHold.resolve({
      uid: "alice",
      patch: {
        sourceType: "imported_image",
        generatedLayout: null,
        imageDataUri: "data:image/jpeg;base64,/9j/hijack",
        imageWidth: 1,
        imageHeight: 1,
        margins: DEFAULT_LETTERHEAD_MARGINS,
        signatureDataUri: null,
        stampDataUri: null,
        defaultSenderName: "Hijacked",
        defaultSenderTitle: null,
        defaultComplimentaryClose: null,
        repeatTemplateAllPages: true,
      },
      session: sessionA,
    });
    const result = await savePromise;
    assert.equal(result.navigate, false);
    await flush();
    assert.equal(runtime.snapshot().defaultName, "Bob Draft");
    assert.equal(runtime.snapshot().ownerKey, `bob#${sessionB.generation}`);
    runtime.dispose();
  }

  // A→logout→A: old generation cannot publish; new generation loads cleanly.
  {
    const { runtime, repo } = makeRuntime();
    await seedAlice(repo);
    const sessionA1 = syncSessionOwnership.capture()!;
    runtime.setOwner(sessionA1);
    await flush();
    assert.equal(runtime.snapshot().defaultName, "Alice Shop");

    syncSessionOwnership.endSession();
    const sessionA2 = syncSessionOwnership.beginSession("alice");
    runtime.setOwner(sessionA2);
    await flush();
    assert.equal(runtime.snapshot().ownerKey, `alice#${sessionA2.generation}`);
    assert.equal(runtime.snapshot().defaultName, "Alice Shop");
    assert.notEqual(sessionA1.generation, sessionA2.generation);

    // Stale A1 clear must not wipe A2.
    runtime.clearRetiredOwnerFields(sessionA1);
    assert.equal(runtime.snapshot().defaultName, "Alice Shop");
    runtime.dispose();
  }

  // B has no saved template — null load clears fields for B.
  {
    syncSessionOwnership.resetForTests();
    const repo = createMemoryLetterheadRepository();
    const sessionA = syncSessionOwnership.beginSession("alice");
    await repo.save(
      "alice",
      {
        sourceType: "imported_image",
        generatedLayout: null,
        imageDataUri: "data:image/jpeg;base64,/9j/a",
        imageWidth: 10,
        imageHeight: 10,
        margins: DEFAULT_LETTERHEAD_MARGINS,
        signatureDataUri: "data:image/png;base64,sig",
        stampDataUri: "data:image/png;base64,st",
        defaultSenderName: "Alice",
        defaultSenderTitle: "T",
        defaultComplimentaryClose: "C",
        repeatTemplateAllPages: true,
      },
      sessionA
    );
    const runtime = createLetterheadSetupEditorRuntime({
      get: (uid) => repo.get(uid),
      save: (uid, patch, session) => repo.save(uid, patch, session),
      liveSession: () => syncSessionOwnership.capture(),
    });
    runtime.setOwner(sessionA);
    await flush();
    assert.equal(runtime.snapshot().signatureUri, "data:image/png;base64,sig");

    const sessionB = syncSessionOwnership.beginSession("bob");
    runtime.setOwner(sessionB);
    await flush();
    assert.equal(runtime.snapshot().existing, null);
    assert.equal(runtime.snapshot().signatureUri, null);
    assert.equal(runtime.snapshot().stampUri, null);
    assert.equal(runtime.snapshot().defaultName, "");
    assert.equal(runtime.snapshot().defaultTitle, "");
    assert.equal(runtime.snapshot().defaultClose, "");
    runtime.dispose();
  }

  // Live owner save succeeds via real repository session checks.
  {
    const { runtime, repo } = makeRuntime();
    syncSessionOwnership.resetForTests();
    const session = syncSessionOwnership.beginSession("alice");
    runtime.setOwner(session);
    await flush();
    runtime.setCandidate(candidate("alice", session.generation));
    runtime.setDefaultName("Live Alice");
    runtime.setSignatureUri("data:image/png;base64,s");
    const result = await runtime.save();
    assert.equal(result.navigate, true);
    assert.equal(repo.store.get("alice")?.defaultSenderName, "Live Alice");
    assert.equal(runtime.snapshot().candidate, null);
    assert.equal(runtime.snapshot().existing?.signatureDataUri, "data:image/png;base64,s");
    runtime.dispose();
  }

  // Ownership failure on save preserves previously saved template in repository.
  {
    const { runtime, repo } = makeRuntime();
    await seedAlice(repo);
    const sessionA = syncSessionOwnership.capture()!;
    runtime.setOwner(sessionA);
    await flush();
    runtime.setCandidate(candidate("alice", sessionA.generation));
    runtime.setDefaultName("Should Not Persist");

    syncSessionOwnership.beginSession("bob");
    const result = await runtime.save();
    assert.equal(result.navigate, false);
    assert.equal(repo.store.get("alice")?.defaultSenderName, "Alice Shop");
    runtime.dispose();
  }

  // --- Initial load must not erase concurrent edits (revision policy) ---

  // Null load after concurrent edits: keep candidate/signature; do not retire.
  {
    syncSessionOwnership.resetForTests();
    const getHold = deferred<null>();
    const retired: string[] = [];
    const session = syncSessionOwnership.beginSession("alice");
    const runtime = createLetterheadSetupEditorRuntime({
      get: async () => getHold.promise,
      save: async () => {
        throw new Error("save_not_expected");
      },
      retireCandidate: (c) => {
        if (c) retired.push(c.localUri);
      },
      liveSession: () => syncSessionOwnership.capture(),
    });
    runtime.setOwner(session);
    await flush();
    assert.equal(runtime.snapshot().loading, true);

    const cand = candidate("alice", session.generation);
    runtime.setCandidate(cand);
    runtime.setSignatureUri("data:image/png;base64,sigEdit");
    runtime.setMargins({ topPct: 42, bottomPct: 42, leftPct: 20, rightPct: 20 });

    getHold.resolve(null);
    await flush();
    const snap = runtime.snapshot();
    assert.equal(snap.loading, false);
    assert.equal(snap.existing, null);
    assert.equal(snap.candidate?.localUri, cand.localUri);
    assert.equal(snap.signatureUri, "data:image/png;base64,sigEdit");
    assert.equal(snap.margins.topPct, 42);
    assert.equal(retired.length, 0);
    runtime.dispose();
  }

  // Non-null delayed load after edits: refresh existing baseline only.
  {
    syncSessionOwnership.resetForTests();
    const getHold = deferred<LetterheadConfig | null>();
    const session = syncSessionOwnership.beginSession("alice");
    const runtime = createLetterheadSetupEditorRuntime({
      get: async () => getHold.promise,
      save: async () => {
        throw new Error("save_not_expected");
      },
      liveSession: () => syncSessionOwnership.capture(),
    });
    runtime.setOwner(session);
    await flush();
    runtime.setCandidate(candidate("alice", session.generation));
    runtime.setSignatureUri("data:image/png;base64,newSig");
    runtime.setDefaultName("Edited Name");
    runtime.setMargins({ topPct: 55, bottomPct: 10, leftPct: 10, rightPct: 10 });

    getHold.resolve(
      fakeConfig({
        userId: "alice",
        imageDataUri: "data:image/jpeg;base64,/9j/saved",
        margins: { topPct: 1, bottomPct: 1, leftPct: 1, rightPct: 1 },
        signatureDataUri: "data:image/png;base64,oldSig",
        stampDataUri: "data:image/png;base64,oldStamp",
        defaultSenderName: "Saved Name",
        defaultSenderTitle: "Saved Title",
        defaultComplimentaryClose: "Saved Close",
      })
    );
    await flush();
    const snap = runtime.snapshot();
    assert.equal(snap.existing?.defaultSenderName, "Saved Name");
    assert.equal(snap.defaultName, "Edited Name");
    assert.equal(snap.signatureUri, "data:image/png;base64,newSig");
    assert.equal(snap.margins.topPct, 55);
    assert.ok(snap.candidate);
    runtime.dispose();
  }

  // Load failure: surface load_failed; keep edits; retry reachable via load().
  {
    syncSessionOwnership.resetForTests();
    let failOnce = true;
    const getHold = deferred<null>();
    const session = syncSessionOwnership.beginSession("alice");
    const runtime = createLetterheadSetupEditorRuntime({
      get: async () => {
        if (failOnce) {
          failOnce = false;
          throw new Error("network");
        }
        return getHold.promise;
      },
      save: async () => {
        throw new Error("save_not_expected");
      },
      liveSession: () => syncSessionOwnership.capture(),
    });
    runtime.setOwner(session);
    await flush();
    runtime.setDefaultName("Kept");
    await flush();
    assert.equal(runtime.snapshot().error, "load_failed");
    assert.equal(runtime.snapshot().defaultName, "Kept");

    const retry = runtime.load();
    await flush();
    assert.equal(runtime.snapshot().loading, true);
    getHold.resolve(null);
    await retry;
    await flush();
    assert.equal(runtime.snapshot().error, null);
    assert.equal(runtime.snapshot().defaultName, "Kept");
    assert.equal(runtime.snapshot().existing, null);
    runtime.dispose();
  }

  // Owner retirement while load pending: stale null must not clear the new owner.
  {
    syncSessionOwnership.resetForTests();
    const getHold = deferred<null>();
    let getCalls = 0;
    const sessionA = syncSessionOwnership.beginSession("alice");
    const runtime = createLetterheadSetupEditorRuntime({
      get: async (uid) => {
        getCalls += 1;
        if (uid === "alice") return getHold.promise;
        return null;
      },
      save: async () => {
        throw new Error("save_not_expected");
      },
      liveSession: () => syncSessionOwnership.capture(),
    });
    runtime.setOwner(sessionA);
    await flush();
    runtime.setSignatureUri("data:image/png;base64,a");

    const sessionB = syncSessionOwnership.beginSession("bob");
    runtime.setOwner(sessionB);
    await flush();
    runtime.setDefaultName("Bob");

    getHold.resolve(null);
    await flush();
    assert.equal(runtime.snapshot().ownerKey, `bob#${sessionB.generation}`);
    assert.equal(runtime.snapshot().defaultName, "Bob");
    assert.equal(runtime.snapshot().signatureUri, null);
    assert.ok(getCalls >= 2);
    runtime.dispose();
  }

  // --- Single-flight save (synchronous, owner/attempt-bound) ---

  // Immediate double submission → one ports.save.
  {
    syncSessionOwnership.resetForTests();
    const saveHold = deferred<import("./types").LetterheadConfig>();
    let saveCalls = 0;
    const session = syncSessionOwnership.beginSession("alice");
    const runtime = createLetterheadSetupEditorRuntime({
      get: async () => null,
      save: async () => {
        saveCalls += 1;
        return saveHold.promise;
      },
      useLocalFileForSave: true,
      liveSession: () => syncSessionOwnership.capture(),
    });
    runtime.setOwner(session);
    await flush();
    runtime.setCandidate(candidate("alice", session.generation));

    const p1 = runtime.save();
    const p2 = runtime.save();
    await flush();
    assert.equal(saveCalls, 1);

    saveHold.resolve(
      fakeConfig({
        userId: "alice",
        imageDataUri: "file:///tmp/alice-tpl.jpg",
      })
    );
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(r1.navigate, true);
    assert.equal(r2.navigate, false);
    assert.equal(saveCalls, 1);
    runtime.dispose();
  }

  // Failure then retry: second save is allowed after flight clears.
  {
    syncSessionOwnership.resetForTests();
    let saveCalls = 0;
    const session = syncSessionOwnership.beginSession("alice");
    const runtime = createLetterheadSetupEditorRuntime({
      get: async () => null,
      save: async () => {
        saveCalls += 1;
        if (saveCalls === 1) throw new Error("transient");
        return fakeConfig({
          userId: "alice",
          imageDataUri: "file:///tmp/alice-tpl.jpg",
          defaultSenderName: "Ok",
        });
      },
      useLocalFileForSave: true,
      liveSession: () => syncSessionOwnership.capture(),
    });
    runtime.setOwner(session);
    await flush();
    runtime.setCandidate(candidate("alice", session.generation));
    assert.equal((await runtime.save()).navigate, false);
    assert.equal(runtime.snapshot().error, "transient");
    assert.equal((await runtime.save()).navigate, true);
    assert.equal(saveCalls, 2);
    runtime.dispose();
  }

  // Ownership change while save pending: old finally must not unlock/alter new owner.
  {
    syncSessionOwnership.resetForTests();
    const saveHold = deferred<never>();
    let saveCalls = 0;
    const sessionA = syncSessionOwnership.beginSession("alice");
    const runtime = createLetterheadSetupEditorRuntime({
      get: async () => null,
      save: async () => {
        saveCalls += 1;
        if (saveCalls === 1) {
          await saveHold.promise;
          throw new Error("alice_should_not_complete");
        }
        return fakeConfig({
          userId: "bob",
          imageDataUri: "file:///tmp/bob-tpl.jpg",
          imageWidth: 1,
          imageHeight: 1,
          defaultSenderName: "Bob Saved",
        });
      },
      useLocalFileForSave: true,
      liveSession: () => syncSessionOwnership.capture(),
    });
    runtime.setOwner(sessionA);
    await flush();
    runtime.setCandidate(candidate("alice", sessionA.generation));
    const aSave = runtime.save();
    await flush();
    assert.equal(saveCalls, 1);

    const sessionB = syncSessionOwnership.beginSession("bob");
    runtime.setOwner(sessionB);
    await flush();
    runtime.setCandidate(candidate("bob", sessionB.generation));
    const bSave = runtime.save();
    await flush();
    assert.equal(saveCalls, 2);

    saveHold.reject(new Error("alice_aborted"));
    assert.equal((await aSave).navigate, false);
    assert.equal((await bSave).navigate, true);
    assert.equal(runtime.snapshot().ownerKey, `bob#${sessionB.generation}`);
    assert.equal(runtime.snapshot().existing?.defaultSenderName, "Bob Saved");
    assert.equal(runtime.snapshot().saving, false);
    runtime.dispose();
  }

  console.log("letterheadSetupEditor.runtime.test.ts: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
