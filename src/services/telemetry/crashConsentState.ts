/**
 * Account-scoped crash-report consent.
 * Reviewed activation and cleanup behavior: ef9c77f, 1c1a014.
 *
 * choice, pending, acknowledgement, and native are separate.
 * Reporting is active only when the choice is persisted, the acknowledgement
 * matches that choice revision, and native activation has succeeded.
 */

export const CRASH_CONSENT_SOURCE_SHAS = ["ef9c77f", "1c1a014"] as const;

export type CrashChoiceDecision = "unset" | "allow" | "withdraw";

export type CrashChoice = {
  decision: CrashChoiceDecision;
  /** Monotonic for this account. A newer decision always has a higher revision. */
  revision: number;
  uid: string;
};

/** Persistence or server sync that has not been acknowledged. */
export type CrashPending = {
  phase: "persist" | "sync";
  decision: "allow" | "withdraw";
  /** Choice revision this attempt belongs to. */
  revision: number;
  operationId: string;
  expectedServerRevision: number;
  /** The local save failed. Native collection stays off. */
  persistFailed: boolean;
};

/** Server revision that matches the current choice, or none. */
export type CrashAcknowledgement = {
  revision: number;
  decision: "allow" | "withdraw";
  serverRevision: number;
};

export type CrashNative =
  | "disabled"
  | "enabling"
  | "enabled"
  | "disabling"
  | "failed"
  | "unavailable";

export type CrashConsentModel = {
  choice: CrashChoice;
  pending: CrashPending | null;
  acknowledgement: CrashAcknowledgement | null;
  native: CrashNative;
  /**
   * A failed watcher invalidated an in-flight allow.
   * Reconnect must not turn collection back on until a new choice.
   */
  enablingInvalidated: boolean;
  /** deleteUnsentReports was invoked. This is not deletion of uploaded reports. */
  unsentDeletionRequested: boolean;
  /**
   * Choice revision confirmed by a server response in this process.
   * A stored acknowledgement is not enough after a restart.
   */
  sessionAcknowledgement: number | null;
};

export type CrashConsentStatus = "pending" | "active" | "failed" | "unavailable" | "off";

type LegacyConsentInput = {
  uid: string;
  revision: number;
  localGrant?: boolean;
  hasChoice?: boolean;
  pending?: { decision?: string; operationId?: string; expectedRevision?: number } | null;
  sync?: string;
  consent?: CrashConsentModel | null;
};

export function initialCrashConsent(uid: string): CrashConsentModel {
  return {
    choice: { decision: "unset", revision: 0, uid },
    pending: null,
    acknowledgement: null,
    native: "disabled",
    enablingInvalidated: false,
    unsentDeletionRequested: false,
    sessionAcknowledgement: null,
  };
}

function isDecision(value: unknown): value is CrashChoiceDecision {
  return value === "unset" || value === "allow" || value === "withdraw";
}

function isNative(value: unknown): value is CrashNative {
  return (
    value === "disabled" ||
    value === "enabling" ||
    value === "enabled" ||
    value === "disabling" ||
    value === "failed" ||
    value === "unavailable"
  );
}

function legacyConsent(input: LegacyConsentInput): CrashConsentModel {
  const pendingDecision =
    input.pending?.decision === "grant" ? "allow" : input.pending?.decision === "withdraw" ? "withdraw" : null;
  const storedDecision: CrashChoiceDecision = !input.hasChoice
    ? "unset"
    : input.localGrant
      ? "allow"
      : "withdraw";
  const decision = pendingDecision ?? storedDecision;
  const revision = pendingDecision ? input.revision + 1 : input.revision;
  const acknowledged =
    !pendingDecision && input.hasChoice === true && input.sync === "synced" && decision !== "unset";
  return {
    choice: { decision, revision, uid: input.uid },
    pending:
      pendingDecision && input.pending
        ? {
            phase: input.sync === "storage_error" ? "persist" : "sync",
            decision: pendingDecision,
            revision,
            operationId: input.pending.operationId ?? "",
            expectedServerRevision: input.pending.expectedRevision ?? input.revision,
            persistFailed: input.sync === "storage_error",
          }
        : null,
    acknowledgement: acknowledged ? { revision: input.revision, decision, serverRevision: input.revision } : null,
    native: "disabled",
    enablingInvalidated: input.sync === "listener_unavailable",
    unsentDeletionRequested: false,
    sessionAcknowledgement: null,
  };
}

