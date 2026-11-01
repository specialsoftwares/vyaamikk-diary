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
export type PurposeSync =
  | "unknown"
  | "pending"
  | "saving"
  | "synced"
  | "conflict"
  | "storage_error"
  | "listener_unavailable"
  | "activation_failed"
  | "unavailable";
export type PurposeQueueState = {
  uid: string;
  revision: number;
  /** User's allow intent. This is not the native reporting gate. */
  localGrant: boolean;
  hasChoice: boolean;
  pending: PurposeMutation | null;
  sync: PurposeSync;
  /** True only after durable grant, server acknowledgement, and native activation. */
  reportingEnabled?: boolean;
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
    generation: number,
    onRemote: (remote: PurposeServerState) => void,
    onHealth: (health: "listening" | "server" | "failed") => void
  ): () => void;
};

export const PROCESSING_NOTICE_VERSION = "privacy-notice-2026-10";
export const PROCESSING_POLICY_VERSION = "processing-purpose-2026-10";

export type CrashConsentStatus = "off" | "saving" | "waiting" | "activation_failed" | "unavailable" | "on";

export type CrashConsentPresentation = {
  status: CrashConsentStatus;
  valueKey: string;
  noteKey: string | null;
};

/** Settings and the prompt share one reading of the consent machine. */
export function presentCrashConsent(state: PurposeQueueState | null): CrashConsentPresentation {
  if (!state || !state.hasChoice) {
    return { status: "off", valueKey: "settings.crashReportsOff", noteKey: null };
  }
  if (state.sync === "saving") {
    return {
      status: "saving",
      valueKey: "settings.crashReportsSaving",
      noteKey: "settings.crashReportsSavingNote",
    };
  }
  if (state.pending?.decision === "withdraw" || !state.localGrant) {
    const noteKey =
      state.sync === "conflict"
        ? "settings.crashReportsConflict"
        : state.sync === "storage_error"
          ? "settings.crashReportsSaveFailed"
          : state.pending?.decision === "withdraw"
            ? "settings.crashReportsPending"
            : null;
    return { status: "off", valueKey: "settings.crashReportsOff", noteKey };
  }
  if (state.sync === "activation_failed") {
    return {
      status: "activation_failed",
      valueKey: "settings.crashReportsActivationFailed",
      noteKey: "settings.crashReportsActivationFailedNote",
    };
  }
  if (state.sync === "unavailable") {
    return {
      status: "unavailable",
      valueKey: "settings.crashReportsUnavailable",
      noteKey: "settings.crashReportsUnavailableNote",
    };
  }
  if (state.sync === "conflict") {
    return { status: "off", valueKey: "settings.crashReportsOff", noteKey: "settings.crashReportsConflict" };
  }
  if (state.sync === "storage_error") {
    return {
      status: "waiting",
      valueKey: "settings.crashReportsWaiting",
      noteKey: "settings.crashReportsSaveFailed",
    };
  }
  if (state.reportingEnabled && state.sync === "synced" && !state.pending) {
    return { status: "on", valueKey: "settings.crashReportsOn", noteKey: null };
  }
  return {
    status: "waiting",
    valueKey: "settings.crashReportsWaiting",
    noteKey: "settings.crashReportsPending",
  };
}

function copyState(state: PurposeQueueState): PurposeQueueState {
  return { ...state, pending: state.pending ? { ...state.pending } : null };
}

