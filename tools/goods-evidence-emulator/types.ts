export interface G1DocSnap {
  readonly exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface G1QueryDocSnap extends G1DocSnap {
  readonly id: string;
  readonly path: string;
}

export interface G1DocRef {
  readonly path: string;
}

export interface G1Transaction {
  get(ref: G1DocRef): Promise<G1DocSnap>;
  set(ref: G1DocRef, data: Record<string, unknown>): void;
  /** Direct children of a collection path. Used by authorized receipt reads. */
  list(collectionPath: string): Promise<G1QueryDocSnap[]>;
}

export interface G1Firestore {
  doc(path: string): G1DocRef;
  runTransaction<T>(
    fn: (tx: G1Transaction) => Promise<T>,
    options?: { maxAttempts?: number }
  ): Promise<T>;
}

export interface G1Clock {
  nowMs: () => number;
  uuid: () => string;
}

export interface TrustedCaller {
  /** Authenticated Firebase uid. Null if unauthenticated. Not taken from the body. */
  uid: string | null;
}

export interface G1Hooks {
  /** Invoked after every determining read and before any write, per attempt. */
  afterReads?: (attempt: number) => Promise<void> | void;
}

export type G1DenyCode =
  | "unauthenticated"
  | "forbidden"
  | "policy_denied"
  | "not_found"
  | "invalid"
  | "digest_conflict"
  | "receipt_exists"
  | "integrity"
  | "serial_exhausted"
  | "version_conflict"
  | "voided";

export type G1RegisterSuccess = {
  ok: true;
  replayed: boolean;
  receiptId: string;
  issuedNumber: string;
  serial: number;
  serverRegisteredAtUtc: string;
  eventVersion: number;
  headHash: string;
};

export type G1Deny = { ok: false; code: G1DenyCode; detail: string };

export type G1RegisterResult = G1RegisterSuccess | G1Deny;

export type G1MutationSuccess = {
  ok: true;
  replayed: boolean;
  receiptId: string;
  eventId: string;
  eventVersion: number;
  headHash: string;
  /** Attempt clock at the successful commit attempt; not firestoreCommitTime. */
  serverAcceptedAtUtc: string;
};

export type G1MutationResult = G1MutationSuccess | G1Deny;

export type G1CommandResult = G1RegisterResult | G1MutationResult;

export type G1MutationCommandType =
  | "amendFields"
  | "recordQc"
  | "dispatchReturn"
  | "correctReturnDispatch"
  | "voidWithReason"
  | "recordEwbObservation"
  | "linkVerifiedEvidence";

/** wave1b stored command result. Reconcile must not assume register-only fields. */
export type G1StoredCommandResult =
  | (G1RegisterSuccess & { commandType: "registerGoodsReceipt" })
  | (G1MutationSuccess & { commandType: G1MutationCommandType });

export type G1ReconcileResult = G1StoredCommandResult | G1Deny;

export type AdmissionPolicy = {
  schemaVersion: 1;
  newCommands: "allow" | "deny";
  reconciliation: "allow" | "deny";
};
