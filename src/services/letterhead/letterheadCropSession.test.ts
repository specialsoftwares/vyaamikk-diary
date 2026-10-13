/**
 * Production crop controller (setup.tsx) with deferred native-crop results.
 * Already-issued native work is not cancelled; a late result must not apply.
 */

import assert from "node:assert/strict";

import { syncSessionOwnership } from "@/sync/syncSessionOwnership";

import { createLetterheadCropController } from "./letterheadCropSession";
import type { LetterheadCropPendingView } from "./letterheadCropSession";
import { createLetterheadSetupEditorRuntime } from "./letterheadSetupEditorRuntime";
import type { LetterheadCandidateImage } from "./letterheadCandidateImage";
import { writingMarginsForHeader } from "./letterheadPlacement";
import { DEFAULT_LETTERHEAD_MARGINS } from "./types";
import type { TemplateWarningKey } from "./letterheadTemplateService";

const SAVED_TEMPLATE = "file:///saved-template.jpg";
const HISTORICAL_LETTER = "file:///historical-letter.jpg";

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
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function image(uid: string, generation: number, uri: string): LetterheadCandidateImage {
  return {
    localUri: uri,
    mimeType: "image/jpeg",
    width: 1200,
    height: 2000,
    approxBytes: 20_000,
    ownerUid: uid,
    sessionGeneration: generation,
    fileGeneration: "f1",
  };
}

function croppedFrom(source: LetterheadCandidateImage, uri: string): LetterheadCandidateImage {
  return {
    ...source,
    localUri: uri,
    height: 400,
    fileGeneration: `${source.fileGeneration}-crop`,
  };
}

function harness() {
  const retired: string[] = [];
  const errors: string[] = [];
  let pending: LetterheadCropPendingView | null = null;
  let cropCalls = 0;
  const holds: ReturnType<typeof deferred<LetterheadCandidateImage>>[] = [];
  const runtime = createLetterheadSetupEditorRuntime({
    get: async () => null,
    save: async () => {
      throw new Error("save_not_expected");
    },
    retireCandidate: (c) => {
      if (c) retired.push(c.localUri);
    },
    liveSession: () => syncSessionOwnership.capture(),
  });
  const crop = createLetterheadCropController({
    liveOwner: () => {
      const session = syncSessionOwnership.capture();
      return session ? { uid: session.uid, generation: session.generation } : null;
    },
    editorCandidate: () => runtime.snapshot().candidate,
    protectedUris: () => new Set([SAVED_TEMPLATE, HISTORICAL_LETTER]),
    cropWorkingCopy: () => {
      cropCalls += 1;
      const hold = deferred<LetterheadCandidateImage>();
      holds.push(hold);
      return hold.promise;
    },
    showPending: (view) => {
      pending = view;
    },
    showError: (code) => {
      errors.push(code);
    },
    applyAcceptedHeader: (next, warnings, retain) => {
      runtime.setCandidate(next, warnings, retain);
      runtime.setPlacement("header_logo", writingMarginsForHeader(next.width, next.height));
    },
    applyCompletePage: (source, warnings) => {
      if (source && runtime.snapshot().candidate?.localUri !== source.localUri) {
        runtime.setCandidate(source, warnings);
      }
      runtime.setPlacement("complete_page", { ...DEFAULT_LETTERHEAD_MARGINS });
    },
    retireFile: (file) => {
      retired.push(file.localUri);
    },
  });
  return {
    retired,
    errors,
    crop,
    runtime,
    holds,
    calls: () => cropCalls,
    pending: () => pending,
  };
}

function assertUntouched(
  runtime: ReturnType<typeof createLetterheadSetupEditorRuntime>,
  uri: string,
  warnings: TemplateWarningKey[],
  placement: "header_logo" | "complete_page"
): void {
  const snap = runtime.snapshot();
  assert.equal(snap.candidate?.localUri, uri);
  assert.deepEqual(snap.templateWarnings, warnings);
  assert.equal(snap.placement, placement);
}

