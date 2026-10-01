/**
 * SQLITE_HOST tests for GrinApplicationRepository.
 * Host process restart is not NATIVE_DEVICE process-death proof.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { sampleRegisterBody } from "@/goodsEvidence/testFixtures";
import { createFakeGrinServerPort } from "@/services/grin/outbox/fakePorts";
import { openHostSqlite, SQLITE_HOST, type HostSqlite } from "@/services/grin/outbox/hostSqlite";
import { GrinOutbox } from "@/services/grin/outbox/outbox";
import { SQLITE_HOST_NOT_NATIVE_DEVICE } from "@/services/grin/outbox/types";

import {
  GrinApplicationRepository,
  GRIN_APPLICATION_LEDGER_ID,
  GRIN_APPLICATION_REPOSITORY_LABEL,
  grinRepositoryIsFake,
} from "./GrinApplicationRepository";
import { GRIN_APPLICATION_REPOSITORY_KIND } from "./labels";

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

function repoFor(
  db: HostSqlite,
  ownerUid: string,
  server = createFakeGrinServerPort()
): { repo: GrinApplicationRepository; outbox: GrinOutbox; server: ReturnType<typeof createFakeGrinServerPort> } {
  const outbox = new GrinOutbox({ db, server });
  outbox.ensureSchema();
  const session = outbox.beginOwnerSession(ownerUid);
  const repo = new GrinApplicationRepository({
    outbox,
    db,
    ownerUid,
    ledgerId: GRIN_APPLICATION_LEDGER_ID,
    session,
  });
  return { repo, outbox, server };
}

function assertNoInventedGrinNumber(value: unknown): void {
  const text = JSON.stringify(value);
  assert.doesNotMatch(text, /GRIN\/[A-Z0-9]+\/FY\d{4}-\d{2}\/\d{6}/);
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
    const { repo, server } = repoFor(db, ownerA);

    const created = repo.createQueued(body("grcp_app_1", "Wave Two Supplier"));
    assert.equal(created.repositoryKind, GRIN_APPLICATION_REPOSITORY_KIND);
    assert.equal(created.receiptId, "grcp_app_1");
    assert.equal(created.localState, "queued");
    assert.equal(created.issuedNumber, null);
    assert.equal(created.serverRegisteredAtUtc, null);
    assert.equal(created.original.issuedNumber, null);
    assert.equal(created.effective.issuedNumber, null);
    assert.equal(created.original.serial, null);
    assert.equal(created.effective.fyToken, null);
    assert.equal(server.serialsIssued, 0);
    assertNoInventedGrinNumber(created);

    const listed = repo.list();
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.receiptId, "grcp_app_1");
    assert.equal(listed[0]?.displayNumber, null);
    assert.equal(listed[0]?.supplierName, "Wave Two Supplier");
    assert.equal(listed[0]?.offlinePending, true);
    assert.equal(listed[0]?.localState, "queued");
    assertNoInventedGrinNumber(listed);

    const loaded = repo.get("grcp_app_1");
    assert.ok(loaded);
    assert.equal(loaded.issuedNumber, null);
    assert.equal(loaded.body.supplier.name.kind, "present");
    if (loaded.body.supplier.name.kind === "present") {
      assert.equal(loaded.body.supplier.name.value, "Wave Two Supplier");
    }
    assert.equal(loaded.effective.custody, "received");

    const { repo: other } = repoFor(db, "owner_b_wave2", server);
    assert.equal(other.list().length, 0);
    assert.equal(other.get("grcp_app_1"), null);
    assert.equal(repo.list().length, 1);

    db.close();
    db = openHostSqlite(dbPath);
    assert.equal(db.executionLabel, SQLITE_HOST);
    const reopened = repoFor(db, ownerA, server);
    const afterReopen = reopened.repo.get("grcp_app_1");
    assert.ok(afterReopen);
    assert.equal(afterReopen.issuedNumber, null);
    assert.equal(afterReopen.localState, "queued");
    assert.equal(reopened.server.serialsIssued, 0);
    assertNoInventedGrinNumber(afterReopen);
    assert.equal(SQLITE_HOST, "SQLITE_HOST");
    assert.notEqual(SQLITE_HOST, "NATIVE_DEVICE");
  } finally {
    try {
      db?.close();
    } catch {
      // ignore
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const screens = join(here, "../../../screens/grin");
  const listCreateDetail = ["GrinListScreen.tsx", "GrinCreateScreen.tsx", "GrinDetailScreen.tsx"];
  for (const name of listCreateDetail) {
    const src = stripComments(readFileSync(join(screens, name), "utf8"));
    assert.doesNotMatch(src, /firebase-admin/, `${name} must not import firebase-admin`);
    assert.doesNotMatch(src, /HostSqlite/, `${name} must not import HostSqlite`);
    assert.doesNotMatch(src, /GrinFixtureRepository/, `${name} must not use GrinFixtureRepository`);
    assert.match(src, /getGrinApplicationRepository/, `${name} must use the application repository`);
  }

  const repoFiles = readdirSync(here).filter((name) => name.endsWith(".ts") && !name.includes(".test."));
  for (const name of repoFiles) {
    const src = stripComments(readFileSync(join(here, name), "utf8"));
    assert.doesNotMatch(src, /firebase-admin/, `${name} must not import firebase-admin`);
    assert.doesNotMatch(src, /formatGrinNumber/, `${name} must not invent GRIN numbers`);
    if (name !== "appBinding.ts") {
      assert.doesNotMatch(src, /from ["']expo-sqlite["']/, `${name} must not import expo-sqlite`);
    }
    assert.doesNotMatch(src, /from ["'][^"']*hostSqlite["']/, `${name} must not import HostSqlite`);
  }

  console.log("GrinApplicationRepository.test.ts: ok");
}

main();
