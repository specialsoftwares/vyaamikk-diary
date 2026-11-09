/**
 * Owner-scoped receipt outbox. Network retries never invent another affirmative choice.
 * An older acknowledgement cannot delete a newer choice: responses carry a sequence,
 * and a server revision older than the current choice is ignored.
 * Activation behavior ported from ef9c77f; stored-withdrawal cleanup retry from 1c1a014.
 */
import {
  applyServerAcknowledgement,
  beginLocalChoice,
  canActivateNative,
  crashConsentForAccount,
  hydrateCrashConsent,
  initialCrashConsent,
  nativeFromApply,
  choiceWasReplaced,
  unsentDeletionWasRequested,
  withPersistFailure,
  type CrashConsentModel,
  type CrashNative,
} from "../telemetry/crashConsentState";

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
  sync: "unknown" | "pending" | "synced" | "conflict" | "storage_error" | "listener_unavailable";
  /** Account-scoped crash consent. Absent on older stored records and test fixtures. */
  consent?: CrashConsentModel;
};
export type PurposeQueuePorts = {
  load(uid: string): Promise<PurposeQueueState | null>;
  save(state: PurposeQueueState): Promise<void>;
  send(input: PurposeMutation | { uid: string; purpose: "crash_diagnostics"; action: "read" }): Promise<PurposeServerState>;
  generation(): number;
  applyLocal(enabled: boolean, options?: { deleteUnsentReports?: boolean }): Promise<unknown>;
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

function storedWithdrawal(state: PurposeQueueState): boolean {
  if (state.pending?.decision === "withdraw") return true;
  if (state.consent?.choice.decision === "withdraw") return true;
  if (state.consent?.choice.decision === "allow") return false;
  return state.hasChoice === true && state.localGrant === false && state.pending?.decision !== "grant";
}

export function createPurposeConsentQueue(ports: PurposeQueuePorts) {
  let activeUid: string | null = null;
  let choiceEpoch = 0;
  let requestSequence = 0;
  let tail: Promise<unknown> = Promise.resolve();
  const states = new Map<string, PurposeQueueState>();
  const listeners = new Set<() => void>();
  let stopObserve: (() => void) | null = null;
  let observedGeneration = -1;
  // Listening means the subscription was accepted. It is not a server snapshot.
  // A failed watcher invalidates enabling work already in flight.
  let authorityHealthy = ports.observeRemote == null;
  let authorityFailed = false;
  const initial = (uid: string): PurposeQueueState => ({
    uid,
    revision: 0,
    localGrant: false,
    hasChoice: false,
    pending: null,
    sync: "unknown",
    consent: initialCrashConsent(uid),
  });
  const notify = () => listeners.forEach((listener) => listener());
  function publish(state: PurposeQueueState) {
    const consent = crashConsentForAccount(state.consent, state.uid);
    states.set(state.uid, { ...state, consent });
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
  function hydrate(uid: string, stored: PurposeQueueState | null, fromDisk: boolean): PurposeQueueState {
    const base = stored && stored.uid === uid ? stored : initial(uid);
    const consent = hydrateCrashConsent(
      {
        uid,
        revision: base.revision,
        localGrant: base.localGrant,
        hasChoice: base.hasChoice,
        pending: base.pending,
        sync: base.sync,
        consent: base.consent,
      },
      fromDisk
    );
    return { ...base, uid, consent };
  }
  async function load(uid: string): Promise<PurposeQueueState> {
    const cached = states.get(uid);
    if (cached?.consent?.choice.uid === uid) return cached;
    const stored = await ports.load(uid);
    const state = hydrate(uid, stored, true);
    states.set(uid, state);
    return state;
  }
  async function persist(state: PurposeQueueState): Promise<boolean> {
    const consent = crashConsentForAccount(state.consent, state.uid);
    const next = { ...state, consent };
    publish(next);
    try {
      await ports.save(next);
      return true;
    } catch {
      publish({ ...next, localGrant: false, sync: "storage_error", consent: withPersistFailure(consent) });
      return false;
    }
  }
  function noteDeletion(uid: string, result: unknown) {
    if (!unsentDeletionWasRequested(result)) return;
    const state = states.get(uid);
    if (!state?.consent || state.consent.choice.uid !== uid) return;
    publish({ ...state, consent: { ...state.consent, unsentDeletionRequested: true } });
  }
  function closeNative(enabled: boolean, deleteUnsentReports: boolean): Promise<unknown> {
    // Pass the flag explicitly. A default of "delete on every disable" would
    // drop unsent reports while an Allow is only paused.
    return ports.applyLocal(enabled, { deleteUnsentReports });
  }
  async function flush(uid: string, generation: number, epoch: number) {
    const sequence = ++requestSequence;
    const current = () => owns(uid, generation, epoch) && sequence === requestSequence;
    let state = await load(uid);
    if (!current()) return;
    const consentAtStart = state.consent ?? initialCrashConsent(uid);
    if (ports.observeRemote && (!authorityHealthy || observedGeneration !== generation)) {
      await closeNative(false, false);
      if (!current()) return;
      if (state.pending?.decision === "withdraw") {
        // A withdrawal is still delivered while the watcher is down.
      } else if (authorityFailed || consentAtStart.enablingInvalidated) {
        await persist({
          ...state,
          localGrant: false,
          pending: null,
          sync: "listener_unavailable",
          consent: {
            ...consentAtStart,
            pending: null,
            native: "disabled",
            enablingInvalidated: true,
            sessionAcknowledgement: null,
          },
        });
        return;
      } else if (state.pending?.decision === "grant") {
        // The watcher is not a server snapshot yet. Keep the persisted allow.
        publish({
          ...state,
          localGrant: false,
          consent: { ...consentAtStart, native: "disabled" },
        });
        return;
      } else {
        publish({
          ...state,
          localGrant: false,
          consent: {
            ...consentAtStart,
            native:
              consentAtStart.native === "failed" || consentAtStart.native === "unavailable"
                ? consentAtStart.native
                : "disabled",
          },
        });
        return;
      }
    }
    // Never transmit a grant whose affirmative choice could not be persisted.
    // A withdrawal still attempts the server stop even if local storage failed.
    if (state.sync === "storage_error" && state.pending?.decision !== "withdraw") return;
    if (state.consent?.enablingInvalidated && state.pending?.decision !== "withdraw") {
      await closeNative(false, false);
      return;
    }
    let remote: PurposeServerState;
    try {
      remote = await ports.send(state.pending ?? { uid, purpose: "crash_diagnostics", action: "read" });
    } catch {
      if (current()) {
        publish({
          ...state,
          sync: state.sync === "storage_error" ? "storage_error" : state.pending ? "pending" : "unknown",
        });
      }
      return;
    }
    if (!current()) return;
    if (ports.observeRemote && (!authorityHealthy || observedGeneration !== generation)) {
      await closeNative(false, false);
      return;
    }
    const latestConsent = states.get(uid)?.consent ?? consentAtStart;
    // A newer choice won while this request was in flight. Do not delete it.
    if (choiceWasReplaced(consentAtStart, latestConsent)) return;
    const applied = applyServerAcknowledgement(latestConsent, remote);
    if (applied.stale) return;
    const next: PurposeQueueState = {
      ...state,
      revision: applied.matches || applied.conflict ? remote.revision : state.revision,
      localGrant: false,
      hasChoice: applied.consent.choice.decision !== "unset",
      pending: applied.matches || applied.conflict ? null : state.pending,
      sync: applied.conflict ? "conflict" : applied.matches ? "synced" : state.pending ? "pending" : state.sync,
      consent: applied.consent,
    };
    let saved = false;
    await enqueue(async () => {
      if (!current()) return;
      const again = states.get(uid)?.consent;
      if (!again || choiceWasReplaced(consentAtStart, again)) return;
      saved = await persist(next);
    });
    if (!saved || !current()) return;
    if (ports.observeRemote && (!authorityHealthy || observedGeneration !== generation)) {
      await closeNative(false, false);
      return;
    }
    const fresh = states.get(uid) ?? next;
    const freshConsent = fresh.consent ?? next.consent!;
    if (freshConsent.choice.uid !== uid || freshConsent.choice.decision !== next.consent!.choice.decision) return;
    if (freshConsent.pending && freshConsent.pending.operationId !== consentAtStart.pending?.operationId) return;
    if (freshConsent.enablingInvalidated && freshConsent.choice.decision !== "withdraw") {
      await closeNative(false, false);
      return;
    }
    if (canActivateNative(freshConsent)) {
      publish({ ...fresh, localGrant: true, consent: { ...freshConsent, native: "enabling" } });
      const activated = await closeNative(true, false);
      if (!current()) return;
      const native = nativeFromApply(true, activated);
      const now = states.get(uid) ?? fresh;
      const nowConsent = now.consent ?? freshConsent;
      if (nowConsent.choice.uid !== uid || nowConsent.choice.decision !== freshConsent.choice.decision) return;
      if (nowConsent.pending && nowConsent.pending.operationId !== consentAtStart.pending?.operationId) return;
      if (native !== "enabled") {
        publish({ ...now, localGrant: false, consent: { ...nowConsent, native } });
        return;
      }
      publish({ ...now, localGrant: true, consent: { ...nowConsent, native: "enabled" } });
      return;
    }
    const deleteUnsent = freshConsent.choice.decision === "withdraw";
    const closed = await closeNative(false, deleteUnsent);
    if (!current()) return;
    noteDeletion(uid, closed);
    const native: CrashNative = nativeFromApply(false, closed);
    const now = states.get(uid) ?? fresh;
    const nowConsent = now.consent ?? freshConsent;
    publish({
      ...now,
      localGrant: false,
      consent: {
        ...nowConsent,
        native: native === "enabled" ? "disabled" : native,
        unsentDeletionRequested: nowConsent.unsentDeletionRequested || unsentDeletionWasRequested(closed),
      },
    });
  }
  function confirmIfReady(uid: string, generation: number, epoch: number) {
    void Promise.resolve().then(async () => {
      if (!owns(uid, generation, epoch)) return;
      const state = states.get(uid);
      if (!state?.consent || state.consent.enablingInvalidated || state.consent.choice.uid !== uid) return;
      if (state.consent.choice.decision !== "allow") return;
      if (
        !state.pending &&
        state.consent.native === "enabled" &&
        state.consent.sessionAcknowledgement === state.consent.choice.revision
      ) {
        return;
      }
      await flush(uid, generation, epoch);
    });
  }
  return {
    bind(uid: string | null) {
      const generation = ports.generation();
      if (activeUid === uid && observedGeneration === generation) return;
      stopObserve?.();
      stopObserve = null;
      const accountChanged = activeUid != null && activeUid !== uid;
      const retired = activeUid;
      activeUid = uid;
      observedGeneration = generation;
      choiceEpoch += 1;
      const epochAtBind = choiceEpoch;
      // Startup pauses a prior allow. Account retirement also requests unsent-report deletion.
      const paused = closeNative(false, accountChanged);
      if (accountChanged && retired) {
        void Promise.resolve(paused).then((result) => noteDeletion(retired, result));
      }
      if (uid) {
        const cached = states.get(uid);
        if (cached?.consent?.choice.uid === uid) {
          publish({
            ...cached,
            localGrant: false,
            consent: {
              ...cached.consent,
              sessionAcknowledgement: null,
              native:
                cached.consent.native === "failed" || cached.consent.native === "unavailable"
                  ? cached.consent.native
                  : "disabled",
            },
          });
        }
        void (async () => {
          let withdrawn = false;
          try {
            withdrawn = storedWithdrawal(await load(uid));
          } catch {
            withdrawn = false;
          }
          if (activeUid !== uid || ports.generation() !== generation || choiceEpoch !== epochAtBind) return;
          if (withdrawn) {
            const cleaned = await closeNative(false, true);
            noteDeletion(uid, cleaned);
          }
        })();
      }
      if (uid && ports.observeRemote) {
        authorityHealthy = false;
        authorityFailed = false;
        stopObserve = ports.observeRemote(uid, generation, (remote) => {
          if (activeUid !== uid || ports.generation() !== generation) return;
          if (remote.decision !== "withdraw") return;
          const knownState = states.get(uid);
          const known = Math.max(knownState?.revision ?? 0, knownState?.consent?.choice.revision ?? 0);
          if (remote.revision < known) return;
          if (
            remote.revision === knownState?.consent?.choice.revision &&
            knownState.consent.choice.decision === "allow" &&
            knownState.consent.acknowledgement?.revision === knownState.consent.choice.revision
          ) {
            return;
          }
          // An authoritative withdrawal stops collection and requests local cleanup.
          void closeNative(false, true).then((result) => noteDeletion(uid, result));
          choiceEpoch += 1;
          const epoch = choiceEpoch;
          void enqueue(async () => {
            if (!owns(uid, generation, epoch)) return;
            const state = await load(uid);
            if (remote.revision < Math.max(state.revision, state.consent?.choice.revision ?? 0)) return;
            const applied = applyServerAcknowledgement(state.consent ?? initialCrashConsent(uid), remote);
            if (applied.stale || applied.consent.choice.uid !== uid) return;
            await persist({
              ...state,
              localGrant: false,
              hasChoice: true,
              pending: null,
              revision: remote.revision,
              sync: "synced",
              consent: { ...applied.consent, native: "disabled" },
            });
          });
        }, (health) => {
          if (activeUid !== uid || ports.generation() !== generation) return;
          if (health === "listening") return;
          if (health === "server") {
            authorityHealthy = true;
            authorityFailed = false;
            confirmIfReady(uid, generation, choiceEpoch);
            return;
          }
          authorityHealthy = false;
          authorityFailed = true;
          choiceEpoch += 1;
          void closeNative(false, false);
          const state = states.get(uid);
          if (state?.consent) {
            const keepWithdraw = state.pending?.decision === "withdraw" ? state.pending : null;
            void persist({
              ...state,
              localGrant: false,
              pending: keepWithdraw,
              sync: "listener_unavailable",
              consent: {
                ...state.consent,
                native: "disabled",
                enablingInvalidated: keepWithdraw ? state.consent.enablingInvalidated : true,
                pending: keepWithdraw ? state.consent.pending : null,
                sessionAcknowledgement: null,
              },
            });
          }
        });
      }
      notify();
    },
    state(uid: string | null) {
      if (!uid) return null;
      return states.get(uid) ?? initial(uid);
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    choose(uid: string, enabled: boolean): Promise<void> {
      const generation = ports.generation();
      const epoch = ++choiceEpoch;
      // Withdrawal closes the gate before persistence. Allow stays off until acknowledgement.
      const stopped = closeNative(false, !enabled);
      void Promise.resolve(stopped).then((result) => {
        if (!owns(uid, generation, epoch)) return;
        noteDeletion(uid, result);
      });
      return enqueue(async () => {
        if (!owns(uid, generation, epoch)) return;
        const state = await load(uid);
        if (!owns(uid, generation, epoch)) return;
        const operationId = ports.operationId();
        const consent = beginLocalChoice(state.consent ?? initialCrashConsent(uid), enabled ? "allow" : "withdraw", {
          operationId,
          expectedServerRevision: state.revision,
        });
        const next: PurposeQueueState = {
          ...state,
          localGrant: false,
          hasChoice: true,
          sync: "pending",
          pending: {
            uid,
            purpose: "crash_diagnostics",
            decision: enabled ? "grant" : "withdraw",
            operationId,
            expectedRevision: state.revision,
            noticeVersion: PROCESSING_NOTICE_VERSION,
            policyVersion: PROCESSING_POLICY_VERSION,
          },
          consent,
        };
        if (!(await persist(next)) || !owns(uid, generation, epoch)) return;
        const saved = states.get(uid);
        if (saved?.consent?.pending && !saved.consent.pending.persistFailed) {
          publish({
            ...saved,
            consent: { ...saved.consent, pending: { ...saved.consent.pending, phase: "sync" } },
          });
        }
      }).then(async () => {
        if (owns(uid, generation, epoch)) await flush(uid, generation, epoch);
      });
    },
    reconcile(uid: string): Promise<void> {
      const generation = ports.generation();
      const epoch = choiceEpoch;
      return enqueue(async () => {
        if (!owns(uid, generation, epoch)) return;
        await closeNative(false, false);
        if (!owns(uid, generation, epoch)) return;
        const state = await load(uid);
        if (owns(uid, generation, epoch) && storedWithdrawal(state)) {
          const cleaned = await closeNative(false, true);
          noteDeletion(uid, cleaned);
        }
      }).then(async () => {
        if (owns(uid, generation, epoch)) await flush(uid, generation, epoch);
      });
    },
  };
}
