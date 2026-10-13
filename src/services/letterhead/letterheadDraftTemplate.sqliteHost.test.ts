/**
 * SQLITE_HOST: letterhead drafts keep the template that was current at save.
 * Not a NATIVE_DEVICE proof of gallery upload.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { closeLocalDatabaseForTests, setLocalDatabaseForTests } from "@/localDb/database";
import { execStatements, migrateToV3 } from "@/localDb/migrate";
import { MIGRATIONS_V1 } from "@/localDb/schema";
import { formDraftsRepository } from "@/repositories/formDraftsRepository";
import { openHostSqlite, type HostSqlite } from "@/services/grin/outbox/hostSqlite";
import type { GrinSqlDb } from "@/services/grin/outbox/hostSqlite";

import {
  LETTERHEAD_DRAFT_KIND,
  LETTERHEAD_DRAFT_SCOPE,
  letterheadInputToDraftPayload,
  resolveDraftLetterhead,
} from "./letterheadDraftMapper";
import type { LetterheadConfig, LetterheadDocumentInput } from "./types";

function asMigrateDb(db: GrinSqlDb) {
  return db as unknown as Parameters<typeof migrateToV3>[0];
}

function template(pathName: string, updatedAt: number): LetterheadConfig {
  return {
    userId: "owner-a",
    sourceType: "imported_image",
    placement: pathName.endsWith("a.jpg") ? "header_logo" : "complete_page",
    imageWidth: pathName.endsWith("a.jpg") ? 1600 : 595,
    imageHeight: pathName.endsWith("a.jpg") ? 280 : 842,
    imageDataUri: null,
    letterheadImageStoragePath: pathName,
    letterheadImageDownloadUrl: null,
    margins: { topPct: 22, bottomPct: 8, leftPct: 12, rightPct: 12 },
    repeatTemplateAllPages: true,
    createdAt: updatedAt,
    updatedAt,
  };
}

function matter(subject: string): LetterheadDocumentInput {
  return {
    title: "Letter",
    date: 1,
    reference: "REF",
    recipientName: "Acme",
    recipientDesignation: "",
    recipientCompany: "",
    recipientAddress: "",
    subject,
    salutation: "",
    body: "Body text",
    closing: "",
    name: "Owner",
    designation: "",
    place: "",
    useSignature: false,
    useStamp: false,
  };
}

async function main(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "letterhead-draft-"));
  const dbPath = path.join(dir, "drafts.sqlite");
  const db: HostSqlite = openHostSqlite(dbPath);
  execStatements(asMigrateDb(db), MIGRATIONS_V1, "v1");
  migrateToV3(asMigrateDb(db));
  setLocalDatabaseForTests(db);

  const templateA = template("users/owner-a/letterhead/a.jpg", 10);
  const templateB = template("users/owner-a/letterhead/b.jpg", 20);
  const payloadA = letterheadInputToDraftPayload(matter("Kept with A"), templateA);

  const saved = await formDraftsRepository.saveUserDraft({
    userId: "owner-a",
    draftKind: LETTERHEAD_DRAFT_KIND,
    scopeKey: LETTERHEAD_DRAFT_SCOPE,
    title: "Kept with A",
    payload: payloadA,
  });

  const reopened = await formDraftsRepository.getById("owner-a", saved.id);
  assert.ok(reopened);
  const resolved = resolveDraftLetterhead(reopened.payload, templateB);
  assert.equal(resolved.gap, null);
  assert.equal(resolved.preview?.letterheadImageStoragePath, "users/owner-a/letterhead/a.jpg");
  assert.equal(resolved.preview?.placement, "header_logo");
  assert.equal(resolved.input.subject, "Kept with A");
  assert.notEqual(resolved.preview?.letterheadImageStoragePath, templateB.letterheadImageStoragePath);

  const newLetter = templateB;
  assert.equal(newLetter.letterheadImageStoragePath, "users/owner-a/letterhead/b.jpg");

  const again = await formDraftsRepository.saveUserDraft({
    userId: "owner-a",
    draftKind: LETTERHEAD_DRAFT_KIND,
    scopeKey: LETTERHEAD_DRAFT_SCOPE,
    draftId: saved.id,
    title: "Kept with A",
    payload: letterheadInputToDraftPayload(matter("Kept with A"), resolved.preview!),
  });
  const reopenedAgain = await formDraftsRepository.getById("owner-a", again.id);
  const stillA = resolveDraftLetterhead(reopenedAgain!.payload, templateB);
  assert.equal(stillA.preview?.letterheadImageStoragePath, "users/owner-a/letterhead/a.jpg");

  await formDraftsRepository.saveRecovery({
    userId: "owner-a",
    draftKind: LETTERHEAD_DRAFT_KIND,
    scopeKey: LETTERHEAD_DRAFT_SCOPE,
    payload: payloadA,
  });
  assert.equal(await formDraftsRepository.getById("owner-b", saved.id), null);
  assert.deepEqual(await formDraftsRepository.listActiveUserDrafts("owner-b"), []);
  assert.equal(
    await formDraftsRepository.loadRecovery({
      userId: "owner-b",
      draftKind: LETTERHEAD_DRAFT_KIND,
      scopeKey: LETTERHEAD_DRAFT_SCOPE,
    }),
    null
  );
  const ownRecovery = await formDraftsRepository.loadRecovery({
    userId: "owner-a",
    draftKind: LETTERHEAD_DRAFT_KIND,
    scopeKey: LETTERHEAD_DRAFT_SCOPE,
  });
  assert.equal(
    resolveDraftLetterhead(ownRecovery!.payload, templateB).preview?.letterheadImageStoragePath,
    "users/owner-a/letterhead/a.jpg"
  );

  const legacy = await formDraftsRepository.saveUserDraft({
    userId: "owner-a",
    draftKind: LETTERHEAD_DRAFT_KIND,
    scopeKey: LETTERHEAD_DRAFT_SCOPE,
    title: "Old",
    payload: { subject: "Old subject", body: "Old body" },
  });
  const legacyRow = await formDraftsRepository.getById("owner-a", legacy.id);
  const legacyResolved = resolveDraftLetterhead(legacyRow!.payload, templateB);
  assert.equal(legacyResolved.gap, "draft");
  assert.equal(legacyResolved.preview, null);
  assert.equal(legacyResolved.input.subject, "Old subject");
  assert.equal(legacyRow!.payload.templateSnapshot, undefined);
  assert.equal("letterheadImageStoragePath" in (legacyResolved.preview ?? {}), false);

  db.close();
  closeLocalDatabaseForTests();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("letterheadDraftTemplate.sqliteHost.test.ts: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
