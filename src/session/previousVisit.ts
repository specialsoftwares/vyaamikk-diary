/**
 * Device-local previous app-use visit.
 *
 * A visit is one continuous use of this app by one owner on this device.
 * It starts when `openAppVisit` runs and there is no open visit for that
 * owner, the device auth session (`signedInAt`) changes, or the app has
 * been away from the foreground for at least `APP_VISIT_GAP_MS`.
 * Shorter absences stay in the same visit, so the displayed time does not
 * move. The value is captured from the prior visit's start BEFORE the
 * current visit start is written, then held for the rest of this visit.
 *
 * Scope of the displayed timestamp: device-local. It lives only in this
 * app's AsyncStorage ledger (`vyd_app_visit_v1`), keyed by owner uid, and
 * is never written to the account profile. It is not account-wide.
 *
 * Session fields are read and then deliberately not shown:
 * - `lastLoginAt` / `previousLoginAt` — account-wide sign-in times
 *   (profile). They are not app-use visits.
 * - `signedInAt` — device-local auth-session start. Used only to notice a
 *   new sign-in, never as the displayed visit.
 * - `lastActiveAt` — account-synced usage heartbeat. It moves during the
 *   current session and can reflect another device, so it is not a visit.
 *
 * This module does not write those fields and does not heartbeat.
 * Callers must not await it on the startup path.
 */

export const APP_VISIT_GAP_MS = 30 * 60 * 1000;

export const PREVIOUS_VISIT_STORAGE_KEY = "vyd_app_visit_v1";

export type PreviousVisitKind = "previous" | "first" | "unavailable";

export interface PreviousVisitSnapshot {
  ownerUid: string;
  kind: PreviousVisitKind;
  /** Prior visit start on this device. Null unless `kind` is `previous`. */
  previousVisitAt: number | null;
  /** Start of the visit now in progress. Stable until the next boundary. */
  currentVisitStartedAt: number;
  /** Displayed time is recorded on this device. It is not account-wide. */
  scope: "device-local";
}