function assertProtected(retired: string[]): void {
  assert.equal(retired.includes(SAVED_TEMPLATE), false);
  assert.equal(retired.includes(HISTORICAL_LETTER), false);
}

async function main(): Promise<void> {
  // Existing candidate → Use header → Cancel keeps the editor file.
  {
    syncSessionOwnership.resetForTests();
    const session = syncSessionOwnership.beginSession("alice");
    const h = harness();
    h.crop.bindOwner({ uid: session.uid, generation: session.generation });
    h.runtime.setOwner(session);
    await flush();
    const editor = image("alice", session.generation, "file:///editor-alice.jpg");
    h.runtime.setCandidate(editor, ["letterhead.warnLandscape"]);
    h.crop.stage(editor, ["letterhead.warnLandscape"], "borrowed");
    assert.equal(h.pending()?.source.localUri, editor.localUri);
    h.crop.cancel();
    assert.equal(h.pending(), null);
    assertUntouched(h.runtime, editor.localUri, ["letterhead.warnLandscape"], "complete_page");
    assert.equal(h.retired.includes(editor.localUri), false);
    assertProtected(h.retired);
    h.runtime.dispose();
  }

  // Accept with processing delayed → Cancel. Late output is dropped.
  {
    syncSessionOwnership.resetForTests();
    const session = syncSessionOwnership.beginSession("alice");
    const h = harness();
    h.crop.bindOwner({ uid: session.uid, generation: session.generation });
    h.runtime.setOwner(session);
    await flush();
    const editor = image("alice", session.generation, "file:///editor-alice.jpg");
    h.runtime.setCandidate(editor, ["letterhead.warnLandscape"]);
    h.crop.stage(editor, ["letterhead.warnLandscape"], "borrowed");
    h.crop.accept();
    assert.equal(h.calls(), 1);
    h.crop.cancel();
    assert.equal(h.pending(), null);
    assert.equal(h.retired.includes(editor.localUri), false);
    const output = croppedFrom(editor, "file:///crop-out.jpg");
    h.holds[0].resolve(output);
    await flush();
    assertUntouched(h.runtime, editor.localUri, ["letterhead.warnLandscape"], "complete_page");
    assert.equal(h.errors.length, 0);
    assert.equal(h.retired.includes(output.localUri), true);
    assert.equal(h.retired.includes(editor.localUri), false);
    assertProtected(h.retired);
    h.runtime.dispose();
  }

  // A disposable source stays until the issued crop settles, then both files go.
  {
    syncSessionOwnership.resetForTests();
    const session = syncSessionOwnership.beginSession("alice");
    const h = harness();
    h.crop.bindOwner({ uid: session.uid, generation: session.generation });
    h.runtime.setOwner(session);
    await flush();
    const editor = image("alice", session.generation, "file:///editor-alice.jpg");
    h.runtime.setCandidate(editor, ["letterhead.warnLandscape"]);
    const fresh = image("alice", session.generation, "file:///gallery-new.jpg");
    h.crop.stage(fresh, [], "disposable");
    h.crop.accept();
    h.crop.cancel();
    assert.equal(h.retired.includes(fresh.localUri), false);
    assert.equal(h.retired.includes(editor.localUri), false);
    const output = croppedFrom(fresh, "file:///gallery-crop.jpg");
    h.holds[0].resolve(output);
    await flush();
    assertUntouched(h.runtime, editor.localUri, ["letterhead.warnLandscape"], "complete_page");
    assert.equal(h.errors.length, 0);
    assert.equal(h.retired.includes(fresh.localUri), true);
    assert.equal(h.retired.includes(output.localUri), true);
    assert.equal(h.retired.includes(editor.localUri), false);
    assertProtected(h.retired);
    h.runtime.dispose();
  }

  // Cancel before any native work retires only the disposable file.
  {
    syncSessionOwnership.resetForTests();
    const session = syncSessionOwnership.beginSession("alice");
    const h = harness();
    h.crop.bindOwner({ uid: session.uid, generation: session.generation });
    h.runtime.setOwner(session);
    await flush();
    const editor = image("alice", session.generation, "file:///editor-alice.jpg");
    h.runtime.setCandidate(editor, ["letterhead.warnLandscape"]);
    const fresh = image("alice", session.generation, "file:///gallery-new.jpg");
    h.crop.stage(fresh, [], "disposable");
    h.crop.cancel();
    assert.equal(h.pending(), null);
    assert.equal(h.retired.includes(fresh.localUri), true);
    assert.equal(h.retired.includes(editor.localUri), false);
    assert.equal(h.calls(), 0);
    assertProtected(h.retired);
    h.runtime.dispose();
  }

  // A protected saved-template URI staged by mistake is not deleted.
  {
    syncSessionOwnership.resetForTests();
    const session = syncSessionOwnership.beginSession("alice");
    const h = harness();
    h.crop.bindOwner({ uid: session.uid, generation: session.generation });
    h.runtime.setOwner(session);
    await flush();
    const saved = image("alice", session.generation, SAVED_TEMPLATE);
    h.crop.stage(saved, [], "disposable");
    h.crop.cancel();
    assert.equal(h.retired.includes(SAVED_TEMPLATE), false);
    assertProtected(h.retired);
    h.runtime.dispose();
  }

  // Delayed Accept → complete letterhead. The late crop does not replace it.
  {
    syncSessionOwnership.resetForTests();
    const session = syncSessionOwnership.beginSession("alice");
    const h = harness();
    h.crop.bindOwner({ uid: session.uid, generation: session.generation });
    h.runtime.setOwner(session);
    await flush();
    const editor = image("alice", session.generation, "file:///editor-alice.jpg");
    h.runtime.setCandidate(editor, ["letterhead.warnLandscape"]);
    h.crop.stage(editor, ["letterhead.warnLandscape"], "borrowed");
    h.crop.accept();
    h.crop.useComplete();
    assert.equal(h.pending(), null);
    assert.equal(h.runtime.snapshot().placement, "complete_page");
    const output = croppedFrom(editor, "file:///crop-out.jpg");
    h.holds[0].resolve(output);
    await flush();
    assertUntouched(h.runtime, editor.localUri, ["letterhead.warnLandscape"], "complete_page");
    assert.equal(h.errors.length, 0);
    assert.equal(h.retired.includes(output.localUri), true);
    assert.equal(h.retired.includes(editor.localUri), false);
    assertProtected(h.retired);
    h.runtime.dispose();
  }

  // Delayed Accept → another image. The newer choice stays; the old output goes.
  {
    syncSessionOwnership.resetForTests();
    const session = syncSessionOwnership.beginSession("alice");
    const h = harness();
    h.crop.bindOwner({ uid: session.uid, generation: session.generation });
    h.runtime.setOwner(session);
    await flush();
    const editor = image("alice", session.generation, "file:///editor-alice.jpg");
    h.runtime.setCandidate(editor, ["letterhead.warnLandscape"]);
    h.crop.stage(editor, ["letterhead.warnLandscape"], "borrowed");
    h.crop.accept();
    const other = image("alice", session.generation, "file:///other.jpg");
    h.crop.stage(other, ["letterhead.warnTooLarge"], "disposable");
    assert.equal(h.pending()?.source.localUri, other.localUri);
    const output = croppedFrom(editor, "file:///crop-out.jpg");
    h.holds[0].resolve(output);
    await flush();
    assert.equal(h.pending()?.source.localUri, other.localUri);
    assertUntouched(h.runtime, editor.localUri, ["letterhead.warnLandscape"], "complete_page");
    assert.equal(h.errors.length, 0);
    assert.equal(h.retired.includes(output.localUri), true);
    assert.equal(h.retired.includes(other.localUri), false);
    assert.equal(h.retired.includes(editor.localUri), false);
    assertProtected(h.retired);
    h.runtime.dispose();
  }

  // Two immediate Accept presses start one native crop.
  {
    syncSessionOwnership.resetForTests();
    const session = syncSessionOwnership.beginSession("alice");
    const h = harness();
    h.crop.bindOwner({ uid: session.uid, generation: session.generation });
    h.runtime.setOwner(session);
    await flush();
    const editor = image("alice", session.generation, "file:///editor-alice.jpg");
    h.runtime.setCandidate(editor, ["letterhead.warnLandscape"]);
    h.crop.stage(editor, ["letterhead.warnLandscape"], "borrowed");
    h.crop.accept();
    h.crop.accept();
    assert.equal(h.calls(), 1);
    assert.equal(h.holds.length, 1);
    const output = croppedFrom(editor, "file:///crop-out.jpg");
    h.holds[0].resolve(output);
    await flush();
    assert.equal(h.runtime.snapshot().candidate?.localUri, output.localUri);
    assert.equal(h.runtime.snapshot().placement, "header_logo");
    assert.deepEqual(h.runtime.snapshot().templateWarnings, ["letterhead.warnLandscape"]);
    assert.equal(h.calls(), 1);
    assertProtected(h.retired);
    h.runtime.dispose();
  }

  // A failed crop after Cancel does not surface an error.
  {
    syncSessionOwnership.resetForTests();
    const session = syncSessionOwnership.beginSession("alice");
    const h = harness();
    h.crop.bindOwner({ uid: session.uid, generation: session.generation });
    h.runtime.setOwner(session);
    await flush();
    const editor = image("alice", session.generation, "file:///editor-alice.jpg");
    h.runtime.setCandidate(editor, ["letterhead.warnLandscape"]);
    h.crop.stage(editor, ["letterhead.warnLandscape"], "borrowed");
    h.crop.accept();
    h.crop.cancel();
    h.holds[0].reject(new Error("letterhead_stage:crop:crop_failed"));
    await flush();
    assert.equal(h.errors.length, 0);
    assertUntouched(h.runtime, editor.localUri, ["letterhead.warnLandscape"], "complete_page");
    assert.equal(h.retired.includes(editor.localUri), false);
    assertProtected(h.retired);
    h.runtime.dispose();
  }

  // A→B: pending clears immediately. B's image survives A's late crop.
  {
    syncSessionOwnership.resetForTests();
    const sessionA = syncSessionOwnership.beginSession("alice");
    const h = harness();
    h.crop.bindOwner({ uid: sessionA.uid, generation: sessionA.generation });
    h.runtime.setOwner(sessionA);
    await flush();
    const alice = image("alice", sessionA.generation, "file:///alice.jpg");
    h.runtime.setCandidate(alice, ["letterhead.warnLandscape"]);
    h.crop.stage(alice, ["letterhead.warnLandscape"], "borrowed");
    h.crop.accept();
    const sessionB = syncSessionOwnership.beginSession("bob");
    h.crop.bindOwner({ uid: sessionB.uid, generation: sessionB.generation });
    assert.equal(h.pending(), null);
    h.runtime.setOwner(sessionB);
    await flush();
    const bob = image("bob", sessionB.generation, "file:///bob.jpg");
    h.runtime.setCandidate(bob, ["letterhead.warnLowRes"]);
    h.runtime.setPlacement("complete_page", { ...DEFAULT_LETTERHEAD_MARGINS });
    const output = croppedFrom(alice, "file:///alice-crop.jpg");
    h.holds[0].resolve(output);
    await flush();
    assertUntouched(h.runtime, bob.localUri, ["letterhead.warnLowRes"], "complete_page");
    assert.equal(h.errors.length, 0);
    assert.equal(h.pending(), null);
    assert.equal(h.retired.includes(output.localUri), true);
    assert.equal(h.retired.includes(bob.localUri), false);
    assertProtected(h.retired);
    h.runtime.dispose();
  }

  // A→logout→A: the new generation is not updated by the retired generation's crop.
  {
    syncSessionOwnership.resetForTests();
    const sessionA1 = syncSessionOwnership.beginSession("alice");
    const h = harness();
    h.crop.bindOwner({ uid: sessionA1.uid, generation: sessionA1.generation });
    h.runtime.setOwner(sessionA1);
    await flush();
    const first = image("alice", sessionA1.generation, "file:///alice-gen1.jpg");
    h.runtime.setCandidate(first, ["letterhead.warnLandscape"]);
    h.crop.stage(first, ["letterhead.warnLandscape"], "borrowed");
    h.crop.accept();
    syncSessionOwnership.endSession();
    h.crop.bindOwner(null);
    assert.equal(h.pending(), null);
    h.runtime.setOwner(null);
    const sessionA2 = syncSessionOwnership.beginSession("alice");
    assert.notEqual(sessionA1.generation, sessionA2.generation);
    h.crop.bindOwner({ uid: sessionA2.uid, generation: sessionA2.generation });
    h.runtime.setOwner(sessionA2);
    await flush();
    const second = image("alice", sessionA2.generation, "file:///alice-gen2.jpg");
    h.runtime.setCandidate(second, ["letterhead.warnAspect"]);
    const output = croppedFrom(first, "file:///alice-gen1-crop.jpg");
    h.holds[0].resolve(output);
    await flush();
    assertUntouched(h.runtime, second.localUri, ["letterhead.warnAspect"], "complete_page");
    assert.equal(h.errors.length, 0);
    assert.equal(h.pending(), null);
    assert.equal(h.retired.includes(output.localUri), true);
    assert.equal(h.retired.includes(second.localUri), false);
    assertProtected(h.retired);
    h.runtime.dispose();
  }

  // A crop result stamped for another owner is not applied to the live editor.
  {
    syncSessionOwnership.resetForTests();
    const session = syncSessionOwnership.beginSession("alice");
    const h = harness();
    h.crop.bindOwner({ uid: session.uid, generation: session.generation });
    h.runtime.setOwner(session);
    await flush();
    const editor = image("alice", session.generation, "file:///editor-alice.jpg");
    h.runtime.setCandidate(editor, ["letterhead.warnLandscape"]);
    h.crop.stage(editor, ["letterhead.warnLandscape"], "borrowed");
    h.crop.accept();
    const foreign = croppedFrom(editor, "file:///foreign-crop.jpg");
    foreign.ownerUid = "bob";
    h.holds[0].resolve(foreign);
    await flush();
    assertUntouched(h.runtime, editor.localUri, ["letterhead.warnLandscape"], "complete_page");
    assert.equal(h.errors.length, 0);
    assert.equal(h.retired.includes(foreign.localUri), true);
    assert.equal(h.retired.includes(editor.localUri), false);
    assertProtected(h.retired);
    h.runtime.dispose();
  }

  // Late output that reuses a historical letter path is not deleted.
  {
    syncSessionOwnership.resetForTests();
    const session = syncSessionOwnership.beginSession("alice");
    const h = harness();
    h.crop.bindOwner({ uid: session.uid, generation: session.generation });
    h.runtime.setOwner(session);
    await flush();
    const editor = image("alice", session.generation, "file:///editor-alice.jpg");
    h.runtime.setCandidate(editor, ["letterhead.warnLandscape"]);
    h.crop.stage(editor, ["letterhead.warnLandscape"], "borrowed");
    h.crop.accept();
    h.crop.cancel();
    h.holds[0].resolve(croppedFrom(editor, HISTORICAL_LETTER));
    await flush();
    assert.equal(h.retired.includes(HISTORICAL_LETTER), false);
    assertUntouched(h.runtime, editor.localUri, ["letterhead.warnLandscape"], "complete_page");
    h.runtime.dispose();
  }

  // Cropped A → complete B → complete again remains B (not retained original A).
  {
    syncSessionOwnership.resetForTests();
    const session = syncSessionOwnership.beginSession("alice");
    const h = harness();
    h.crop.bindOwner({ uid: session.uid, generation: session.generation });
    h.runtime.setOwner(session);
    await flush();
    const photoA = image("alice", session.generation, "file:///photo-a.jpg");
    h.crop.stage(photoA, ["letterhead.warnLandscape"], "disposable");
    h.crop.accept();
    const cropA = croppedFrom(photoA, "file:///photo-a-crop.jpg");
    h.holds[0].resolve(cropA);
    await flush();
    assert.equal(h.runtime.snapshot().candidate?.localUri, cropA.localUri);
    const photoB = image("alice", session.generation, "file:///photo-b.jpg");
    h.crop.stage(photoB, ["letterhead.warnTooLarge"], "disposable");
    h.crop.useComplete();
    assert.equal(h.pending(), null);
    assertUntouched(h.runtime, photoB.localUri, ["letterhead.warnTooLarge"], "complete_page");
    assert.equal(h.retired.includes(photoA.localUri), true);
    assert.equal(h.retired.includes(cropA.localUri), true);
    h.crop.useComplete();
    assertUntouched(h.runtime, photoB.localUri, ["letterhead.warnTooLarge"], "complete_page");
    assert.equal(h.retired.includes(photoB.localUri), false);
    assertProtected(h.retired);
    h.runtime.dispose();
  }

  // Cropped A → cropped B → complete restores B's original.
  {
    syncSessionOwnership.resetForTests();
    const session = syncSessionOwnership.beginSession("alice");
    const h = harness();
    h.crop.bindOwner({ uid: session.uid, generation: session.generation });
    h.runtime.setOwner(session);
    await flush();
    const photoA = image("alice", session.generation, "file:///photo-a.jpg");
    h.crop.stage(photoA, ["letterhead.warnLandscape"], "disposable");
    h.crop.accept();
    const cropA = croppedFrom(photoA, "file:///photo-a-crop.jpg");
    h.holds[0].resolve(cropA);
    await flush();
    const photoB = image("alice", session.generation, "file:///photo-b.jpg");
    h.crop.stage(photoB, ["letterhead.warnTooLarge"], "disposable");
    h.crop.accept();
    const cropB = croppedFrom(photoB, "file:///photo-b-crop.jpg");
    h.holds[1].resolve(cropB);
    await flush();
    assert.equal(h.runtime.snapshot().candidate?.localUri, cropB.localUri);
    assert.equal(h.retired.includes(photoA.localUri), true);
    assert.equal(h.retired.includes(cropA.localUri), true);
    assert.equal(h.retired.includes(photoB.localUri), false);
    h.crop.useComplete();
    assertUntouched(h.runtime, photoB.localUri, ["letterhead.warnTooLarge"], "complete_page");
    assert.equal(h.retired.includes(cropB.localUri), true);
    assert.equal(h.retired.includes(photoB.localUri), false);
    assertProtected(h.retired);
    h.runtime.dispose();
  }

  // Cropped A → stage B → cancel preserves A and its complete-image option.
  {
    syncSessionOwnership.resetForTests();
    const session = syncSessionOwnership.beginSession("alice");
    const h = harness();
    h.crop.bindOwner({ uid: session.uid, generation: session.generation });
    h.runtime.setOwner(session);
    await flush();
    const photoA = image("alice", session.generation, "file:///photo-a.jpg");
    h.crop.stage(photoA, ["letterhead.warnLandscape"], "disposable");
    h.crop.accept();
    const cropA = croppedFrom(photoA, "file:///photo-a-crop.jpg");
    h.holds[0].resolve(cropA);
    await flush();
    const photoB = image("alice", session.generation, "file:///photo-b.jpg");
    h.crop.stage(photoB, ["letterhead.warnTooLarge"], "disposable");
    h.crop.cancel();
    assert.equal(h.pending(), null);
    assert.equal(h.runtime.snapshot().candidate?.localUri, cropA.localUri);
    assert.equal(h.runtime.snapshot().placement, "header_logo");
    assert.equal(h.retired.includes(photoB.localUri), true);
    assert.equal(h.retired.includes(photoA.localUri), false);
    assert.equal(h.retired.includes(cropA.localUri), false);
    h.crop.useComplete();
    assertUntouched(h.runtime, photoA.localUri, ["letterhead.warnLandscape"], "complete_page");
    assert.equal(h.retired.includes(cropA.localUri), true);
    assert.equal(h.retired.includes(photoA.localUri), false);
    assertProtected(h.retired);
    h.runtime.dispose();
  }

  console.log("letterheadCropSession.test.ts: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
