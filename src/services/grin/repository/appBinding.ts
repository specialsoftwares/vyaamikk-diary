/**
 * App binding and explicit GRIN session lifecycle.
 *
 * ONLY `startGrinOwnerSession` may call beginOwnerSession.
 * `getGrinApplicationRepository`, the repository, and stale callbacks must
 * never revive a retired session.
 *
 * Uses the device/local sqlite already opened by localDb. Does not import
 * HostSqlite (Node SQLITE_HOST), firebase-admin, emulator tools, or node:fs.
 *
 * Production server port is Team 1 `createFirebaseJsGrinTransport` (INJECTED /
 * FIREBASE_JS_HTTPS_CALLABLE, compositionLabel "not live deploy"). Callables remain
 * unexported, so live dispatch fails honestly until the coordinator export HOLD lifts.
 * This is not the uninjected FAKE always-deny port.
 *
 * SQLITE_HOST / mounted-inert tests MUST inject createUninjectedGrinServerPort or
 * createFakeGrinServerPort via setGrinServerPortFactoryForTests. Do not call live Firebase.
 */

import { getLocalDatabase } from "@/localDb/database";
import { GrinOutbox } from "@/services/grin/outbox/outbox";
import type { GrinServerCommandPort } from "@/services/grin/outbox/ports";
import type { GrinDispatchSession } from "@/services/grin/outbox/types";
import { createFirebaseJsGrinTransport } from "@/services/grin/transport";

import { GrinApplicationRepository } from "./GrinApplicationRepository";
import { GRIN_APPLICATION_LEDGER_ID } from "./labels";
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

let live: LiveBinding | null = null;
let dbFactory: () => GrinApplicationDb = defaultDbFactory;
let serverPortFactory: () => GrinServerCommandPort = defaultGrinServerPortFactory;

function defaultDbFactory(): GrinApplicationDb {
  return getLocalDatabase() as unknown as GrinApplicationDb;
}

function defaultGrinServerPortFactory(): GrinServerCommandPort {
  return createFirebaseJsGrinTransport();
}

function isLiveSession(session: GrinDispatchSession): boolean {
  return (
    live != null &&
    live.ownerUid === session.ownerUid &&
    live.dispatchGeneration === session.dispatchGeneration
  );
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
 * Explicit session lifecycle owner. The only production caller of
 * `outbox.beginOwnerSession`. Account change and logout retire the previous
 * binding first.
 */
export function startGrinOwnerSession(ownerUid: string): GrinDispatchSession {
  const uid = ownerUid.trim();
  if (!uid) throw new Error("missing_owner_uid");

  if (live && live.ownerUid === uid && live.outbox.isSessionCurrent(live.repo.originatingSession())) {
    return live.repo.originatingSession();
  }

  if (live) {
    retireGrinOwnerSession();
  }

  const db = dbFactory();
  const outbox = new GrinOutbox({
    db,
    server: serverPortFactory(),
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
  live = {
    ownerUid: uid,
    dispatchGeneration: session.dispatchGeneration,
    outbox,
    repo,
  };
  return { ownerUid: session.ownerUid, dispatchGeneration: session.dispatchGeneration };
}

export function retireGrinOwnerSession(): void {
  const current = live;
  live = null;
  if (!current) return;
  try {
    current.outbox.endOwnerSession(current.ownerUid);
  } catch {
    // Retirement must still drop the binding if sqlite end fails.
  }
}

export function getLiveGrinDispatchSession(): GrinDispatchSession | null {
  if (!live) return null;
  const session = live.repo.originatingSession();
  if (!live.outbox.isSessionCurrent(session)) return null;
  return session;
}

/**
 * Access the live repository for the originating UID and dispatchGeneration.
 * Does not start or revive a session.
 */
export function getGrinApplicationRepository(
  ownerUid: string,
  dispatchGeneration: number
): GrinApplicationRepository {
  const uid = ownerUid.trim();
  if (!uid) throw new Error("missing_owner_uid");
  if (!live) throw new Error(GRIN_SESSION_NOT_STARTED);
  if (live.ownerUid !== uid || live.dispatchGeneration !== dispatchGeneration) {
    throw new Error(GRIN_BINDING_RETIRED);
  }
  return live.repo;
}

export function requireLiveGrinApplicationRepository(): GrinApplicationRepository {
  const session = getLiveGrinDispatchSession();
  if (!session) throw new Error(GRIN_SESSION_NOT_STARTED);
  return getGrinApplicationRepository(session.ownerUid, session.dispatchGeneration);
}

export function resetGrinApplicationRepositoryForTests(): void {
  live = null;
  dbFactory = defaultDbFactory;
  serverPortFactory = defaultGrinServerPortFactory;
}