/** Load a stored record. Another account's choice is dropped. Disk loads are not yet active. */
export function hydrateCrashConsent(input: LegacyConsentInput, fromDisk: boolean): CrashConsentModel {
  const stored = input.consent;
  const own =
    stored &&
    stored.choice &&
    stored.choice.uid === input.uid &&
    isDecision(stored.choice.decision) &&
    Number.isSafeInteger(stored.choice.revision)
      ? stored
      : null;
  const base = own
    ? {
        ...own,
        choice: { ...own.choice, uid: input.uid },
        pending: own.pending ? { ...own.pending } : null,
        acknowledgement: own.acknowledgement ? { ...own.acknowledgement } : null,
        native: isNative(own.native) ? own.native : "disabled",
        enablingInvalidated: own.enablingInvalidated === true,
        unsentDeletionRequested: own.unsentDeletionRequested === true,
        sessionAcknowledgement:
          typeof own.sessionAcknowledgement === "number" ? own.sessionAcknowledgement : null,
      }
    : legacyConsent(input);
  if (base.choice.uid !== input.uid) return initialCrashConsent(input.uid);
  if (fromDisk) {
    base.sessionAcknowledgement = null;
    if (base.native !== "failed" && base.native !== "unavailable") base.native = "disabled";
  }
  return base;
}

export function beginLocalChoice(
  consent: CrashConsentModel,
  decision: "allow" | "withdraw",
  input: { operationId: string; expectedServerRevision: number }
): CrashConsentModel {
  // The next server revision, not a locally inflated counter. Overlapping
  // choices share this proposal; the newer operation id wins.
  const revision = input.expectedServerRevision + 1;
  return {
    choice: { decision, revision, uid: consent.choice.uid },
    pending: {
      phase: "persist",
      decision,
      revision,
      operationId: input.operationId,
      expectedServerRevision: input.expectedServerRevision,
      persistFailed: false,
    },
    acknowledgement: null,
    native: decision === "withdraw" ? "disabling" : "disabled",
    enablingInvalidated: false,
    unsentDeletionRequested: consent.unsentDeletionRequested,
    sessionAcknowledgement: null,
  };
}

function remoteChoice(decision: "grant" | "withdraw" | null): CrashChoiceDecision {
  if (decision === "grant") return "allow";
  if (decision === "withdraw") return "withdraw";
  return "unset";
}

function confirmed(
  consent: CrashConsentModel,
  decision: "allow" | "withdraw",
  revision: number
): CrashConsentModel {
  return {
    ...consent,
    choice: { decision, revision, uid: consent.choice.uid },
    pending: null,
    acknowledgement: { revision, decision, serverRevision: revision },
    sessionAcknowledgement: revision,
    native: decision === "withdraw" ? "disabling" : consent.native,
    enablingInvalidated: false,
  };
}

export function applyServerAcknowledgement(
  consent: CrashConsentModel,
  remote: { revision: number; decision: "grant" | "withdraw" | null; conflict?: boolean }
): { consent: CrashConsentModel; stale: boolean; conflict: boolean; matches: boolean } {
  const unchanged = { consent, stale: true, conflict: false, matches: false };
  if (remote.conflict) {
    return {
      consent: { ...consent, native: "disabled", sessionAcknowledgement: null, pending: null },
      stale: false,
      conflict: true,
      matches: false,
    };
  }
  const remoteDecision = remoteChoice(remote.decision);
  const pending = consent.pending;
  if (pending) {
    // A snapshot from before this choice was sent cannot delete it.
    if (remote.revision <= pending.expectedServerRevision) return unchanged;
    // A grant acknowledgement must not overwrite a newer withdrawal.
    if (remoteDecision === "allow" && pending.decision === "withdraw") return unchanged;
    if (remoteDecision === pending.decision) {
      return { consent: confirmed(consent, remoteDecision, remote.revision), stale: false, conflict: false, matches: true };
    }
    if (remoteDecision === "withdraw" && pending.decision === "allow") {
      return { consent: confirmed(consent, "withdraw", remote.revision), stale: false, conflict: false, matches: true };
    }
    return unchanged;
  }
  if (consent.choice.decision !== "unset" && remote.revision < consent.choice.revision) return unchanged;
  if (
    remote.revision === consent.choice.revision &&
    remoteDecision === consent.choice.decision &&
    remoteDecision !== "unset"
  ) {
    return { consent: confirmed(consent, remoteDecision, remote.revision), stale: false, conflict: false, matches: true };
  }
  if (remoteDecision === "withdraw" && remote.revision > consent.choice.revision) {
    return { consent: confirmed(consent, "withdraw", remote.revision), stale: false, conflict: false, matches: true };
  }
  return unchanged;
}

