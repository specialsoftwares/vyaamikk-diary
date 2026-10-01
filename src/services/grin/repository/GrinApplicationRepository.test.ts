/**
 * SQLITE_HOST tests for GrinApplicationRepository.
 * Host process restart is not NATIVE_DEVICE process-death proof.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { GrinConfirmedProjection } from "@/goodsEvidence/ports";
import { cloneSnapshot } from "@/goodsEvidence/snapshot";
import { sampleRegisterBody } from "@/goodsEvidence/testFixtures";
import type { GrinEvent } from "@/goodsEvidence/types";
import { createFakeGrinServerPort } from "@/services/grin/outbox/fakePorts";
import { openHostSqlite, SQLITE_HOST, type HostSqlite } from "@/services/grin/outbox/hostSqlite";
import { GrinOutbox } from "@/services/grin/outbox/outbox";
import { SQLITE_HOST_NOT_NATIVE_DEVICE } from "@/services/grin/outbox/types";
import type { GrinDispatchSession } from "@/services/grin/outbox/types";

import {
  GrinApplicationRepository,
  GRIN_APPLICATION_LEDGER_ID,
  GRIN_APPLICATION_REPOSITORY_LABEL,
  grinRepositoryIsFake,
} from "./GrinApplicationRepository";
import { GRIN_APPLICATION_REPOSITORY_KIND } from "./labels";
import { GRIN_BINDING_RETIRED, GRIN_NO_CONFIRMED_VERSION, GRIN_SESSION_RETIRED } from "./sessionErrors";
import {
  GRIN_APPLICATION_SERVER_PORT_LABEL,
  advanceGrinLiveToken,
  getGrinApplicationRepository,
  resetGrinApplicationRepositoryForTests,
  retireGrinOwnerSession,
  setGrinApplicationDbFactoryForTests,
  setGrinServerPortFactoryForTests,
  startGrinOwnerSession,
} from "./appBinding";
import { createUninjectedGrinServerPort } from "./uninjectedServer";
import type { GrinMutationQueueInput, GrinOutboxApplicationSurface } from "./outboxContract";
import type { GrinApplicationRecord } from "./types";

function body(receiptId: string, supplier: string) {
  return sampleRegisterBody({
    receiptId,
    supplier: {
      name: { kind: "present", value: supplier },
      registration: { kind: "registered", gstin: "29BBBBB0000B1Z5" },
      address: { kind: "not_supplied" },
      contact: { kind: "not_supplied" },
    },
  });
}

function confirmedFromRecord(record: GrinApplicationRecord, eventVersion: number): GrinConfirmedProjection {
  const event: GrinEvent = {
    schemaVersion: 1,
    eventId: `evt_${record.receiptId}_${eventVersion}`,
    receiptId: record.receiptId,
    streamSequence: eventVersion,
    type: "receipt_registered",
    actorUid: record.ownerUid,
    serverAcceptedAtUtc: "2026-09-28T05:00:00.000Z",
    clientObservedAtUtc: "2026-09-28T04:00:00.000Z",
    reason: "server confirmed",
    expectedPreviousVersion: eventVersion - 1,
    typedChanges: {},
    previousHash: null,
    eventHash: "ab".repeat(32),
    firestoreCommitTime: "2026-09-28T05:00:00.000Z",
  };
  return {
    receiptId: record.receiptId,
    eventVersion,
    headHash: event.eventHash,
    original: cloneSnapshot(record.original),
    events: [event],
    effective: cloneSnapshot(record.effective),
  };
}

function installConfirmedProjections(outbox: GrinOutbox, rows: GrinConfirmedProjection[]): void {
  const byId = new Map(rows.map((row) => [row.receiptId, row]));
  (outbox as GrinOutboxApplicationSurface).getConfirmedProjection = (_ownerUid, _ledgerId, receiptId) =>
    byId.get(receiptId) ?? null;
}

function markLocalOriginalVerified(
  db: HostSqlite,
  ownerUid: string,
  evidenceId: string,
  sha256: string,
  byteSize: number
): void {
  db.runSync(
    `UPDATE grin_local_evidence_files
        SET upload_state = ?, original_durable = 1, claimed_sha256 = ?, byte_size = ?
      WHERE owner_uid = ? AND evidence_id = ? AND role = ?`,
    ["verified", sha256, byteSize, ownerUid, evidenceId, "original"]
  );
}

function repoFor(
  db: HostSqlite,
  ownerUid: string,
  ledgerId = GRIN_APPLICATION_LEDGER_ID,
  server = createFakeGrinServerPort()
): { repo: GrinApplicationRepository; outbox: GrinOutbox; session: GrinDispatchSession } {
  const outbox = new GrinOutbox({ db, server });
  outbox.ensureSchema();
  const session = outbox.beginOwnerSession(ownerUid);
  const repo = new GrinApplicationRepository({
    outbox,
    db,
    ownerUid,
    ledgerId,
    session,
  });
  return { repo, outbox, session };
}

function assertNoInventedGrinNumber(value: unknown): void {
  const text = JSON.stringify(value);
  assert.doesNotMatch(text, /GRIN\/[A-Z0-9]+\/FY\d{4}-\d{2}\/\d{6}/);
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function main() {
  assert.match(GRIN_APPLICATION_REPOSITORY_LABEL, /APPLICATION \/ WAVE-2: GrinApplicationRepository/);
  assert.equal(grinRepositoryIsFake(GRIN_APPLICATION_REPOSITORY_LABEL), false);
  assert.equal(GrinApplicationRepository.isFake, false);
  assert.equal(GrinApplicationRepository.kind, GRIN_APPLICATION_REPOSITORY_KIND);
  assert.doesNotMatch(GRIN_APPLICATION_REPOSITORY_LABEL, /^FAKE \//);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-t4-repo-"));
  const dbPath = path.join(tmp, "grin-app.sqlite");
  let db: HostSqlite | null = null;

  try {
    db = openHostSqlite(dbPath);
    assert.equal(db.executionLabel, SQLITE_HOST);
    console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
    console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);

    const ownerA = "owner_a_wave2";
    const { repo, outbox, session: sessionA } = repoFor(db, ownerA);

    const created = repo.createQueued(body("grcp_app_1", "Wave Two Supplier"));
    assert.equal(created.repositoryKind, GRIN_APPLICATION_REPOSITORY_KIND);
    assert.equal(created.receiptId, "grcp_app_1");
    assert.equal(created.localState, "queued");
    assert.equal(created.issuedNumber, null);
    assert.equal(created.serverRegisteredAtUtc, null);
    assert.equal(created.projection, "readable");
    assertNoInventedGrinNumber(created);

    const listed = repo.list();
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.receiptId, "grcp_app_1");
    assert.equal(listed[0]?.displayNumber, null);
    assert.equal(listed[0]?.supplierName, "Wave Two Supplier");
    assert.equal(listed[0]?.offlinePending, true);
    assert.equal(listed[0]?.projection, "readable");
    assert.equal(listed[0]?.custody, "received");
    assertNoInventedGrinNumber(listed);

    const loaded = repo.get("grcp_app_1");
    assert.ok(loaded);
    assert.equal(loaded.issuedNumber, null);
    assert.equal(loaded.effective.custody, "received");

    const { repo: other } = repoFor(db, "owner_b_wave2");
    assert.equal(other.list().length, 0);
    assert.equal(other.get("grcp_app_1"), null);
    assert.equal(repo.list().length, 1);

    const ledgerTwo = new GrinApplicationRepository({
      outbox,
      db,
      ownerUid: ownerA,
      ledgerId: "secondary",
      session: sessionA,
    });
    const overlap = ledgerTwo.createQueued(body("grcp_app_1", "Other Ledger Supplier"));
    assert.equal(overlap.ledgerId, "secondary");
    assert.equal(ledgerTwo.get("grcp_app_1")?.effective.supplier.name.kind, "present");
    if (ledgerTwo.get("grcp_app_1")?.effective.supplier.name.kind === "present") {
      assert.equal(ledgerTwo.get("grcp_app_1")?.effective.supplier.name.value, "Other Ledger Supplier");
    }
    const primaryAgain = repo.get("grcp_app_1");
    assert.ok(primaryAgain);
    if (primaryAgain.body.supplier.name.kind === "present") {
      assert.equal(primaryAgain.body.supplier.name.value, "Wave Two Supplier");
    }
    assert.equal(repo.list().every((item) => item.receiptId !== "missing"), true);
    assert.equal(repo.list().filter((item) => item.receiptId === "grcp_app_1").length, 1);

    const corrupt = JSON.stringify({ receiptId: "grcp_app_1", note: "corrupt-projection" });
    db.runSync(
      `UPDATE grin_local_receipts SET payload_json = ? WHERE owner_uid = ? AND ledger_id = ? AND receipt_id = ?`,
      [corrupt, ownerA, GRIN_APPLICATION_LEDGER_ID, "grcp_app_1"]
    );
    db.runSync(
      `UPDATE grin_outbox_commands SET frozen_payload_json = ? WHERE owner_uid = ? AND ledger_id = ? AND receipt_id = ?`,
      [corrupt, ownerA, GRIN_APPLICATION_LEDGER_ID, "grcp_app_1"]
    );
    const incomplete = repo.list().find((item) => item.receiptId === "grcp_app_1");
    assert.ok(incomplete);
    assert.equal(incomplete.projection, "unknown_incomplete");
    assert.equal(incomplete.custody, null);
    assert.notEqual(incomplete.custody, "received");
    assert.equal(incomplete.supplierName, null);
    assert.equal(incomplete.gateRefusal, "unknown_incomplete");
    const incompleteLookup = repo.lookup("grcp_app_1");
    assert.equal(incompleteLookup?.projection, "unknown_incomplete");
    assert.equal(repo.get("grcp_app_1"), null);

    const beforeStale = outbox.listForOwner(ownerA).length;
    const capturedCreate = () => repo.createQueued(body("grcp_stale_1", "Stale Supplier"));
    outbox.endOwnerSession(ownerA);
    assert.throws(() => capturedCreate(), (err: unknown) => err instanceof Error && err.message === GRIN_SESSION_RETIRED);
    assert.equal(outbox.getRecord(ownerA, GRIN_APPLICATION_LEDGER_ID, "grcp_stale_1"), null);
    assert.equal(outbox.listForOwner(ownerA).length, beforeStale);
    assert.throws(() => repo.list(), (err: unknown) => err instanceof Error && err.message === GRIN_SESSION_RETIRED);
    assert.throws(() => repo.lookup("grcp_app_1"), (err: unknown) => err instanceof Error && err.message === GRIN_SESSION_RETIRED);

    const sessionA2 = outbox.beginOwnerSession(ownerA);
    assert.notEqual(sessionA2.dispatchGeneration, sessionA.dispatchGeneration);
    const repoA2 = new GrinApplicationRepository({
      outbox,
      db,
      ownerUid: ownerA,
      ledgerId: GRIN_APPLICATION_LEDGER_ID,
      session: sessionA2,
    });
    const revived = repoA2.createQueued(body("grcp_app_2", "Current A"));
    assert.equal(revived.localState, "queued");
    assert.throws(() => capturedCreate(), (err: unknown) => err instanceof Error && err.message === GRIN_SESSION_RETIRED);
    assert.equal(outbox.getRecord(ownerA, GRIN_APPLICATION_LEDGER_ID, "grcp_stale_1"), null);

    const originalBegin = outbox.beginOwnerSession.bind(outbox);
    let beginCalls = 0;
    outbox.beginOwnerSession = ((ownerUid: string) => {
      beginCalls += 1;
      return originalBegin(ownerUid);
    }) as GrinOutbox["beginOwnerSession"];
    assert.throws(() => capturedCreate());
    assert.equal(beginCalls, 0);
    outbox.beginOwnerSession = originalBegin;

    const mutationCalls: GrinMutationQueueInput[] = [];
    const withMutate = outbox as GrinOutbox & {
      persistMutationAndQueue: (
        session: GrinDispatchSession,
        input: GrinMutationQueueInput
      ) => ReturnType<GrinOutbox["persistDraftAndQueue"]>;
    };
    withMutate.persistMutationAndQueue = (session, input) => {
      mutationCalls.push(input);
      assert.equal(session.dispatchGeneration, sessionA2.dispatchGeneration);
      return outbox.getRecord(ownerA, GRIN_APPLICATION_LEDGER_ID, input.receiptId)!;
    };
    assert.throws(
      () =>
        repoA2.amend({
          receiptId: "grcp_app_2",
          reason: "warehouse correction",
          changes: { warehouse: { kind: "present", value: "Bay Z" } },
        }),
      (err: unknown) => err instanceof Error && err.message === GRIN_NO_CONFIRMED_VERSION
    );
    assert.equal(mutationCalls.length, 0, "missing getConfirmedProjection must not queue");
    assert.throws(
      () => repoA2.recordQc({ receiptId: "grcp_app_2", reason: "hold", qcStatus: "hold" }),
      (err: unknown) => err instanceof Error && err.message === GRIN_NO_CONFIRMED_VERSION
    );
    assert.equal(mutationCalls.length, 0);

    const confirmedApp2 = confirmedFromRecord(revived, 7);
    installConfirmedProjections(outbox, [confirmedApp2]);
    const amended = repoA2.amend({
      receiptId: "grcp_app_2",
      reason: "warehouse correction",
      changes: { warehouse: { kind: "present", value: "Bay Z" } },
    });
    assert.equal(amended.receiptId, "grcp_app_2");
    assert.equal(mutationCalls.length, 1);
    assert.equal(mutationCalls[0]?.commandType, "amendFields");
    assert.equal(
      (mutationCalls[0]?.body as { expectedVersion?: number }).expectedVersion,
      7,
      "expectedVersion must be confirmed.eventVersion, not 0 or a queue count"
    );
    delete (withMutate as { persistMutationAndQueue?: unknown }).persistMutationAndQueue;
    const qc = repoA2.recordQc({
      receiptId: "grcp_app_2",
      reason: "hold",
      qcStatus: "hold",
    });
    assert.equal(qc.receiptId, "grcp_app_2");
    const historyApp2 = repoA2.history("grcp_app_2");
    assert.ok(historyApp2.some((item) => item.source === "confirmed_event" && item.commandType === "receipt_registered"));
    assert.ok(historyApp2.some((item) => item.commandType === "recordQc" && item.source === "outbox_pending"));
    assert.equal(
      historyApp2.some((item) => item.commandType === "recordQc" && item.source === "confirmed_event"),
      false,
      "queued QC is not confirmed history"
    );

    const pack = repoA2.exportPack("grcp_app_2");
    assert.ok(pack);
    assert.equal(pack.completenessLabel, "incomplete");
    assert.equal(pack.itcDisposition, "not_determined");
    assert.equal(pack.missingOriginal, true, "verifiedOriginals empty ⇒ missingOriginal");
    // Path A: no confirmed cut and no verified original → missingOriginal.
    const pathARecord = repoA2.createQueued(body("grcp_pack_a", "Pack A"));
    const packA = repoA2.exportPack(pathARecord.receiptId);
    assert.ok(packA);
    assert.equal(packA.completenessLabel, "incomplete");
    assert.equal(packA.itcDisposition, "not_determined");
    assert.equal(packA.missingOriginal, true);
    assert.equal(packA.invoiceReferenceIsNotRetainedInvoice, true);

    const pathBRecord = repoA2.createQueued(body("grcp_pack_b", "Pack B"));
    installConfirmedProjections(outbox, [confirmedApp2, confirmedFromRecord(pathBRecord, 1)]);
    repoA2.attachOriginal({
      receiptId: "grcp_pack_b",
      category: "invoice",
      localPath: "/tmp/grin-pack-b-invoice.pdf",
      evidenceId: "ev_pack_b_invoice",
      claimedSha256: "cd".repeat(32),
      byteSize: 2048,
    });
    repoA2.attachOriginal({
      receiptId: "grcp_pack_b",
      category: "lr_bilty",
      localPath: "/tmp/grin-pack-b-lr.jpg",
      evidenceId: "ev_pack_b_lr",
      claimedSha256: "ef".repeat(32),
      byteSize: 1024,
    });
    markLocalOriginalVerified(db!, ownerA, "ev_pack_b_invoice", "cd".repeat(32), 2048);
    markLocalOriginalVerified(db!, ownerA, "ev_pack_b_lr", "ef".repeat(32), 1024);
    const packB = repoA2.exportPack("grcp_pack_b");
    assert.ok(packB);
    assert.equal(packB.itcDisposition, "not_determined");
    assert.equal(packB.missingOriginal, false);
    assert.equal(packB.invoiceReferenceIsNotRetainedInvoice, false);
    assert.notEqual(packB.completenessLabel, "forced");
    assert.ok(packB.completenessLabel === "complete" || packB.completenessLabel === "incomplete");

    const exceptions = repoA2.exceptions("grcp_app_2");
    assert.ok(exceptions);
    assert.equal(exceptions.itcAlwaysNotDetermined, true);
    assert.ok(exceptions.evaluations.every((item) => item.itcDisposition === "not_determined"));
    assert.ok(exceptions.evaluations.some((item) => item.kind === "unknown_incomplete_source"));

    resetGrinApplicationRepositoryForTests();
    setGrinApplicationDbFactoryForTests(() => db as HostSqlite);
    let injectedPortCalls = 0;
    setGrinServerPortFactoryForTests(() => {
      injectedPortCalls += 1;
      return createUninjectedGrinServerPort();
    });
    const liveA = startGrinOwnerSession(ownerA);
    assert.equal(injectedPortCalls, 1, "binding must use the injected FAKE server port");
    const bound = getGrinApplicationRepository(ownerA, liveA.dispatchGeneration);
    const queuedBOwnerPrep = bound.createQueued(body("grcp_bind_a", "Bound A"));
    assert.equal(queuedBOwnerPrep.issuedNumber, null);
    const staleBoundCreate = () => bound.createQueued(body("grcp_from_retired_a", "Should not queue"));
    const liveB = startGrinOwnerSession("owner_b_wave2");
    assert.equal(injectedPortCalls, 2, "owner switch must construct a new injected FAKE port");
    assert.notEqual(liveB.ownerUid, ownerA);
    assert.throws(staleBoundCreate);
    assert.equal(outbox.getRecord(ownerA, GRIN_APPLICATION_LEDGER_ID, "grcp_from_retired_a"), null);
    const currentB = getGrinApplicationRepository("owner_b_wave2", liveB.dispatchGeneration);
    const bCreated = currentB.createQueued(body("grcp_bind_b", "Bound B"));
    assert.equal(bCreated.ownerUid, "owner_b_wave2");
    assert.throws(() => getGrinApplicationRepository(ownerA, liveA.dispatchGeneration));

    retireGrinOwnerSession();
    const liveA2 = startGrinOwnerSession(ownerA);
    assert.equal(injectedPortCalls, 3);
    assert.notEqual(liveA2.dispatchGeneration, liveA.dispatchGeneration);
    assert.throws(() => getGrinApplicationRepository(ownerA, liveA.dispatchGeneration));
    getGrinApplicationRepository(ownerA, liveA2.dispatchGeneration).list();
    retireGrinOwnerSession();
    setGrinServerPortFactoryForTests(() => createFakeGrinServerPort());
    const liveFake = startGrinOwnerSession(ownerA);
    assert.equal(
      getGrinApplicationRepository(ownerA, liveFake.dispatchGeneration).originatingSession().ownerUid,
      ownerA
    );
    retireGrinOwnerSession();
    const tokenA = startGrinOwnerSession(ownerA);
    const tokenBound = getGrinApplicationRepository(ownerA, tokenA.dispatchGeneration);
    tokenBound.list();
    advanceGrinLiveToken("owner_b");
    assert.throws(
      () => tokenBound.list(),
      (err: unknown) =>
        err instanceof Error && (err.message === GRIN_SESSION_RETIRED || err.message === GRIN_BINDING_RETIRED),
      "live token flip must retire A before sqlite persist"
    );
    assert.throws(
      () => getGrinApplicationRepository(ownerA, tokenA.dispatchGeneration),
      (err: unknown) => err instanceof Error && err.message === GRIN_BINDING_RETIRED
    );
    retireGrinOwnerSession();
    resetGrinApplicationRepositoryForTests();

    db.close();
    db = openHostSqlite(dbPath);
    assert.equal(db.executionLabel, SQLITE_HOST);
    const reopened = repoFor(db, ownerA);
    const afterReopen = reopened.repo.get("grcp_app_2");
    assert.ok(afterReopen);
    assert.equal(afterReopen.issuedNumber, null);
    assert.equal(afterReopen.localState, "queued");
    assertNoInventedGrinNumber(afterReopen);
    assert.equal(SQLITE_HOST, "SQLITE_HOST");
    assert.notEqual(SQLITE_HOST, "NATIVE_DEVICE");
  } finally {
    try {
      db?.close();
    } catch {
      // ignore
    }
    resetGrinApplicationRepositoryForTests();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const screens = join(here, "../../../screens/grin");
  const screenNames = readdirSync(screens).filter((name) => name.endsWith(".tsx"));
  for (const name of screenNames) {
    const src = stripComments(readFileSync(join(screens, name), "utf8"));
    assert.doesNotMatch(src, /firebase-admin/, `${name} must not import firebase-admin`);
    assert.doesNotMatch(src, /HostSqlite/, `${name} must not import HostSqlite`);
    assert.doesNotMatch(src, /GrinFixtureRepository/, `${name} must not use GrinFixtureRepository`);
    assert.doesNotMatch(src, /getGrinFixtureRepository/, `${name} must not call getGrinFixtureRepository`);
    assert.doesNotMatch(src, /tools\/goods-evidence/, `${name} must not import goods-evidence tools`);
  }

  const productionScreens = [
    "GrinListScreen.tsx",
    "GrinCreateScreen.tsx",
    "GrinDetailScreen.tsx",
    "GrinAmendScreen.tsx",
    "GrinQcScreen.tsx",
    "GrinEwbScreen.tsx",
    "GrinReturnScreen.tsx",
    "GrinAttachmentsScreen.tsx",
    "GrinHistoryScreen.tsx",
    "GrinPackScreen.tsx",
    "GrinExceptionsScreen.tsx",
  ];
  for (const name of productionScreens) {
    const src = stripComments(readFileSync(join(screens, name), "utf8"));
    assert.match(src, /GrinAdmissionGate/, `${name} must keep admission wrapping`);
    assert.match(src, /AdmittedBody/, `${name} must mount repository work only in an admitted inner body`);
    const bodyName = name.replace("Screen.tsx", "AdmittedBody.tsx");
    const bodySrc = existsSync(join(screens, bodyName))
      ? stripComments(readFileSync(join(screens, bodyName), "utf8"))
      : "";
    assert.match(
      `${src}\n${bodySrc}`,
      /originRepo/,
      `${name} must bind actions to the originating session`
    );
    assert.doesNotMatch(
      src,
      /requireLiveGrinApplicationRepository/,
      `${name} must not recapture the live repository`
    );
    assert.doesNotMatch(
      src,
      /getGrinApplicationRepository\(/,
      `${name} must not call getGrinApplicationRepository from the outer screen`
    );
  }

  for (const name of screenNames) {
    const src = stripComments(readFileSync(join(screens, name), "utf8"));
    assert.doesNotMatch(
      src,
      /requireLiveGrinApplicationRepository/,
      `${name} must not recapture requireLiveGrinApplicationRepository`
    );
  }

  const gateSrc = stripComments(readFileSync(join(screens, "GrinAdmissionGate.tsx"), "utf8"));
  assert.doesNotMatch(gateSrc, /\{\(\) => children\}/, "AdmissionGate must pass the admitted session, not {() => children}");
  const hostSrc = stripComments(readFileSync(join(screens, "GrinAdmittedSessionHost.tsx"), "utf8"));
  assert.doesNotMatch(hostSrc, /beginOwnerSession/, "host render must not call sqlite beginOwnerSession");
  assert.match(hostSrc, /advanceGrinLiveToken/, "host must flip the in-memory live token during render");
  assert.match(hostSrc, /persistGrinOwnerSession/, "host must persist sqlite only after the token flip");
  assert.match(hostSrc, /useLayoutEffect/, "sqlite persist must stay out of render");

  assert.equal(existsSync(join(here, "packExport.ts")), false, "do not keep a parallel pack assembler");
  const repoImplSrc = stripComments(readFileSync(join(here, "GrinApplicationRepository.ts"), "utf8"));
  assert.match(repoImplSrc, /assembleEvidencePackInputs/, "exportPack must use Team 2 pack inputs");
  assert.match(repoImplSrc, /GRIN_NO_CONFIRMED_VERSION/, "mutations must fail closed without confirmed version");
  assert.doesNotMatch(repoImplSrc, /clientExpectedVersion\(0\)/, "expectedVersion must not be hardcoded 0");

  const repoSrc = stripComments(readFileSync(join(here, "GrinApplicationRepository.ts"), "utf8"));
  assert.doesNotMatch(repoSrc, /beginOwnerSession/, "repository must never call beginOwnerSession");
  const bindingSrc = stripComments(readFileSync(join(here, "appBinding.ts"), "utf8"));
  assert.match(bindingSrc, /beginOwnerSession/, "lifecycle owner may start a session");
  assert.match(bindingSrc, /function startGrinOwnerSession/, "session start must be explicit");
  assert.match(
    bindingSrc,
    /createFirebaseJsGrinTransport/,
    "production default must bind Team 1 JS httpsCallable transport"
  );
  assert.match(bindingSrc, /function defaultGrinServerPortFactory/, "default factory must be explicit");
  assert.doesNotMatch(
    bindingSrc,
    /createUninjectedGrinServerPort\s*\(/,
    "production default must not construct the uninjected FAKE port"
  );
  assert.doesNotMatch(bindingSrc, /from ["'][^"']*uninjectedServer["']/, "appBinding must not import the FAKE uninjected port");
  assert.match(GRIN_APPLICATION_SERVER_PORT_LABEL, /INJECTED \/ FIREBASE_JS_HTTPS_CALLABLE/);
  assert.match(GRIN_APPLICATION_SERVER_PORT_LABEL, /Not live deploy/);
  const getFn = bindingSrc.slice(bindingSrc.indexOf("export function getGrinApplicationRepository"));
  assert.doesNotMatch(
    getFn.slice(0, 800),
    /beginOwnerSession/,
    "getGrinApplicationRepository must not start a session"
  );

  const transportSrc = stripComments(readFileSync(join(here, "../transport/firebaseTransport.ts"), "utf8"));
  assert.match(transportSrc, /httpsCallable/);
  assert.match(transportSrc, /createFirebaseJsGrinTransport/);
  assert.match(transportSrc, /portKind: "INJECTED"/);

  const repoFiles = readdirSync(here).filter((name) => name.endsWith(".ts") && !name.includes(".test."));
  for (const name of repoFiles) {
    const src = stripComments(readFileSync(join(here, name), "utf8"));
    assert.doesNotMatch(src, /firebase-admin/, `${name} must not import firebase-admin`);
    assert.doesNotMatch(src, /formatGrinNumber/, `${name} must not invent GRIN numbers`);
    if (name !== "appBinding.ts") {
      assert.doesNotMatch(src, /from ["']expo-sqlite["']/, `${name} must not import expo-sqlite`);
    }
    assert.doesNotMatch(src, /from ["'][^"']*hostSqlite["']/, `${name} must not import HostSqlite`);
    assert.doesNotMatch(src, /tools\/goods-evidence/, `${name} must not import goods-evidence tools`);
    if (name === "appBinding.ts") {
      assert.doesNotMatch(src, /node:fs/, "appBinding must not import node:fs");
      assert.doesNotMatch(src, /from ["']fs["']/, "appBinding must not import fs");
      assert.doesNotMatch(src, /better-sqlite3/, "appBinding must not import better-sqlite3");
    }
  }

  console.log("GrinApplicationRepository.test.ts: ok");
}

main();