export function createPurposeConsentQueue(ports: PurposeQueuePorts) {
  let activeUid: string | null = null;
  let choiceEpoch = 0;
  let requestSequence = 0;
  let healthEpoch = 0;
  let tail: Promise<unknown> = Promise.resolve();
  const states = new Map<string, PurposeQueueState>();
  const durable = new Map<string, PurposeQueueState>();
  const listeners = new Set<() => void>();
  let stopObserve: (() => void) | null = null;
  let observedGeneration = -1;
  // Listening means the subscription was accepted. It is not a server snapshot.
  // A missing snapshot or a failed watcher must not delete a pending Allow.
  let authorityHealthy = ports.observeRemote == null;
  let watcherFailed = false;
  const initial = (uid: string): PurposeQueueState => ({
    uid,
    revision: 0,
    localGrant: false,
    hasChoice: false,
    pending: null,
    sync: "unknown",
    reportingEnabled: false,
  });
  const notify = () => listeners.forEach((listener) => listener());
  function publish(state: PurposeQueueState) {
    states.set(state.uid, copyState(state));
    notify();
  }
  function owns(uid: string, generation: number, epoch: number) {
    return activeUid === uid && ports.generation() === generation && choiceEpoch === epoch;
  }
  function enqueue(work: () => Promise<void>): Promise<void> {
    const run = tail.then(work, work);
    tail = run.catch(() => undefined);
    return run;
  }
  function watcherBlocked(generation: number): boolean {
    return ports.observeRemote != null && (!authorityHealthy || observedGeneration !== generation);
  }
  function grantIsDurable(state: PurposeQueueState): boolean {
    if (state.pending?.decision !== "grant") return true;
    return durable.get(state.uid)?.pending?.operationId === state.pending.operationId;
  }
  function waitingAllow(state: PurposeQueueState): PurposeQueueState {
    return {
      ...state,
      localGrant: true,
      hasChoice: true,
      reportingEnabled: false,
      sync: watcherFailed ? "listener_unavailable" : "pending",
    };
  }
  async function load(uid: string): Promise<PurposeQueueState> {
    const cached = states.get(uid);
    if (cached) return cached;
    const stored = await ports.load(uid);
    if (stored && stored.uid === uid) {
      // A previous process may have saved reportingEnabled. This session stays
      // off until the server is current and native activation succeeds again.
      const state = { ...copyState(stored), reportingEnabled: false };
      states.set(uid, state);
      durable.set(uid, copyState(state));
      return state;
    }
    const state = initial(uid);
    states.set(uid, state);
    return state;
  }
  async function persist(state: PurposeQueueState): Promise<boolean> {
    const previous = durable.get(state.uid);
    publish(state);
    try {
      await ports.save(state);
      durable.set(state.uid, copyState(state));
      return true;
    } catch {
      // A failed save of a new allow must not erase an older durable allow.
      // A withdrawal stays in memory so it can be retried and cannot be overwritten by that allow.
      if (state.pending?.decision === "withdraw" || (!state.localGrant && state.hasChoice)) {
        publish({ ...state, localGrant: false, hasChoice: true, reportingEnabled: false, sync: "storage_error" });
        return false;
      }
      if (previous) publish({ ...copyState(previous), reportingEnabled: false });
      else publish({ ...initial(state.uid), sync: "storage_error" });
      return false;
    }
  }
  async function closeReporting(): Promise<void> {
    try {
      await ports.applyLocal(false);
    } catch {
      // Closing the gate is best-effort. The user's stored choice is separate.
    }
  }
  function classifyActivation(result: unknown): "ok" | "failed" | "unavailable" {
    if (result == null || typeof result !== "object") return "ok";
    const record = result as { ok?: unknown; nativeState?: unknown; status?: unknown };
    const nativeState = typeof record.nativeState === "string" ? record.nativeState : "";
    const status = typeof record.status === "string" ? record.status : "";
    if (nativeState === "unavailable" || status === "unavailable") return "unavailable";
    if (record.ok === false || nativeState === "error" || nativeState === "off" || status === "rejected") return "failed";
    return "ok";
  }
  async function tryActivate(): Promise<"ok" | "failed" | "unavailable"> {
    try {
      const outcome = classifyActivation(await ports.applyLocal(true));
      if (outcome !== "ok") await closeReporting();
      return outcome;
    } catch {
      await closeReporting();
      return "failed";
    }
  }
  async function commit(
    uid: string,
    generation: number,
    epoch: number,
    sequence: number,
    next: PurposeQueueState
  ): Promise<boolean> {
    let saved = false;
    await enqueue(async () => {
      if (!owns(uid, generation, epoch) || sequence !== requestSequence) return;
      const latest = states.get(uid);
      if (latest?.pending?.decision === "withdraw" && next.localGrant && next.pending?.decision !== "withdraw") return;
      saved = await persist(next);
    });
    return saved;
  }
  async function flush(uid: string, generation: number, epoch: number) {
    const sequence = ++requestSequence;
    const current = () => owns(uid, generation, epoch) && sequence === requestSequence;
    try {
      let state = await load(uid);
      if (!current()) return;
      if (watcherBlocked(generation) && state.pending?.decision !== "withdraw") {
        await closeReporting();
        if (!current()) return;
        const latest = states.get(uid) ?? state;
        if (latest.pending?.decision === "withdraw" || (!latest.localGrant && latest.pending?.decision !== "grant")) return;
        if (latest.pending?.decision === "grant" || latest.localGrant) {
          await commit(uid, generation, epoch, sequence, waitingAllow(latest));
        }
        return;
      }
      // Never transmit a grant whose affirmative choice could not be persisted.
      // A withdrawal still attempts the server stop even if local storage failed.
      if (state.pending?.decision === "grant" && !grantIsDurable(state)) {
        await closeReporting();
        return;
      }
      if (current()) publish({ ...state, sync: "saving", reportingEnabled: false });
      let remote: PurposeServerState;
      try {
        remote = await ports.send(state.pending ?? { uid, purpose: "crash_diagnostics", action: "read" });
      } catch {
        if (!current()) return;
        const latest = states.get(uid);
        if (latest?.pending?.decision === "withdraw" && state.pending?.decision !== "withdraw") return;
        publish({
          ...state,
          reportingEnabled: false,
          sync: state.pending ? (watcherFailed || watcherBlocked(generation) ? "listener_unavailable" : "pending") : "unknown",
        });
        return;
      }
      if (!current()) return;
      const latest = states.get(uid) ?? state;
      if (latest.pending?.decision === "withdraw" && state.pending?.decision !== "withdraw") return;
      if (watcherBlocked(generation) && state.pending?.decision !== "withdraw") {
        await closeReporting();
        if (!current()) return;
        const kept = states.get(uid) ?? state;
        if (kept.pending?.decision === "withdraw" || (!kept.localGrant && state.pending?.decision !== "grant")) return;
        if (state.pending?.decision === "grant" || kept.localGrant) {
          await commit(uid, generation, epoch, sequence, waitingAllow({ ...state, ...kept, pending: state.pending ?? kept.pending }));
        }
        return;
      }
      const pending = state.pending;
      const conflict = remote.conflict === true;
      const localAllow = pending?.decision === "grant" || (pending == null && latest.localGrant && state.localGrant);
      const allow = !conflict && remote.decision === "grant" && localAllow && latest.pending?.decision !== "withdraw";
      const seenHealth = healthEpoch;
      let outcome: "ok" | "failed" | "unavailable" | "skipped" = "skipped";
      if (allow) {
        outcome = await tryActivate();
        if (!current() || watcherBlocked(generation) || seenHealth !== healthEpoch) {
          await closeReporting();
          if (!current()) return;
          const kept = states.get(uid) ?? state;
          if (kept.pending?.decision === "withdraw" || !kept.localGrant) return;
          await commit(
            uid,
            generation,
            epoch,
            sequence,
            waitingAllow({ ...state, pending: pending?.decision === "grant" ? pending : kept.pending })
          );
          return;
        }
      } else {
        await closeReporting();
        if (!current()) return;
      }
      const knewChoice = state.hasChoice || pending != null || latest.hasChoice;
      const next: PurposeQueueState = allow
        ? {
            ...state,
            revision: remote.revision,
            localGrant: true,
            hasChoice: true,
            pending: null,
            reportingEnabled: outcome === "ok",
            sync: outcome === "ok" ? "synced" : outcome === "unavailable" ? "unavailable" : "activation_failed",
          }
        : {
            ...state,
            revision: remote.revision,
            localGrant: false,
            hasChoice: knewChoice || remote.decision === "withdraw" || remote.decision === "grant",
            pending: null,
            reportingEnabled: false,
            sync: conflict ? "conflict" : "synced",
          };
      // A read of an empty account must not invent a choice or adopt another device's grant.
      if (!pending && !state.localGrant && !latest.localGrant && remote.decision !== "withdraw") {
        next.localGrant = false;
        next.hasChoice = state.hasChoice;
        next.reportingEnabled = false;
        next.sync = conflict ? "conflict" : "synced";
      }
      const saved = await commit(uid, generation, epoch, sequence, next);
      // A superseded flush must not toggle the gate a newer choice already owns.
      if (!current()) return;
      if (seenHealth !== healthEpoch || watcherBlocked(generation) || (allow && (outcome !== "ok" || !saved))) {
        await closeReporting();
        return;
      }
      notify();
    } catch {
      await closeReporting();
    }
  }
  function preserveAfterWatcherFailure(uid: string) {
    const state = states.get(uid);
    if (!state) return;
    if (state.pending?.decision === "withdraw") {
      publish({ ...state, localGrant: false, reportingEnabled: false, sync: "listener_unavailable" });
      return;
    }
    if (state.pending?.decision === "grant" || state.localGrant) {
      publish({
        ...state,
        localGrant: true,
        hasChoice: true,
        reportingEnabled: false,
        sync: "listener_unavailable",
      });
      return;
    }
    if (state.hasChoice) publish({ ...state, reportingEnabled: false, sync: "listener_unavailable" });
  }
  return {
    bind(uid: string | null) {
      const generation = ports.generation();
      if (activeUid === uid && observedGeneration === generation) return;
      stopObserve?.();
      stopObserve = null;
      activeUid = uid;
      observedGeneration = generation;
      choiceEpoch += 1;
      healthEpoch += 1;
      watcherFailed = false;
      authorityHealthy = ports.observeRemote == null;
      if (uid) {
        const existing = states.get(uid);
        if (existing?.reportingEnabled) publish({ ...existing, reportingEnabled: false });
      }
      // Synchronous call enters the existing immediate native opt-out gate.
      void closeReporting();
      if (uid && ports.observeRemote) {
        authorityHealthy = false;
        stopObserve = ports.observeRemote(uid, generation, (remote) => {
          if (activeUid !== uid || ports.generation() !== generation) return;
          if (remote.decision !== "withdraw") return;
          const known = states.get(uid)?.revision ?? 0;
          if (remote.revision < known) return;
          // Stop collection before persistence. A blocked save must not delay the stop.
          void closeReporting();
          choiceEpoch += 1;
          healthEpoch += 1;
          const epoch = choiceEpoch;
          void enqueue(async () => {
            if (!owns(uid, generation, epoch)) return;
            const state = await load(uid);
            if (remote.revision < state.revision) return;
            await persist({
              ...state,
              localGrant: false,
              hasChoice: true,
              pending: null,
              reportingEnabled: false,
              revision: remote.revision,
              sync: "synced",
            });
          });
        }, (health) => {
          if (activeUid !== uid || ports.generation() !== generation) return;
          if (health === "listening") return;
          if (health === "server") {
            const recovered = !authorityHealthy || watcherFailed;
            watcherFailed = false;
            authorityHealthy = true;
            // Later snapshots are not a new choice and must not abort activation.
            if (!recovered) return;
            healthEpoch += 1;
            const epoch = choiceEpoch;
            void flush(uid, generation, epoch);
            return;
          }
          watcherFailed = true;
          authorityHealthy = false;
          healthEpoch += 1;
          void closeReporting();
          preserveAfterWatcherFailure(uid);
          const epoch = choiceEpoch;
          void enqueue(async () => {
            if (!owns(uid, generation, epoch) || authorityHealthy) return;
            const state = await load(uid);
            if (state.pending?.decision === "withdraw") {
              await persist({ ...state, localGrant: false, reportingEnabled: false, sync: "listener_unavailable" });
              return;
            }
            if (state.pending?.decision === "grant" || state.localGrant) {
              await persist(waitingAllow({ ...state, sync: "listener_unavailable" }));
            }
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
      const stopped = closeReporting();
      let ready = false;
      return enqueue(async () => {
        await stopped;
        if (!owns(uid, generation, epoch)) return;
        const state = await load(uid);
        if (!owns(uid, generation, epoch)) return;
        const next: PurposeQueueState = {
          ...state,
          localGrant: enabled,
          hasChoice: true,
          reportingEnabled: false,
          sync: "pending",
          pending: {
            uid,
            purpose: "crash_diagnostics",
            decision: enabled ? "grant" : "withdraw",
            operationId: ports.operationId(),
            expectedRevision: state.revision,
            noticeVersion: PROCESSING_NOTICE_VERSION,
            policyVersion: PROCESSING_POLICY_VERSION,
          },
        };
        const saved = await persist(next);
        if (!owns(uid, generation, epoch)) return;
        // Storage failure of a new allow must not be sent. A withdrawal still is.
        if (!saved && next.pending?.decision !== "withdraw") return;
        ready = true;
      }).then(async () => {
        if (ready && owns(uid, generation, epoch)) await flush(uid, generation, epoch);
      });
    },
    reconcile(uid: string): Promise<void> {
      const generation = ports.generation();
      const epoch = choiceEpoch;
      return enqueue(async () => {
        if (!owns(uid, generation, epoch)) return;
        await closeReporting();
        if (!owns(uid, generation, epoch)) return;
        await load(uid);
      }).then(async () => {
        if (owns(uid, generation, epoch)) await flush(uid, generation, epoch);
      });
    },
  };
}
