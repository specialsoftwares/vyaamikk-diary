/**
 * Letterhead creation is removed. Stored letters still parse, stay
 * owner-scoped, and old routes fall back to the saved-letter list.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { COMPOSER_OPTIONS } from "@/domain/composerOptions";
import { hrefForDraft } from "@/services/drafts/draftRoutes";
import { parseLetterheadDocument } from "./documentParse";
import {
  classifyStoredPdf,
  legacyLetterFields,
  legacyLetterVisibleTo,
  legacyReaderParams,
  retiredLetterheadFallsBackToHistory,
} from "./legacyLetterhead";

const root = path.join(import.meta.dirname, "../../..");

test("new record no longer offers letterhead", () => {
  assert.equal(
    COMPOSER_OPTIONS.some((option) => option.type === "letterhead_matter"),
    false
  );
  const picker = fs.readFileSync(
    path.join(root, "src/components/composer/ComposerPickerSheet.tsx"),
    "utf8"
  );
  assert.doesNotMatch(picker, /letterhead_matter/);
});

test("old editor routes fall back and a saved id opens the reader", () => {
  assert.equal(retiredLetterheadFallsBackToHistory("setup"), true);
  assert.equal(retiredLetterheadFallsBackToHistory("generate"), true);
  assert.equal(retiredLetterheadFallsBackToHistory("index"), true);
  assert.deepEqual(legacyReaderParams({}), { draftId: undefined, documentId: undefined });
  assert.deepEqual(legacyReaderParams({ editDocId: "doc-1" }), {
    draftId: undefined,
    documentId: "doc-1",
  });
  const href = hrefForDraft({
    id: "draft-1",
    userId: "owner",
    draftKind: "letterhead",
    scopeKey: "letterhead_matter",
    entryId: null,
    title: "Offer",
    status: "active",
    source: "user",
    payload: {},
    updatedAt: 1,
  });
  assert.equal(typeof href, "object");
  const route = href as unknown as { pathname: string; params: { draftId: string } };
  assert.equal(route.pathname, "/(app)/letterhead/create");
  assert.equal(route.params.draftId, "draft-1");
});

test("stored letter content parses without a PDF or a live template", () => {
  const doc = parseLetterheadDocument(
    "doc-1",
    {
      ueid: "ueid",
      title: "Offer",
      input: {
        title: "Offer",
        date: 10,
        subject: "Steel",
        body: "Please supply",
        closing: "Regards",
        name: "A",
        designation: "",
        place: "",
      },
      pdfUri: null,
      saved: true,
      createdAt: 10,
      updatedAt: 11,
    },
    "owner"
  );
  assert.equal(doc.pdfUri, null);
  assert.equal(doc.templateSnapshot, null);
  assert.deepEqual(
    legacyLetterFields(doc.input).map((row) => row.key),
    ["title", "subject", "body", "closing", "name"]
  );
  assert.equal(classifyStoredPdf(doc.pdfUri, false), "none");
  assert.equal(classifyStoredPdf("file:///saved.pdf", false), "missing");
  assert.equal(classifyStoredPdf("file:///saved.pdf", true), "present");
  assert.equal(legacyLetterVisibleTo(doc.userId, "owner"), true);
  assert.equal(legacyLetterVisibleTo(doc.userId, "other"), false);
});

test("exclusive scanner and crop packages are gone", () => {
  const pkg = fs.readFileSync(path.join(root, "package.json"), "utf8");
  assert.doesNotMatch(pkg, /mlkit-document-scanner/);
  assert.doesNotMatch(pkg, /expo-image-manipulator/);
  const create = fs.readFileSync(path.join(root, "app/(app)/letterhead/create.tsx"), "utf8");
  assert.doesNotMatch(create, /buildLetterheadHtml|saveLetterheadCreateWithPdf/);
  assert.match(create, /readLegacyScreenSession/);
  assert.match(create, /bindLegacyReaderFrame/);
  assert.match(create, /onPress=\{\(\) => void frame\.share\(\)\}/);
});
