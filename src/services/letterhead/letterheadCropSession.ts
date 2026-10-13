/**
 * Production crop session used by letterhead setup.
 *
 * A borrowed file is the image the editor already owns. Cancel must leave it
 * in place. A disposable file is a new gallery/scanner copy or a manipulator
 * output. It is deleted only when no editor, pending crop, or issued crop
 * still uses it. Saved-template and historical-letter URIs passed in
 * `protectedUris` are never deleted.
 *
 * Each accept captures uid, session generation, and a monotonic operation id.
 * The single-flight guard is set before the first await. Cancellation,
 * replacement, complete-page, owner change, and unmount mark that operation
 * dead. A late native result is discarded. Already-issued native work is not
 * cancelled; its completion must not change the current candidate, placement,
 * warnings, or error.
 */

import type { LetterheadCandidateImage } from "./letterheadCandidateImage";
import {
  adjustHeaderCrop,
  suggestHeaderCrop,
  type HeaderCrop,
} from "./letterheadHeaderCrop";
import type { TemplateWarningKey } from "./letterheadTemplateService";

export type LetterheadCropRole = "borrowed" | "disposable";

export type LetterheadCropOwner = {
  uid: string;
  generation: number;
};

export type LetterheadCropPendingView = {
  source: LetterheadCandidateImage;
  crop: HeaderCrop;
  warnings: TemplateWarningKey[];
};

export type LetterheadCropSessionPorts = {
  liveOwner: () => LetterheadCropOwner | null;
  editorCandidate: () => LetterheadCandidateImage | null;
  /** Local URIs of saved templates and historical letters. Never retired. */
  protectedUris: () => ReadonlySet<string>;
  cropWorkingCopy: (
    source: LetterheadCandidateImage,
    crop: HeaderCrop
  ) => Promise<LetterheadCandidateImage>;
  showPending: (pending: LetterheadCropPendingView | null) => void;
  showError: (code: string) => void;
  applyAcceptedHeader: (
    cropped: LetterheadCandidateImage,
    warnings: TemplateWarningKey[],
    retain?: { retainUri?: string }
  ) => void;
  applyCompletePage: (
    source: LetterheadCandidateImage | null,
    warnings: TemplateWarningKey[]
  ) => void;
  retireFile: (file: LetterheadCandidateImage) => void;
};

type CropOpStatus = "open" | "running" | "dead";

type CropOp = {
  operationId: number;
  ownerUid: string;
  sessionGeneration: number;
  source: LetterheadCandidateImage;
  crop: HeaderCrop;
  warnings: TemplateWarningKey[];
  role: LetterheadCropRole;
  status: CropOpStatus;
};

function sameOwner(
  op: { ownerUid: string; sessionGeneration: number },
  live: LetterheadCropOwner | null
): boolean {
  return !!live && live.uid === op.ownerUid && live.generation === op.sessionGeneration;
}

