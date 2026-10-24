/**
 * Session-owned reads for saved letters and drafts.
 * Publication and PDF share follow the live UID + generation + record id.
 * A retired completion cannot paint the next account or open its share sheet.
 * An operating-system share sheet that has already opened is not revoked.
 */

import { draftPayloadToLetterheadInput } from "./letterheadDraftMapper";
import {
  classifyStoredPdf,
  legacyLetterFields,
  legacyLetterVisibleTo,
  type StoredPdfState,
} from "./legacyLetterhead";
import type { LetterheadDocument, LetterheadDocumentInput } from "./types";
import type { FormDraftRecord } from "@/repositories/formDraftsRepository";
import {
  sessionFlushKey,
  syncSessionOwnership,
  type SyncSessionToken,
} from "@/sync/syncSessionOwnership";

export type LegacyLiveSession = {
  authUid: string | null;
  session: SyncSessionToken | null;
};

export type LegacyReaderTarget = {
  documentId?: string;
  draftId?: string;
};

export type LegacyReaderView = {
  kind: "letter" | "draft";
  input: LetterheadDocumentInput;
  designKept: boolean;
  pdfUri: string | null;
  pdfState: StoredPdfState;
};

export type LegacyReaderSnapshot = {
  ownerKey: string;
  recordKey: string;
  phase: "idle" | "loading" | "ready" | "error";
  view: LegacyReaderView | null;
  error: string | null;
  sharing: boolean;
};

export type LegacyListRow = {
  id: string;
  title: string;
  subject: string;
  body: string;
  dateMs: number;
};

export type LegacyListSnapshot = {
  ownerKey: string;
  phase: "idle" | "loading" | "ready" | "error";
  rows: LegacyListRow[];
  error: string | null;
};

export type LegacyRowAdmission = {
  ownerKey: string;
  recordId: string;
  admitted: SyncSessionToken;
};

export type LegacySharePress = {
  shareSeq: number;
  ownerKey: string;
  recordKey: string;
  pdfUri: string;
  admitted: SyncSessionToken;
};

type ReaderDeps = {
  getDocument: (uid: string, id: string) => Promise<LetterheadDocument | null>;
  getDraft: (uid: string, id: string) => Promise<FormDraftRecord | null>;
  fileExists: (uri: string) => Promise<boolean>;
  sharePdf: (uri: string) => Promise<void>;
  isShareCancelled: (error: unknown) => boolean;
  mapError: (error: unknown) => string;
  unavailableMessage: string;
  liveSession: () => LegacyLiveSession;
};

type ListDeps = {
  list: (uid: string) => Promise<LetterheadDocument[]>;
  mapError: (error: unknown) => string;
  navigate: (documentId: string) => void;
  liveSession: () => LegacyLiveSession;
};

export function legacyOwnerKey(live: LegacyLiveSession): string {
  if (!live.authUid || !live.session) return "signed_out#0";
  if (live.authUid !== live.session.uid) return "signed_out#0";
  return sessionFlushKey(live.session.uid, live.session);
}

export function emptyLegacyReader(ownerKey = "signed_out#0"): LegacyReaderSnapshot {
  return {
    ownerKey,
    recordKey: "",
    phase: "idle",
    view: null,
    error: null,
    sharing: false,
  };
}

export function emptyLegacyList(ownerKey = "signed_out#0"): LegacyListSnapshot {
  return { ownerKey, phase: "idle", rows: [], error: null };
}

export function maskLegacyReader(
  snapshot: LegacyReaderSnapshot,
  live: LegacyLiveSession,
  requested?: LegacyReaderTarget
): LegacyReaderSnapshot {
  const key = legacyOwnerKey(live);
  const requestedKey = requested ? recordKeyOf(requested) : null;
  if (snapshot.ownerKey !== key || (requestedKey !== null && snapshot.recordKey !== requestedKey)) {
    return {
      ...emptyLegacyReader(key),
      recordKey: requestedKey ?? "",
      phase: key !== "signed_out#0" && requestedKey ? "loading" : "idle",
    };
  }
  return snapshot;
}

function sessionAdmits(admitted: SyncSessionToken, live: LegacyLiveSession): boolean {
  if (!syncSessionOwnership.isCurrent(admitted)) return false;
  if (!live.authUid || !live.session) return false;
  if (live.authUid !== admitted.uid || live.session.uid !== admitted.uid) return false;
  return live.session.generation === admitted.generation;
}

export function maskLegacyList(
  snapshot: LegacyListSnapshot,
  live: LegacyLiveSession
): LegacyListSnapshot {
  const key = legacyOwnerKey(live);
  if (snapshot.ownerKey === key) return snapshot;
  return emptyLegacyList(key);
}

function recordKeyOf(target: LegacyReaderTarget): string {
  if (target.documentId) return `doc:${target.documentId}`;
  if (target.draftId) return `draft:${target.draftId}`;
  return "";
}

