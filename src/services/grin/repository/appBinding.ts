/**
 * App binding and explicit GRIN session lifecycle.
 *
 * ONLY `startGrinOwnerSession` / `persistGrinOwnerSession` may call beginOwnerSession.
 * `getGrinApplicationRepository`, the repository, and stale callbacks must
 * never revive a retired session.
 *
 * The in-memory live token (uid + generation) flips synchronously in
 * `advanceGrinLiveToken` so A's captured origin fails immediately when B is
 * admitted, even if sqlite `endOwnerSession` is deferred to
 * `persistGrinOwnerSession` (useLayoutEffect). React render must not call
 * sqlite begin/end.
 *
 * Uses the device/local sqlite already opened by localDb. Does not import
 * HostSqlite (Node SQLITE_HOST), firebase-admin, emulator tools, or node:fs.
 *
 * Production server port is Team 1 `createFirebaseJsGrinTransport` (INJECTED /
 * FIREBASE_JS_HTTPS_CALLABLE). Live dispatch still requires the Functions
 * export and GRIN_GOODS_EVIDENCE_FUNCTIONS=true. This is not the uninjected
 * FAKE always-deny port.
 *
 * SQLITE_HOST / mounted-inert tests MUST inject createUninjectedGrinServerPort or
 * createFakeGrinServerPort via setGrinServerPortFactoryForTests, and FAKE / closed
 * evidence via setGrinEvidencePortFactoryForTests. Do not call live Firebase.
 * Tests that need SQLITE_HOST node-fs hashing inject setGrinLocalOriginalHasherFactoryForTests.
 */

import { getLocalDatabase } from "@/localDb/database";
import { GrinOutbox } from "@/services/grin/outbox/outbox";
import type { GrinEvidenceUploadPort, GrinServerCommandPort } from "@/services/grin/outbox/ports";
import type { GrinDispatchSession, GrinLocalOriginalHasher } from "@/services/grin/outbox/types";
import {
  createFirebaseJsGrinEvidenceTransport,
  createFirebaseJsGrinTransport,
} from "@/services/grin/transport";

import { GrinApplicationRepository } from "./GrinApplicationRepository";
import { GRIN_APPLICATION_LEDGER_ID } from "./labels";
import { createAppLocalOriginalHasher } from "./localOriginalHasher";
import {
  GRIN_BINDING_RETIRED,
  GRIN_SESSION_NOT_STARTED,
} from "./sessionErrors";
import type { GrinApplicationDb } from "./types";

type LiveBinding = {
  ownerUid: string;
  dispatchGeneration: number;
  outbox: GrinOutbox;
  repo: GrinApplicationRepository;
};

/** INJECTED JS httpsCallable port. Not live deploy. Not NATIVE_DEVICE. */
export const GRIN_APPLICATION_SERVER_PORT_LABEL =
  "INJECTED / FIREBASE_JS_HTTPS_CALLABLE. Not live deploy.";

/** INJECTED JS evidence callable. Fail-closed when unexported. Not live deploy. */
export const GRIN_APPLICATION_EVIDENCE_PORT_LABEL =
  "INJECTED / FIREBASE_JS_HTTPS_CALLABLE evidence. Not live deploy; fail-closed when unexported.";

let liveToken: GrinDispatchSession | null = null;
let live: LiveBinding | null = null;
let pendingSqliteRetire: LiveBinding | null = null;
let dbFactory: () => GrinApplicationDb = defaultDbFactory;
let serverPortFactory: () => GrinServerCommandPort = defaultGrinServerPortFactory;
let evidencePortFactory: () => GrinEvidenceUploadPort = defaultGrinEvidencePortFactory;
let hasherFactory: () => GrinLocalOriginalHasher = defaultGrinLocalOriginalHasherFactory;

function defaultDbFactory(): GrinApplicationDb {
  return getLocalDatabase() as unknown as GrinApplicationDb;
}

function defaultGrinServerPortFactory(): GrinServerCommandPort {
  return createFirebaseJsGrinTransport();
}

function defaultGrinEvidencePortFactory(): GrinEvidenceUploadPort {
  return createFirebaseJsGrinEvidenceTransport();
}

