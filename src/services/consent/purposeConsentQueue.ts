/** Owner-scoped receipt outbox. Network retries never invent another affirmative choice. */
export type PurposeDecision = "grant" | "withdraw";
export type PurposeMutation = {
  uid: string;
  purpose: "crash_diagnostics";
  decision: PurposeDecision;
  operationId: string;
  expectedRevision: number;
  noticeVersion: string;
  policyVersion: string;
};
export type PurposeServerState = {
  ok: true;
  revision: number;
  decision: PurposeDecision | null;
  receivedAt: number | null;
  conflict?: boolean;
};
export type PurposeQueueState = {
  uid: string;
  revision: number;
  localGrant: boolean;
  hasChoice: boolean;
  pending: PurposeMutation | null;
  sync: "unknown" | "pending" | "synced" | "conflict" | "storage_error";
};
export type PurposeQueuePorts = {
  load(uid: string): Promise<PurposeQueueState | null>;
  save(state: PurposeQueueState): Promise<void>;
  send(input: PurposeMutation | { uid: string; purpose: "crash_diagnostics"; action: "read" }): Promise<PurposeServerState>;
  generation(): number;
  applyLocal(enabled: boolean): Promise<unknown>;
  operationId(): string;
  observeRemote?(
    uid: string,
    onRemote: (remote: PurposeServerState) => void
  ): () => void;
};

export const PROCESSING_NOTICE_VERSION = "privacy-notice-2026-10";
export const PROCESSING_POLICY_VERSION = "processing-purpose-2026-10";

export function createPurposeConsentQueue(ports: PurposeQueuePorts) {
  let activeUid: string | null = null;
  let choiceEpoch = 0;
  let requestSequence = 0;
  let tail: Promise<unknown> = Promise.resolve();
  const states = new Map<string, PurposeQueueState>();
  const listeners = new Set<() => void>();
  let stopObserve: (() => void) | null = null;
  const initial = (uid: string): PurposeQueueState => ({ uid, revision: 0, localGrant: false, hasChoice: false, pending: null, sync: "unknown" });
  const notify = () => listeners.forEach((listener) => listener());
  function publish(state: PurposeQueueState) { states.set(state.uid, state); notify(); }
  function owns(uid: string, generation: number, epoch: number) {
    return activeUid === uid && ports.generation() === generation && choiceEpoch === epoch;
  }
  function enqueue(work: () => Promise<void>): Promise<void> {
    const run = tail.then(work, work);
    tail = run.catch(() => undefined);
    return run;
  }
  async function load(uid: string): Promise<PurposeQueueState> {
    const cached = states.get(uid);
    if (cached) return cached;
    const stored = await ports.load(uid);
    const state = stored && stored.uid === uid ? stored : initial(uid);
    states.set(uid, state);
    return state;
  }
  async function persist(state: PurposeQueueState): Promise<boolean> {
    publish(state);
    try { await ports.save(state); return true; }
    catch { publish({ ...state, localGrant: false, sync: "storage_error" }); return false; }
  }
  async function flush(uid: string, generation: number, epoch: number) {
    const sequence = ++requestSequence;
    const current = () => owns(uid, generation, epoch) && sequence === requestSequence;
    let state = await load(uid);
    if (!current()) return;
    // Never transmit a grant whose affirmative choice could not be persisted.
    // A withdrawal still attempts the server stop even if local storage failed.
    if (state.sync === "storage_error" && state.pending?.decision !== "withdraw") return;
    let remote: PurposeServerState;
    try {
      remote = await ports.send(state.pending ?? { uid, purpose: "crash_diagnostics", action: "read" });
    } catch {
      if (current()) publish({ ...state, sync: state.sync === "storage_error" ? "storage_error" : state.pending ? "pending" : "unknown" });
      return;
    }
    if (!current()) return;
    const pending = state.pending;
    state = {
      ...state,
      revision: remote.revision,
      // A receipt replay returns CURRENT state, so an old accepted grant cannot revive withdrawal.
      localGrant: state.localGrant && remote.decision === "grant" && !remote.conflict,
      pending: null,
      sync: remote.conflict ? "conflict" : "synced",
    };
    let saved = false;
    await enqueue(async () => {
      if (current()) saved = await persist(state);
    });
    if (!saved || !current()) return;
    // Only this device's affirmative choice permits collection. Another phone's grant does not.
    if (state.localGrant && (!pending || pending.decision === "grant")) await ports.applyLocal(true);
    else await ports.applyLocal(false);
    notify();
  }
  return {
    bind(uid: string | null) {
      if (activeUid === uid) return;
      stopObserve?.();
      stopObserve = null;
      activeUid = uid;
      choiceEpoch += 1;
      // Synchronous call enters the existing immediate native opt-out gate.
      void ports.applyLocal(false);
      if (uid && ports.observeRemote) {
        const generation = ports.generation();
        stopObserve = ports.observeRemote(uid, (remote) => {
          if (activeUid !== uid || ports.generation() !== generation) return;
          if (remote.decision !== "withdraw") return;
          choiceEpoch += 1;
          const epoch = choiceEpoch;
          void enqueue(async () => {
            if (!owns(uid, generation, epoch)) return;
            await ports.applyLocal(false);
            if (!owns(uid, generation, epoch)) return;
            const state = await load(uid);
            await persist({
              ...state,
              localGrant: false,
              hasChoice: true,
              pending: null,
              revision: remote.revision,
              sync: "synced",
            });
          });
        });
      }
      notify();
    },
    state(uid: string | null) { return uid ? states.get(uid) ?? initial(uid) : null; },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    choose(uid: string, enabled: boolean): Promise<void> {
      const generation = ports.generation();
      const epoch = ++choiceEpoch;
      // An opt-in also remains off until its authoritative receipt is acknowledged.
      const stopped = ports.applyLocal(false);
      return enqueue(async () => {
        await stopped;
        if (!owns(uid, generation, epoch)) return;
        const state = await load(uid);
        if (!owns(uid, generation, epoch)) return;
        const next: PurposeQueueState = {
          ...state, localGrant: enabled, hasChoice: true, sync: "pending",
          pending: {
            uid, purpose: "crash_diagnostics", decision: enabled ? "grant" : "withdraw",
            operationId: ports.operationId(), expectedRevision: state.revision,
            noticeVersion: PROCESSING_NOTICE_VERSION, policyVersion: PROCESSING_POLICY_VERSION,
          },
        };
        if (!await persist(next) || !owns(uid, generation, epoch)) return;
      }).then(async () => {
        if (owns(uid, generation, epoch)) await flush(uid, generation, epoch);
      });
    },
    reconcile(uid: string): Promise<void> {
      const generation = ports.generation();
      const epoch = choiceEpoch;
      return enqueue(async () => {
        if (!owns(uid, generation, epoch)) return;
        await ports.applyLocal(false);
        if (!owns(uid, generation, epoch)) return;
      }).then(async () => {
        if (owns(uid, generation, epoch)) await flush(uid, generation, epoch);
      });
    },
  };
}
