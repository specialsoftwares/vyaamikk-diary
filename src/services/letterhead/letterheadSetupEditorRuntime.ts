/**
 * Production letterhead setup editor runtime used by setup.tsx.
 *
 * Editor state and save/load completions are bound to an owning SyncSessionToken
 * (uid + generation). Stale completions from a retired owner never restore that
 * owner's fields onto, or clear, the current owner's editor.
 *
 * Does not claim already-issued remote writes can be cancelled.
 */

import {
  mayIssueRemoteWork,
  sessionFlushKey,
  type SyncSessionToken,
} from "@/sync/syncSessionOwnership";

import type { LetterheadCandidateImage } from "./letterheadCandidateImage";
import { DEFAULT_LETTERHEAD_MARGINS } from "./types";
import type { LetterheadConfig, LetterheadMargins, TemplateWarningKey } from "./types";

export type LetterheadSetupEditorSnapshot = {
  ownerKey: string;
  existing: LetterheadConfig | null;
  candidate: LetterheadCandidateImage | null;
  margins: LetterheadMargins;
  signatureUri: string | null;
  stampUri: string | null;
  defaultName: string;
  defaultTitle: string;
  defaultClose: string;
  templateWarnings: TemplateWarningKey[];
  error: string | null;
  saving: boolean;
  loading: boolean;
};

export type LetterheadSetupSavePatch = {
  sourceType: "imported_image";
  generatedLayout: null;
  imageDataUri: string;
  imageWidth: number;
  imageHeight: number;
  margins: LetterheadMargins;
  signatureDataUri: string | null;
  stampDataUri: string | null;
  defaultSenderName: string | null;
  defaultSenderTitle: string | null;
  defaultComplimentaryClose: string | null;
  repeatTemplateAllPages: true;
};

export type LetterheadSetupEditorPorts = {
  get: (userId: string) => Promise<LetterheadConfig | null>;
  save: (
    userId: string,
    patch: LetterheadSetupSavePatch,
    session?: SyncSessionToken | null
  ) => Promise<LetterheadConfig>;
  readCandidateDataUri?: (candidate: LetterheadCandidateImage) => Promise<string>;
  useLocalFileForSave?: boolean;
  retireCandidate?: (candidate: LetterheadCandidateImage | null | undefined) => Promise<void> | void;
  liveSession?: () => SyncSessionToken | null;
};

function emptySnapshot(ownerKey: string): LetterheadSetupEditorSnapshot {
  return {
    ownerKey,
    existing: null,
    candidate: null,
    margins: { ...DEFAULT_LETTERHEAD_MARGINS },
    signatureUri: null,
    stampUri: null,
    defaultName: "",
    defaultTitle: "",
    defaultClose: "",
    templateWarnings: [],
    error: null,
    saving: false,
    loading: false,
  };
}

function ownerKeyOf(token: SyncSessionToken | null): string {
  return token ? sessionFlushKey(token.uid, token) : "signed_out#0";
}

function isLiveOwner(
  owner: SyncSessionToken | null,
  live: SyncSessionToken | null
): boolean {
  if (!owner || !live) return false;
  if (owner.uid !== live.uid || owner.generation !== live.generation) return false;
  return mayIssueRemoteWork(owner, owner.uid);
}

/** Clear every retired-owner template / signature / stamp / sender field. */
export function clearedRetiredOwnerFields(
  ownerKey: string
): LetterheadSetupEditorSnapshot {
  return emptySnapshot(ownerKey);
}