function defaultGrinLocalOriginalHasherFactory(): GrinLocalOriginalHasher {
  return createAppLocalOriginalHasher();
}

function isLiveSession(session: GrinDispatchSession): boolean {
  return (
    liveToken != null &&
    liveToken.ownerUid === session.ownerUid &&
    liveToken.dispatchGeneration === session.dispatchGeneration &&
    live != null &&
    live.ownerUid === session.ownerUid &&
    live.dispatchGeneration === session.dispatchGeneration
  );
}

function dropLiveRetrieval(previous: LiveBinding | null): void {
  if (previous) {
    pendingSqliteRetire = previous;
  }
  live = null;
}

function endSqliteBinding(binding: LiveBinding | null): void {
  if (!binding) return;
  try {
    binding.outbox.endOwnerSession(binding.ownerUid);
  } catch {
    // Retirement must still drop the binding if sqlite end fails.
  }
}

export function setGrinApplicationDbFactoryForTests(factory: (() => GrinApplicationDb) | null): void {
  dbFactory = factory ?? defaultDbFactory;
}

/**
 * SQLITE_HOST / mounted-inert tests inject FAKE or test INJECTED ports.
 * Pass null to restore the production default (createFirebaseJsGrinTransport).
 */
export function setGrinServerPortFactoryForTests(
  factory: (() => GrinServerCommandPort) | null
): void {
  serverPortFactory = factory ?? defaultGrinServerPortFactory;
}

/**
 * SQLITE_HOST / mounted-inert tests inject FAKE, uninjected, or a closed port.
 * Pass null to restore the production default (createFirebaseJsGrinEvidenceTransport).
 * Missing backend must stay originalDurable: false — never a silent success.
 */
export function setGrinEvidencePortFactoryForTests(
  factory: (() => GrinEvidenceUploadPort) | null
): void {
  evidencePortFactory = factory ?? defaultGrinEvidencePortFactory;
}

/**
 * SQLITE_HOST tests may inject the node-fs hasher. Pass null to restore
 * createAppLocalOriginalHasher (Expo FileSystem / injected retention fs).
 */
export function setGrinLocalOriginalHasherFactoryForTests(
  factory: (() => GrinLocalOriginalHasher) | null
): void {
  hasherFactory = factory ?? defaultGrinLocalOriginalHasherFactory;
}

/**
 * Synchronous in-memory authority. Does not call sqlite begin/end.
 * A's isBindingLive / origin lookup fail as soon as B (or logout) is admitted.
 */
export function advanceGrinLiveToken(ownerUid: string | null): GrinDispatchSession | null {
  const uid = ownerUid?.trim() || null;
  if (!uid) {
    if (liveToken || live) {
      dropLiveRetrieval(live);
      liveToken = null;
    }
    return null;
  }

  if (
    liveToken &&
    live &&
    liveToken.ownerUid === uid &&
    live.ownerUid === uid &&
    live.dispatchGeneration === liveToken.dispatchGeneration &&
    live.outbox.isSessionCurrent(live.repo.originatingSession())
  ) {
    return live.repo.originatingSession();
  }

  dropLiveRetrieval(live);
  liveToken = { ownerUid: uid, dispatchGeneration: Number.NaN };
  return liveToken;
}

/**
 * Sqlite persist for the current in-memory token. Safe in useLayoutEffect.
 * Must run only after `advanceGrinLiveToken` has already flipped the token.
 */