export function createLegacyLetterheadReaderRuntime(deps: ReaderDeps) {
  let owner: SyncSessionToken | null = null;
  let target: LegacyReaderTarget = {};
  let loadSeq = 0;
  let shareSeq = 0;
  let disposed = false;
  let published = emptyLegacyReader();
  const listeners = new Set<() => void>();

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function readLive(): LegacyLiveSession {
    return deps.liveSession();
  }

  function liveMatches(admitted: SyncSessionToken): boolean {
    if (disposed) return false;
    return sessionAdmits(admitted, readLive());
  }

  function loadCurrent(op: number, admitted: SyncSessionToken, key: string): boolean {
    return (
      op === loadSeq &&
      !!owner &&
      owner.uid === admitted.uid &&
      owner.generation === admitted.generation &&
      published.recordKey === key &&
      published.ownerKey === sessionFlushKey(admitted.uid, admitted) &&
      liveMatches(admitted)
    );
  }

  function applyIdentity(next: SyncSessionToken | null, nextTarget: LegacyReaderTarget): void {
    disposed = false;
    loadSeq += 1;
    shareSeq += 1;
    owner = next;
    target = nextTarget;
    const ownerKey = next ? sessionFlushKey(next.uid, next) : "signed_out#0";
    const key = recordKeyOf(nextTarget);
    published = {
      ...emptyLegacyReader(ownerKey),
      recordKey: key,
      phase: next && key ? "loading" : "idle",
    };
    emit();
    if (!next || !key || !liveMatches(next)) return;
    const op = loadSeq;
    void load(op, { uid: next.uid, generation: next.generation }, nextTarget, key);
  }

  async function load(
    op: number,
    admitted: SyncSessionToken,
    requested: LegacyReaderTarget,
    key: string
  ): Promise<void> {
    try {
      if (requested.documentId) {
        const doc = await deps.getDocument(admitted.uid, requested.documentId);
        if (!loadCurrent(op, admitted, key)) return;
        if (!doc || !legacyLetterVisibleTo(doc.userId, admitted.uid)) {
          published = {
            ...published,
            phase: "error",
            view: null,
            error: deps.unavailableMessage,
            sharing: false,
          };
          emit();
          return;
        }
        const pdfUri = doc.pdfUri?.trim() ? doc.pdfUri : null;
        let exists = false;
        if (pdfUri) {
          try {
            exists = await deps.fileExists(pdfUri);
          } catch {
            exists = false;
          }
          if (!loadCurrent(op, admitted, key)) return;
        }
        published = {
          ...published,
          phase: "ready",
          error: null,
          sharing: false,
          view: {
            kind: "letter",
            input: doc.input,
            designKept: Boolean(doc.templateSnapshot),
            pdfUri,
            pdfState: classifyStoredPdf(pdfUri, exists),
          },
        };
        emit();
        return;
      }
      if (requested.draftId) {
        const draft = await deps.getDraft(admitted.uid, requested.draftId);
        if (!loadCurrent(op, admitted, key)) return;
        if (!draft || draft.draftKind !== "letterhead" || draft.userId !== admitted.uid) {
          published = {
            ...published,
            phase: "error",
            view: null,
            error: deps.unavailableMessage,
            sharing: false,
          };
          emit();
          return;
        }
        published = {
          ...published,
          phase: "ready",
          error: null,
          sharing: false,
          view: {
            kind: "draft",
            input: draftPayloadToLetterheadInput(draft.payload),
            designKept:
              draft.payload.templateAvailability === "snapshot" && Boolean(draft.payload.templateSnapshot),
            pdfUri: null,
            pdfState: "none",
          },
        };
        emit();
      }
    } catch (error) {
      if (!loadCurrent(op, admitted, key)) return;
      published = {
        ...published,
        phase: "error",
        view: null,
        error: deps.mapError(error),
        sharing: false,
      };
      emit();
    }
  }

  function shareStillCurrent(admission: LegacySharePress): boolean {
    return (
      !disposed &&
      admission.shareSeq === shareSeq &&
      published.ownerKey === admission.ownerKey &&
      published.recordKey === admission.recordKey &&
      published.view?.kind === "letter" &&
      published.view.pdfUri === admission.pdfUri &&
      liveMatches(admission.admitted) &&
      legacyOwnerKey(readLive()) === admission.ownerKey
    );
  }

  function captureSharePress(): LegacySharePress | null {
    const admitted = owner;
    const view = published.view;
    if (!admitted || !liveMatches(admitted)) return null;
    if (!view || view.kind !== "letter" || view.pdfState !== "present" || !view.pdfUri) return null;
    return {
      shareSeq,
      ownerKey: published.ownerKey,
      recordKey: published.recordKey,
      pdfUri: view.pdfUri,
      admitted: { uid: admitted.uid, generation: admitted.generation },
    };
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot(): LegacyReaderSnapshot {
      return published;
    },
    setIdentity(next: SyncSessionToken | null, nextTarget: LegacyReaderTarget): void {
      applyIdentity(next, nextTarget);
    },
    reload(): void {
      applyIdentity(owner, target);
    },
    dispose(): void {
      disposed = true;
      loadSeq += 1;
      shareSeq += 1;
    },
    admitShare(): LegacySharePress | null {
      return captureSharePress();
    },
    async shareLoadedPdf(
      press?: LegacySharePress | null
    ): Promise<"shared" | "cancelled" | "refused" | "missing"> {
      const admission = press === undefined ? captureSharePress() : press;
      if (!admission || !shareStillCurrent(admission)) return "refused";
      published = { ...published, sharing: true };
      emit();
      let exists = false;
      try {
        exists = await deps.fileExists(admission.pdfUri);
      } catch {
        exists = false;
      }
      if (!shareStillCurrent(admission)) return "refused";
      if (!exists) {
        published = {
          ...published,
          sharing: false,
          view: published.view
            ? { ...published.view, pdfState: "missing" }
            : published.view,
        };
        emit();
        return "missing";
      }
      try {
        await deps.sharePdf(admission.pdfUri);
      } catch (error) {
        if (!shareStillCurrent(admission)) return "refused";
        if (deps.isShareCancelled(error)) {
          published = { ...published, sharing: false };
          emit();
          return "cancelled";
        }
        published = {
          ...published,
          sharing: false,
          error: deps.mapError(error),
        };
        emit();
        return "refused";
      }
      if (!shareStillCurrent(admission)) return "refused";
      published = { ...published, sharing: false };
      emit();
      return "shared";
    },
  };
}

