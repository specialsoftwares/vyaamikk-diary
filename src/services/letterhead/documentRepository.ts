import { getActiveBackend } from "@/config/env";

import { mockLetterheadDocumentRepository } from "./documents-mock";

import type { LetterheadDocumentRepository } from "./types";

let cachedFirebaseDocs: LetterheadDocumentRepository | null = null;
let testDocsOverride: LetterheadDocumentRepository | null = null;

/** Document repo selector — avoids pulling letterhead PDF/template helpers at import. */
export function getLetterheadDocumentRepository(): LetterheadDocumentRepository {
  if (testDocsOverride) return testDocsOverride;
  const backend = getActiveBackend();
  if (backend === "firebase-production" || backend === "firebase-shared-dev") {
    if (!cachedFirebaseDocs) {
      cachedFirebaseDocs =
        require("./documents-firebase").firebaseLetterheadDocumentRepository as LetterheadDocumentRepository;
    }
    return cachedFirebaseDocs;
  }
  return mockLetterheadDocumentRepository;
}

export function setLetterheadDocumentRepositoryForTests(
  repo: LetterheadDocumentRepository | null
): void {
  testDocsOverride = repo;
}