export function persistGrinOwnerSession(): GrinDispatchSession | null {
  const retiring = pendingSqliteRetire;
  pendingSqliteRetire = null;
  if (retiring && (!liveToken || retiring.ownerUid !== liveToken.ownerUid)) {
    endSqliteBinding(retiring);
  } else if (retiring && liveToken && retiring.ownerUid === liveToken.ownerUid) {
    pendingSqliteRetire = retiring;
  }

  if (!liveToken) {
    endSqliteBinding(pendingSqliteRetire);
    pendingSqliteRetire = null;
    live = null;
    return null;
  }

  const uid = liveToken.ownerUid;
  if (
    live &&
    live.ownerUid === uid &&
    live.outbox.isSessionCurrent(live.repo.originatingSession())
  ) {
    liveToken = live.repo.originatingSession();
    pendingSqliteRetire = null;
    return liveToken;
  }

  endSqliteBinding(pendingSqliteRetire);
  pendingSqliteRetire = null;
  if (live && live.ownerUid !== uid) {
    endSqliteBinding(live);
  }

  const db = dbFactory();
  const outbox = new GrinOutbox({
    db,
    server: serverPortFactory(),
    evidence: evidencePortFactory(),
    localOriginalHasher: hasherFactory(),
  });
  outbox.ensureSchema();
  const session = outbox.beginOwnerSession(uid);
  const repo = new GrinApplicationRepository({
    outbox,
    db,
    ownerUid: uid,
    ledgerId: GRIN_APPLICATION_LEDGER_ID,
    session,
    isBindingLive: isLiveSession,
  });
  liveToken = { ownerUid: session.ownerUid, dispatchGeneration: session.dispatchGeneration };
  live = {
    ownerUid: session.ownerUid,
    dispatchGeneration: session.dispatchGeneration,
    outbox,
    repo,
  };
  return { ownerUid: session.ownerUid, dispatchGeneration: session.dispatchGeneration };
}

/**
 * Explicit session lifecycle owner. The only production caller of
 * `outbox.beginOwnerSession` besides persistGrinOwnerSession.
 * Account change and logout retire the previous binding first.
 * Non-React callers (tests, scripts) use this synchronous path.
 */
export function startGrinOwnerSession(ownerUid: string): GrinDispatchSession {
  const uid = ownerUid.trim();
  if (!uid) throw new Error("missing_owner_uid");
  advanceGrinLiveToken(uid);
  const session = persistGrinOwnerSession();
  if (!session) throw new Error("missing_owner_uid");
  return session;
}

export function retireGrinOwnerSession(): void {
  advanceGrinLiveToken(null);
  persistGrinOwnerSession();
}

export function getLiveGrinDispatchSession(): GrinDispatchSession | null {
  if (!live || !liveToken) return null;
  if (liveToken.ownerUid !== live.ownerUid || liveToken.dispatchGeneration !== live.dispatchGeneration) {
    return null;
  }
  const session = live.repo.originatingSession();
  if (!live.outbox.isSessionCurrent(session)) return null;
  return session;
}

/**
 * Access the repository for the originating UID and dispatchGeneration.
 * Does not start or revive a session. Does not recapture a different live owner.
 */
export function getGrinApplicationRepository(
  ownerUid: string,
  dispatchGeneration: number
): GrinApplicationRepository {
  const uid = ownerUid.trim();
  if (!uid) throw new Error("missing_owner_uid");
  if (!liveToken || liveToken.ownerUid !== uid || liveToken.dispatchGeneration !== dispatchGeneration) {
    throw new Error(GRIN_BINDING_RETIRED);
  }
  if (!live || live.ownerUid !== uid || live.dispatchGeneration !== dispatchGeneration) {
    throw new Error(GRIN_BINDING_RETIRED);
  }
  if (!live.outbox.isSessionCurrent(live.repo.originatingSession())) {
    throw new Error(GRIN_BINDING_RETIRED);
  }
  return live.repo;
}

/**
 * Production action entry. Bind callbacks to the originating session, never
 * `requireLiveGrinApplicationRepository`.
 */
export function requireOriginGrinApplicationRepository(
  origin: GrinDispatchSession
): GrinApplicationRepository {
  return getGrinApplicationRepository(origin.ownerUid, origin.dispatchGeneration);
}

export function requireLiveGrinApplicationRepository(): GrinApplicationRepository {
  const session = getLiveGrinDispatchSession();
  if (!session) throw new Error(GRIN_SESSION_NOT_STARTED);
  return getGrinApplicationRepository(session.ownerUid, session.dispatchGeneration);
}

export function resetGrinApplicationRepositoryForTests(): void {
  liveToken = null;
  live = null;
  pendingSqliteRetire = null;
  dbFactory = defaultDbFactory;
  serverPortFactory = defaultGrinServerPortFactory;
  evidencePortFactory = defaultGrinEvidencePortFactory;
  hasherFactory = defaultGrinLocalOriginalHasherFactory;
}