export interface PreviousVisitStore {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

export interface OpenAppVisitInput {
  ownerUid: string;
  now?: number;
  lastLoginAt?: number | null;
  previousLoginAt?: number | null;
  signedInAt?: number | null;
  lastActiveAt?: number | null;
}

interface SessionFieldInput {
  lastLoginAt?: number | null;
  previousLoginAt?: number | null;
  signedInAt?: number | null;
  lastActiveAt?: number | null;
}

export interface ClassifiedSessionFields {
  lastLoginAt: {
    scope: "account-wide";
    role: "current-sign-in";
    display: false;
    value: number | null;
  };
  previousLoginAt: {
    scope: "account-wide";
    role: "prior-sign-in";
    display: false;
    value: number | null;
  };
  signedInAt: {
    scope: "device-local";
    role: "auth-session-boundary";
    display: false;
    value: number | null;
  };
  lastActiveAt: {
    scope: "account-synced";
    role: "heartbeat";
    display: false;
    value: number | null;
  };
}

export interface OwnerVisitRecord {
  ownerUid: string;
  currentVisitStartedAt: number;
  previousVisitAt: number | null;
  signedInAt: number | null;
}

export interface OpenAppVisit extends OwnerVisitRecord {
  kind: PreviousVisitKind;
  backgroundedAt: number | null;
}

export interface VisitPlan {
  snapshot: PreviousVisitSnapshot;
  open: OpenAppVisit | null;
  persist: OwnerVisitRecord | null;
}

interface LedgerFile {
  version: 1;
  owners: Record<string, unknown>;
}

let memory: OpenAppVisit | null = null;
let queue: Promise<unknown> = Promise.resolve();

function finiteInstant(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

/** Read login / activity fields and record why none of them is the visit line. */
export function classifySessionFields(input: SessionFieldInput): ClassifiedSessionFields {
  return {
    lastLoginAt: {
      scope: "account-wide",
      role: "current-sign-in",
      display: false,
      value: finiteInstant(input.lastLoginAt),
    },
    previousLoginAt: {
      scope: "account-wide",
      role: "prior-sign-in",
      display: false,
      value: finiteInstant(input.previousLoginAt),
    },
    signedInAt: {
      scope: "device-local",
      role: "auth-session-boundary",
      display: false,
      value: finiteInstant(input.signedInAt),
    },
    lastActiveAt: {
      scope: "account-synced",
      role: "heartbeat",
      display: false,
      value: finiteInstant(input.lastActiveAt),
    },
  };
}

export function toPreviousVisitSnapshot(open: OpenAppVisit): PreviousVisitSnapshot {
  return {
    ownerUid: open.ownerUid,
    kind: open.kind,
    previousVisitAt: open.kind === "previous" ? open.previousVisitAt : null,
    currentVisitStartedAt: open.currentVisitStartedAt,
    scope: "device-local",
  };
}

function unavailableSnapshot(ownerUid: string, now: number): PreviousVisitSnapshot {
  return {
    ownerUid,
    kind: "unavailable",
    previousVisitAt: null,
    currentVisitStartedAt: now > 0 && Number.isFinite(now) ? now : 0,
    scope: "device-local",
  };
}

function kindFromPrevious(
  previousVisitAt: number | null,
  currentVisitStartedAt: number
): { kind: PreviousVisitKind; previousVisitAt: number | null } {
  if (previousVisitAt == null) return { kind: "first", previousVisitAt: null };
  if (
    previousVisitAt > 0 &&
    Number.isFinite(previousVisitAt) &&
    previousVisitAt < currentVisitStartedAt
  ) {
    return { kind: "previous", previousVisitAt };
  }
  return { kind: "unavailable", previousVisitAt: null };
}

function adoptRecord(record: OwnerVisitRecord): OpenAppVisit {
  const resolved = kindFromPrevious(record.previousVisitAt, record.currentVisitStartedAt);
  return {
    ownerUid: record.ownerUid,
    currentVisitStartedAt: record.currentVisitStartedAt,
    previousVisitAt: resolved.previousVisitAt,
    signedInAt: record.signedInAt,
    kind: resolved.kind,
    backgroundedAt: null,
  };
}

/**
 * Same visit when the app has not been away for a full gap and the device
 * auth session has not moved to a later sign-in. Learning `signedInAt` after
 * the visit already started, or a transient null, does not roll the visit.
 * A clock that moved backwards is not a new visit.
 */
export function visitContinues(open: OpenAppVisit, signedInAt: number | null, now: number): boolean {
  if (now < open.currentVisitStartedAt) return true;
  if (open.signedInAt != null && signedInAt != null && open.signedInAt !== signedInAt) {
    return false;
  }
  if (open.backgroundedAt != null && now - open.backgroundedAt >= APP_VISIT_GAP_MS) return false;
  return true;
}

function startVisit(args: {
  ownerUid: string;
  now: number;
  signedInAt: number | null;
  capturedPrevious: number | null;
}): VisitPlan {
  const resolved = kindFromPrevious(args.capturedPrevious, args.now);
  const open: OpenAppVisit = {
    ownerUid: args.ownerUid,
    currentVisitStartedAt: args.now,
    previousVisitAt: resolved.previousVisitAt,
    signedInAt: args.signedInAt,
    kind: resolved.kind,
    backgroundedAt: null,
  };
  return {
    snapshot: toPreviousVisitSnapshot(open),
    open,
    persist: {
      ownerUid: open.ownerUid,
      currentVisitStartedAt: open.currentVisitStartedAt,
      previousVisitAt: open.previousVisitAt,
      signedInAt: open.signedInAt,
    },
  };
}

export function planAppVisit(input: {
  ownerUid: string;
  now: number;
  lastLoginAt?: number | null;
  previousLoginAt?: number | null;
  signedInAt?: number | null;
  lastActiveAt?: number | null;
  stored: OwnerVisitRecord | null;
  open: OpenAppVisit | null;
}): VisitPlan {
  const classified = classifySessionFields(input);
  if (
    classified.lastLoginAt.display ||
    classified.previousLoginAt.display ||
    classified.signedInAt.display ||
    classified.lastActiveAt.display
  ) {
    throw new Error("Session fields must not be displayed as previous visit");
  }
  const signedInAt = classified.signedInAt.value;
  const now = input.now;
  const open = input.open && input.open.ownerUid === input.ownerUid ? input.open : null;

  if (!Number.isFinite(now) || now <= 0) {
    return { snapshot: unavailableSnapshot(input.ownerUid, 0), open, persist: null };
  }

  if (open && now < open.currentVisitStartedAt) {
    return { snapshot: toPreviousVisitSnapshot(open), open, persist: null };
  }

  if (open && visitContinues(open, signedInAt, now)) {
    const next: OpenAppVisit = {
      ...open,
      signedInAt: open.signedInAt ?? signedInAt,
      backgroundedAt: null,
    };
    return { snapshot: toPreviousVisitSnapshot(next), open: next, persist: null };
  }

  if (open) {
    const captured = open.currentVisitStartedAt < now ? open.currentVisitStartedAt : null;
    return startVisit({ ownerUid: input.ownerUid, now, signedInAt, capturedPrevious: captured });
  }

  const stored =
    input.stored && input.stored.ownerUid === input.ownerUid ? input.stored : null;
  if (!stored) {
    return startVisit({
      ownerUid: input.ownerUid,
      now,
      signedInAt,
      capturedPrevious: null,
    });
  }

  if (stored.currentVisitStartedAt >= now) {
    const adopted = adoptRecord(stored);
    return { snapshot: toPreviousVisitSnapshot(adopted), open: adopted, persist: null };
  }

  return startVisit({
    ownerUid: input.ownerUid,
    now,
    signedInAt,
    capturedPrevious: stored.currentVisitStartedAt,
  });
}

function emptyLedger(): LedgerFile {
  return { version: 1, owners: {} };
}

function parseLedger(raw: string | null): LedgerFile {
  if (!raw) return emptyLedger();
  try {
    const parsed = JSON.parse(raw) as Partial<LedgerFile>;
    if (!parsed || parsed.version !== 1 || !parsed.owners || typeof parsed.owners !== "object") {
      return emptyLedger();
    }
    return { version: 1, owners: parsed.owners };
  } catch {
    return emptyLedger();
  }
}

export function readOwnerVisitRecord(
  owners: Record<string, unknown>,
  ownerUid: string
): OwnerVisitRecord | null {
  const raw = owners[ownerUid];
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Partial<OwnerVisitRecord>;
  if (rec.ownerUid !== ownerUid) return null;
  const current = finiteInstant(rec.currentVisitStartedAt);
  if (current == null) return null;
  const previousRaw = rec.previousVisitAt;
  const previous =
    previousRaw == null ? null : finiteInstant(previousRaw);
  if (previousRaw != null && previous == null) return null;
  const signedRaw = rec.signedInAt;
  const signedInAt = signedRaw == null ? null : finiteInstant(signedRaw);
  if (signedRaw != null && signedInAt == null) return null;
  return {
    ownerUid,
    currentVisitStartedAt: current,
    previousVisitAt: previous,
    signedInAt,
  };
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** Remember that the app left the foreground. Does not write storage or profile fields. */
export function markAppVisitBackground(now: number, ownerUid?: string): void {
  if (!memory) return;
  if (ownerUid && memory.ownerUid !== ownerUid) return;
  if (!Number.isFinite(now) || now <= 0) return;
  if (memory.backgroundedAt == null) memory.backgroundedAt = now;
}

export function peekAppVisit(ownerUid: string): PreviousVisitSnapshot | null {
  if (!memory || memory.ownerUid !== ownerUid) return null;
  return toPreviousVisitSnapshot(memory);
}

export function resetAppVisitForTests(): void {
  memory = null;
  queue = Promise.resolve();
}

export function createMemoryPreviousVisitStore(initial: string | null = null): PreviousVisitStore & {
  snapshot(): string | null;
} {
  let raw = initial;
  return {
    read: async () => raw,
    write: async (value: string) => {
      raw = value;
    },
    snapshot: () => raw,
  };
}

let defaultStorePromise: Promise<PreviousVisitStore> | null = null;

async function defaultPreviousVisitStore(): Promise<PreviousVisitStore> {
  if (!defaultStorePromise) {
    defaultStorePromise = import("@react-native-async-storage/async-storage").then((mod) => {
      const AsyncStorage = mod.default;
      return {
        read: () => AsyncStorage.getItem(PREVIOUS_VISIT_STORAGE_KEY),
        write: (value: string) => AsyncStorage.setItem(PREVIOUS_VISIT_STORAGE_KEY, value),
      };
    });
  }
  return defaultStorePromise;
}

/**
 * Open or continue the device-local visit. Safe to call more than once in a
 * session: a repeat does not advance the displayed previous visit.
 * Storage errors leave the in-memory visit in place, or return `unavailable`
 * when nothing has been captured yet. They do not throw to the caller.
 */
export async function openAppVisit(
  input: OpenAppVisitInput,
  store?: PreviousVisitStore
): Promise<PreviousVisitSnapshot> {
  const now = input.now ?? Date.now();
  if (!input.ownerUid) return unavailableSnapshot("", 0);
  if (!Number.isFinite(now) || now <= 0) {
    return peekAppVisit(input.ownerUid) ?? unavailableSnapshot(input.ownerUid, 0);
  }

  return enqueue(async () => {
    const resolved = store ?? (await defaultPreviousVisitStore());
    const open = memory && memory.ownerUid === input.ownerUid ? memory : null;
    const signedInAt = classifySessionFields(input).signedInAt.value;
    const canContinue = open != null && visitContinues(open, signedInAt, now);

    let ledger = emptyLedger();
    let stored: OwnerVisitRecord | null = null;
    if (!canContinue) {
      try {
        ledger = parseLedger(await resolved.read());
        stored = readOwnerVisitRecord(ledger.owners, input.ownerUid);
      } catch {
        if (open) return toPreviousVisitSnapshot(open);
        return unavailableSnapshot(input.ownerUid, now);
      }
    }

    const plan = planAppVisit({
      ...input,
      now,
      stored: canContinue ? null : stored,
      open,
    });

    if (plan.persist) {
      try {
        const owners = { ...ledger.owners, [input.ownerUid]: plan.persist };
        await resolved.write(JSON.stringify({ version: 1, owners }));
      } catch {
        // Keep the in-memory visit. The next cold start may retry.
      }
    }

    if (plan.open) memory = plan.open;
    return plan.snapshot;
  });
}