export function createLegacyLetterheadListRuntime(deps: ListDeps) {
  let owner: SyncSessionToken | null = null;
  let loadSeq = 0;
  let disposed = false;
  let published = emptyLegacyList();
  const listeners = new Set<() => void>();

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function readLive(): LegacyLiveSession {
    return deps.liveSession();
  }

  function liveMatches(admitted: SyncSessionToken): boolean {
    if (disposed) return false;
    return sessionAdmits(admitted, readLive());
  }

  function loadCurrent(op: number, admitted: SyncSessionToken): boolean {
    return (
      op === loadSeq &&
      !!owner &&
      owner.uid === admitted.uid &&
      owner.generation === admitted.generation &&
      published.ownerKey === sessionFlushKey(admitted.uid, admitted) &&
      liveMatches(admitted)
    );
  }

  function rowVisible(recordId: string): boolean {
    if (!owner || !liveMatches(owner)) return false;
    if (published.phase !== "ready") return false;
    return published.rows.some((row) => row.id === recordId);
  }

  async function load(op: number, admitted: SyncSessionToken): Promise<void> {
    try {
      const list = await deps.list(admitted.uid);
      if (!loadCurrent(op, admitted)) return;
      published = {
        ownerKey: sessionFlushKey(admitted.uid, admitted),
        phase: "ready",
        error: null,
        rows: list
          .filter((doc) => legacyLetterVisibleTo(doc.userId, admitted.uid))
          .map((doc) => ({
            id: doc.id,
            title: doc.title,
            subject: doc.input.subject ?? "",
            body: doc.input.body ?? "",
            dateMs: doc.input.date,
          })),
      };
      emit();
    } catch (error) {
      if (!loadCurrent(op, admitted)) return;
      published = {
        ownerKey: sessionFlushKey(admitted.uid, admitted),
        phase: "error",
        rows: [],
        error: deps.mapError(error),
      };
      emit();
    }
  }

  function applyOwner(next: SyncSessionToken | null): void {
    disposed = false;
    loadSeq += 1;
    owner = next;
    const ownerKey = next ? sessionFlushKey(next.uid, next) : "signed_out#0";
    published = { ...emptyLegacyList(ownerKey), phase: next ? "loading" : "idle" };
    emit();
    if (!next || !liveMatches(next)) return;
    const op = loadSeq;
    void load(op, { uid: next.uid, generation: next.generation });
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot(): LegacyListSnapshot {
      return published;
    },
    setOwner(next: SyncSessionToken | null): void {
      applyOwner(next);
    },
    reload(): void {
      applyOwner(owner);
    },
    dispose(): void {
      disposed = true;
      loadSeq += 1;
    },
    openRow(press: LegacyRowAdmission): boolean {
      if (!syncSessionOwnership.isCurrent(press.admitted)) return false;
      if (published.ownerKey !== press.ownerKey) return false;
      if (!rowVisible(press.recordId)) return false;
      deps.navigate(press.recordId);
      return true;
    },
    admitRowDelete(recordId: string): LegacyRowAdmission | null {
      if (!owner || !rowVisible(recordId)) return null;
      return {
        ownerKey: sessionFlushKey(owner.uid, owner),
        recordId,
        admitted: { uid: owner.uid, generation: owner.generation },
      };
    },
    rowDeleteStillCurrent(admission: LegacyRowAdmission): boolean {
      if (!syncSessionOwnership.isCurrent(admission.admitted)) return false;
      if (!liveMatches(admission.admitted)) return false;
      if (published.ownerKey !== admission.ownerKey) return false;
      if (published.phase === "loading") return true;
      return published.rows.some((row) => row.id === admission.recordId);
    },
  };
}

export type LegacyLetterheadReaderRuntime = ReturnType<typeof createLegacyLetterheadReaderRuntime>;
export type LegacyLetterheadListRuntime = ReturnType<typeof createLegacyLetterheadListRuntime>;