/** True when a newer decision replaced the choice that started an in-flight request. */
export function choiceWasReplaced(start: CrashConsentModel, now: CrashConsentModel): boolean {
  if (now.choice.uid !== start.choice.uid) return true;
  if (now.choice.decision !== start.choice.decision) return true;
  if (now.choice.revision > start.choice.revision) return true;
  if (start.pending && now.pending && now.pending.operationId !== start.pending.operationId) return true;
  return false;
}

/** This process may turn native collection on. */
export function canActivateNative(consent: CrashConsentModel): boolean {
  return (
    consent.choice.decision === "allow" &&
    consent.choice.uid.length > 0 &&
    consent.pending == null &&
    !consent.enablingInvalidated &&
    consent.acknowledgement != null &&
    consent.acknowledgement.revision === consent.choice.revision &&
    consent.acknowledgement.decision === "allow" &&
    consent.sessionAcknowledgement === consent.choice.revision
  );
}

export function crashReportingActive(consent: CrashConsentModel): boolean {
  return canActivateNative(consent) && consent.native === "enabled";
}

/**
 * Settings status. Active is only the fully confirmed native session.
 * A restart clears the session acknowledgement, so a stored allow is pending
 * until this process confirms it and native activation succeeds.
 */
export function crashConsentStatus(consent: CrashConsentModel): CrashConsentStatus {
  if (consent.native === "unavailable") return "unavailable";
  if (consent.pending?.persistFailed || consent.native === "failed") return "failed";
  if (crashReportingActive(consent)) return "active";
  if (consent.choice.decision === "unset") return "off";
  if (consent.enablingInvalidated && consent.pending == null && consent.choice.decision === "allow") return "off";
  if (
    consent.pending != null ||
    consent.native === "enabling" ||
    consent.native === "disabling" ||
    consent.choice.decision === "allow"
  ) {
    return "pending";
  }
  return "off";
}

/** Process restart. Failed and unavailable stay visible. An active session is not still active. */
export function relaunchCrashConsent(consent: CrashConsentModel): CrashConsentModel {
  if (consent.native === "failed" || consent.native === "unavailable") {
    return { ...consent, sessionAcknowledgement: null };
  }
  return { ...consent, native: "disabled", sessionAcknowledgement: null };
}

/** Account B never receives account A's choice. */
export function crashConsentForAccount(
  consent: CrashConsentModel | null | undefined,
  uid: string
): CrashConsentModel {
  if (!consent || consent.choice.uid !== uid) return initialCrashConsent(uid);
  return consent;
}

export function nativeFromApply(requestedEnable: boolean, result: unknown): CrashNative {
  if (!result || typeof result !== "object") {
    return requestedEnable ? "unavailable" : "disabled";
  }
  const record = result as {
    native?: unknown;
    nativeState?: unknown;
    status?: unknown;
    sessionReporting?: unknown;
    preference?: unknown;
  };
  // A preference of true is the next process's consent bypass. It is not an active session.
  if (record.preference === true) return "failed";
  const bridgeEnabled = record.sessionReporting === true;
  if (
    requestedEnable &&
    bridgeEnabled &&
    (record.status === "enabled" || record.nativeState === "on" || record.native === "enabled")
  ) {
    return "enabled";
  }
  if (record.native === "unavailable" || record.nativeState === "unavailable" || record.status === "unavailable") {
    return "unavailable";
  }
  if (record.native === "failed" || record.nativeState === "error" || record.status === "rejected") {
    return "failed";
  }
  if (!requestedEnable) {
    if (record.sessionReporting === true) return "failed";
    if (isNative(record.native) && record.native !== "enabled") return record.native;
    return "disabled";
  }
  if (record.status === "superseded" || record.native === "disabled" || record.nativeState === "off") {
    return "disabled";
  }
  if (isNative(record.native) && record.native !== "enabled") return record.native;
  return "unavailable";
}

export function unsentDeletionWasRequested(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  return (result as { unsentReports?: unknown }).unsentReports === "deletion_requested";
}

export function withPersistFailure(consent: CrashConsentModel): CrashConsentModel {
  return {
    ...consent,
    native: "disabled",
    pending: consent.pending
      ? { ...consent.pending, phase: "persist", persistFailed: true }
      : {
          phase: "persist",
          decision: consent.choice.decision === "withdraw" ? "withdraw" : "allow",
          revision: consent.choice.revision,
          operationId: "",
          expectedServerRevision: 0,
          persistFailed: true,
        },
  };
}