export function createLetterheadSetupEditorRuntime(ports: LetterheadSetupEditorPorts) {
  let owner: SyncSessionToken | null = null;
  let loadSeq = 0;
  let saveSeq = 0;
  let published = emptySnapshot("signed_out#0");
  const listeners = new Set<() => void>();

  function emit(): void {
    for (const l of listeners) l();
  }

  function live(): SyncSessionToken | null {
    return ports.liveSession ? ports.liveSession() : owner;
  }

  function stillOwns(opOwner: SyncSessionToken | null): boolean {
    return isLiveOwner(opOwner, live()) && ownerKeyOf(opOwner) === published.ownerKey;
  }

  function setPublished(next: LetterheadSetupEditorSnapshot): void {
    published = next;
    emit();
  }

  async function retireCandidateQuietly(
    candidate: LetterheadCandidateImage | null | undefined
  ): Promise<void> {
    if (!candidate || !ports.retireCandidate) return;
    try {
      await ports.retireCandidate(candidate);
    } catch {
      // best-effort
    }
  }

  async function load(): Promise<void> {
    const opOwner = owner;
    if (!opOwner || !mayIssueRemoteWork(opOwner, opOwner.uid)) return;
    const seq = ++loadSeq;
    setPublished({ ...published, loading: true, error: null });
    try {
      const config = await ports.get(opOwner.uid);
      if (seq !== loadSeq || !stillOwns(opOwner)) return;
      if (!config) {
        const key = ownerKeyOf(opOwner);
        const prev = published.candidate;
        setPublished({
          ...clearedRetiredOwnerFields(key),
          loading: false,
        });
        void retireCandidateQuietly(prev);
        return;
      }
      setPublished({
        ...published,
        loading: false,
        existing: config,
        margins: config.margins ?? { ...DEFAULT_LETTERHEAD_MARGINS },
        signatureUri: config.signatureDataUri ?? null,
        stampUri: config.stampDataUri ?? null,
        defaultName: config.defaultSenderName ?? "",
        defaultTitle: config.defaultSenderTitle ?? "",
        defaultClose: config.defaultComplimentaryClose ?? "",
        candidate: published.candidate,
        templateWarnings: published.templateWarnings,
      });
    } catch {
      if (seq !== loadSeq || !stillOwns(opOwner)) return;
      setPublished({ ...published, loading: false });
    }
  }

  const api = {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    snapshot(): LetterheadSetupEditorSnapshot {
      return published;
    },

    setOwner(session: SyncSessionToken | null): void {
      owner = session;
      const key = ownerKeyOf(session);
      const prevCandidate = published.candidate;
      setPublished(emptySnapshot(key));
      void retireCandidateQuietly(prevCandidate);
      if (session && mayIssueRemoteWork(session, session.uid)) {
        void load();
      }
    },

    load,

    setCandidate(
      next: LetterheadCandidateImage | null,
      warnings: TemplateWarningKey[] = []
    ): void {
      if (!stillOwns(owner)) {
        void retireCandidateQuietly(next);
        return;
      }
      const prev = published.candidate;
      setPublished({
        ...published,
        candidate: next,
        templateWarnings: warnings,
      });
      if (prev && prev.localUri !== next?.localUri) {
        void retireCandidateQuietly(prev);
      }
    },

    setMargins(margins: LetterheadMargins): void {
      if (!stillOwns(owner)) return;
      setPublished({ ...published, margins });
    },

    setSignatureUri(uri: string | null): void {
      if (!stillOwns(owner)) return;
      setPublished({ ...published, signatureUri: uri });
    },

    setStampUri(uri: string | null): void {
      if (!stillOwns(owner)) return;
      setPublished({ ...published, stampUri: uri });
    },

    setDefaultName(v: string): void {
      if (!stillOwns(owner)) return;
      setPublished({ ...published, defaultName: v });
    },

    setDefaultTitle(v: string): void {
      if (!stillOwns(owner)) return;
      setPublished({ ...published, defaultTitle: v });
    },

    setDefaultClose(v: string): void {
      if (!stillOwns(owner)) return;
      setPublished({ ...published, defaultClose: v });
    },

    setError(error: string | null): void {
      if (!stillOwns(owner)) return;
      setPublished({ ...published, error });
    },

    clearRetiredOwnerFields(opOwner: SyncSessionToken): void {
      if (!stillOwns(opOwner)) return;
      const prev = published.candidate;
      setPublished(clearedRetiredOwnerFields(ownerKeyOf(opOwner)));
      void retireCandidateQuietly(prev);
    },

    async save(): Promise<{ navigate: boolean; saved?: LetterheadConfig }> {
      const opOwner = owner;
      if (!opOwner || !mayIssueRemoteWork(opOwner, opOwner.uid)) {
        return { navigate: false };
      }
      const snap = published;
      const templateUri =
        snap.candidate?.localUri ?? snap.existing?.imageDataUri ?? null;
      if (!templateUri) {
        setPublished({ ...published, error: "need_image" });
        return { navigate: false };
      }

      const seq = ++saveSeq;
      setPublished({ ...published, saving: true, error: null });

      try {
        let imageForSave = templateUri;
        if (snap.candidate) {
          if (ports.useLocalFileForSave === false && ports.readCandidateDataUri) {
            imageForSave = await ports.readCandidateDataUri(snap.candidate);
            if (seq !== saveSeq || !stillOwns(opOwner)) {
              return { navigate: false };
            }
          } else {
            imageForSave = snap.candidate.localUri;
          }
        }

        const saved = await ports.save(
          opOwner.uid,
          {
            sourceType: "imported_image",
            generatedLayout: null,
            imageDataUri: imageForSave,
            imageWidth: snap.candidate?.width ?? snap.existing?.imageWidth ?? 0,
            imageHeight: snap.candidate?.height ?? snap.existing?.imageHeight ?? 0,
            margins: snap.margins,
            signatureDataUri: snap.signatureUri,
            stampDataUri: snap.stampUri,
            defaultSenderName: snap.defaultName.trim() || null,
            defaultSenderTitle: snap.defaultTitle.trim() || null,
            defaultComplimentaryClose: snap.defaultClose.trim() || null,
            repeatTemplateAllPages: true,
          },
          opOwner
        );

        if (seq !== saveSeq || !stillOwns(opOwner)) {
          return { navigate: false };
        }

        const done = published.candidate;
        setPublished({
          ...published,
          saving: false,
          existing: saved,
          candidate: null,
          templateWarnings: [],
          error: null,
        });
        void retireCandidateQuietly(done);
        return { navigate: true, saved };
      } catch (e) {
        if (seq !== saveSeq || !stillOwns(opOwner)) {
          return { navigate: false };
        }
        const retired =
          !mayIssueRemoteWork(opOwner, opOwner.uid) ||
          (e instanceof Error &&
            (e.name === "StorageUploadOwnershipError" ||
              (e as { failureCode?: string }).failureCode === "session_retired"));
        if (retired) {
          const prev = published.candidate;
          setPublished({
            ...clearedRetiredOwnerFields(ownerKeyOf(opOwner)),
            saving: false,
            error: "session_retired",
          });
          void retireCandidateQuietly(prev);
        } else {
          setPublished({
            ...published,
            saving: false,
            error: e instanceof Error ? e.message : "save_failed",
          });
        }
        return { navigate: false };
      }
    },

    dispose(): void {
      listeners.clear();
      const prev = published.candidate;
      published = emptySnapshot("signed_out#0");
      owner = null;
      void retireCandidateQuietly(prev);
    },
  };

  return api;
}

export type LetterheadSetupEditorRuntime = ReturnType<
  typeof createLetterheadSetupEditorRuntime
>;
