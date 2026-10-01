/**
 * App binding for GrinApplicationRepository.
 * Uses the device/local sqlite already opened by localDb. Does not import
 * HostSqlite (Node SQLITE_HOST) or firebase-admin.
 */

import { getLocalDatabase } from "@/localDb/database";
import { GrinOutbox } from "@/services/grin/outbox/outbox";

import { GrinApplicationRepository } from "./GrinApplicationRepository";
import { GRIN_APPLICATION_LEDGER_ID } from "./labels";
import type { GrinApplicationDb } from "./types";
import { createUninjectedGrinServerPort } from "./uninjectedServer";

type Binding = {
  ownerUid: string;
  repo: GrinApplicationRepository;
};

let binding: Binding | null = null;

function asApplicationDb(): GrinApplicationDb {
  return getLocalDatabase() as unknown as GrinApplicationDb;
}

export function getGrinApplicationRepository(ownerUid: string): GrinApplicationRepository {
  const uid = ownerUid.trim();
  if (!uid) throw new Error("missing_owner_uid");
  if (binding?.ownerUid === uid) return binding.repo;

  const db = asApplicationDb();
  const outbox = new GrinOutbox({
    db,
    server: createUninjectedGrinServerPort(),
  });
  const session = outbox.beginOwnerSession(uid);
  const repo = new GrinApplicationRepository({
    outbox,
    db,
    ownerUid: uid,
    ledgerId: GRIN_APPLICATION_LEDGER_ID,
    session,
  });
  binding = { ownerUid: uid, repo };
  return repo;
}

export function resetGrinApplicationRepositoryForTests(): void {
  binding = null;
}