export function createLetterheadCropController(ports: LetterheadCropSessionPorts) {
  let seq = 0;
  let pending: CropOp | null = null;
  let runningId: number | null = null;
  /**
   * Uncropped source of the currently accepted design. Bound to `acceptedUri`
   * (the crop now in the editor, or the complete photo once restored).
   * Staging a replacement does not clear this; committing one does.
   */
  let kept: {
    original: LetterheadCandidateImage;
    acceptedUri: string;
    warnings: TemplateWarningKey[];
  } | null = null;
  let bound: LetterheadCropOwner | null = null;
  let alive = true;
  /** Operations whose native crop has been issued and has not settled. */
  const issued = new Map<number, CropOp>();

  function inUse(uri: string): boolean {
    if (ports.editorCandidate()?.localUri === uri) return true;
    if (ports.protectedUris().has(uri)) return true;
    if (pending && pending.status !== "dead" && pending.source.localUri === uri) return true;
    if (kept?.original.localUri === uri) return true;
    for (const op of issued.values()) {
      if (op.source.localUri === uri) return true;
    }
    return false;
  }

  function retireIfAbandoned(file: LetterheadCandidateImage | null | undefined): void {
    if (!file) return;
    if (inUse(file.localUri)) return;
    ports.retireFile(file);
  }

  function publishPending(): void {
    if (!pending || pending.status === "dead") {
      ports.showPending(null);
      return;
    }
    ports.showPending({
      source: pending.source,
      crop: pending.crop,
      warnings: pending.warnings,
    });
  }

  function isCurrent(op: CropOp): boolean {
    return (
      op.status === "running" &&
      runningId === op.operationId &&
      pending?.operationId === op.operationId &&
      sameOwner(op, ports.liveOwner())
    );
  }

  function outputOwned(op: CropOp, cropped: LetterheadCandidateImage): boolean {
    return (
      cropped.ownerUid === op.ownerUid && cropped.sessionGeneration === op.sessionGeneration
    );
  }

  function discard(op: CropOp, cropped: LetterheadCandidateImage | null): void {
    op.status = "dead";
    const clearingThis = pending?.operationId === op.operationId;
    if (clearingThis) pending = null;
    if (runningId === op.operationId) runningId = null;
    issued.delete(op.operationId);
    if (clearingThis) ports.showPending(null);
    if (cropped && cropped.localUri !== op.source.localUri) retireIfAbandoned(cropped);
    if (op.role === "disposable") retireIfAbandoned(op.source);
  }

  function supersedeKept(next: {
    original: LetterheadCandidateImage;
    acceptedUri: string;
    warnings: TemplateWarningKey[];
  }): void {
    const previous = kept;
    kept = next;
    if (previous && previous.original.localUri !== next.original.localUri) {
      retireIfAbandoned(previous.original);
    }
  }

  function rememberAccepted(op: CropOp, cropped: LetterheadCandidateImage): void {
    if (kept && kept.acceptedUri === op.source.localUri) {
      kept = { ...kept, acceptedUri: cropped.localUri };
      return;
    }
    supersedeKept({
      original: op.source,
      acceptedUri: cropped.localUri,
      warnings: op.warnings,
    });
  }

  function restoreOrStay(warnings: TemplateWarningKey[]): void {
    const editor = ports.editorCandidate();
    if (
      kept &&
      editor &&
      kept.acceptedUri === editor.localUri &&
      kept.original.localUri !== editor.localUri
    ) {
      ports.applyCompletePage(kept.original, kept.warnings);
      kept = { ...kept, acceptedUri: kept.original.localUri };
      return;
    }
    ports.applyCompletePage(editor, warnings);
  }

  function stage(
    source: LetterheadCandidateImage | null,
    warnings: TemplateWarningKey[],
    requestedRole: LetterheadCropRole
  ): void {
    if (!source) return;
    const editor = ports.editorCandidate();
    const role: LetterheadCropRole =
      editor && editor.localUri === source.localUri ? "borrowed" : requestedRole;
    if (!alive) {
      if (role === "disposable") retireIfAbandoned(source);
      return;
    }
    const live = ports.liveOwner();
    if (
      !live ||
      source.ownerUid !== live.uid ||
      source.sessionGeneration !== live.generation
    ) {
      if (role === "disposable") retireIfAbandoned(source);
      return;
    }
    const previous = pending;
    if (previous) {
      const wasRunning = runningId === previous.operationId;
      previous.status = "dead";
      if (wasRunning) runningId = null;
      if (
        !wasRunning &&
        previous.role === "disposable" &&
        previous.source.localUri !== source.localUri
      ) {
        retireIfAbandoned(previous.source);
      }
    }
    pending = {
      operationId: ++seq,
      ownerUid: live.uid,
      sessionGeneration: live.generation,
      source,
      crop: suggestHeaderCrop(source.width, source.height),
      warnings,
      role,
      status: "open",
    };
    publishPending();
  }

  function cancel(): void {
    const op = pending;
    if (!op) return;
    const wasRunning = runningId === op.operationId;
    op.status = "dead";
    pending = null;
    if (wasRunning) runningId = null;
    ports.showPending(null);
    if (!wasRunning && op.role === "disposable") retireIfAbandoned(op.source);
  }

  function accept(): void {
    if (runningId !== null) return;
    const op = pending;
    if (!op || op.status !== "open") return;
    const live = ports.liveOwner();
    if (!sameOwner(op, live)) return;
    if (op.source.ownerUid !== op.ownerUid || op.source.sessionGeneration !== op.sessionGeneration) {
      return;
    }
    op.status = "running";
    runningId = op.operationId;
    issued.set(op.operationId, op);
    const source = op.source;
    const crop = { ...op.crop };
    void (async () => {
      try {
        const cropped = await ports.cropWorkingCopy(source, crop);
        if (!isCurrent(op) || !outputOwned(op, cropped)) {
          discard(op, cropped);
          return;
        }
        issued.delete(op.operationId);
        runningId = null;
        pending = null;
        op.status = "dead";
        ports.showPending(null);
        rememberAccepted(op, cropped);
        ports.applyAcceptedHeader(cropped, op.warnings, { retainUri: source.localUri });
      } catch (e) {
        if (!isCurrent(op)) {
          discard(op, null);
          return;
        }
        issued.delete(op.operationId);
        runningId = null;
        op.status = "open";
        const code =
          e instanceof Error && e.message ? e.message : "letterhead_stage:crop:crop_failed";
        ports.showError(code);
      }
    })();
  }

  function useComplete(): void {
    const op = pending;
    if (op) {
      const wasRunning = runningId === op.operationId;
      op.status = "dead";
      pending = null;
      if (wasRunning) runningId = null;
      ports.showPending(null);
      const editor = ports.editorCandidate();
      if (op.role === "borrowed" || editor?.localUri === op.source.localUri) {
        restoreOrStay(op.warnings);
        return;
      }
      supersedeKept({
        original: op.source,
        acceptedUri: op.source.localUri,
        warnings: op.warnings,
      });
      ports.applyCompletePage(op.source, op.warnings);
      return;
    }
    ports.showPending(null);
    restoreOrStay(kept?.warnings ?? []);
  }

  function adjust(delta: { originX?: number; originY?: number; width?: number; height?: number }): void {
    if (!pending || pending.status !== "open") return;
    pending = {
      ...pending,
      crop: adjustHeaderCrop(pending.source.width, pending.source.height, pending.crop, delta),
    };
    publishPending();
  }

  function bindOwner(next: LetterheadCropOwner | null): void {
    if (bound && next && bound.uid === next.uid && bound.generation === next.generation) return;
    bound = next ? { uid: next.uid, generation: next.generation } : null;
    const op = pending;
    if (op) {
      const wasRunning = runningId === op.operationId;
      op.status = "dead";
      pending = null;
      if (wasRunning) runningId = null;
      if (!wasRunning && op.role === "disposable") retireIfAbandoned(op.source);
    }
    ports.showPending(null);
    const extra = kept;
    kept = null;
    retireIfAbandoned(extra?.original);
  }

  function unmount(): void {
    alive = false;
    const op = pending;
    if (op) {
      const wasRunning = runningId === op.operationId;
      op.status = "dead";
      pending = null;
      if (wasRunning) runningId = null;
      if (!wasRunning && op.role === "disposable") retireIfAbandoned(op.source);
    }
    const extra = kept;
    kept = null;
    retireIfAbandoned(extra?.original);
  }

  function releaseAbandonedOriginal(): void {
    const extra = kept;
    kept = null;
    retireIfAbandoned(extra?.original);
  }

  return {
    stage,
    cancel,
    accept,
    useComplete,
    adjust,
    bindOwner,
    unmount,
    releaseAbandonedOriginal,
  };
}
