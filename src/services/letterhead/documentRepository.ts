import { getActiveBackend } from "@/config/env";

import { mockLetterheadDocumentRepository } from "./documents-mock";

import type { LetterheadDocumentRepository } from "./types";

let cachedFirebaseDocs: LetterheadDocumentRepository | null = null;

/** Document repo selector — avoids pulling letterhead PDF/template helpers at import. */
export function getLetterheadDocumentRepository(): LetterheadDocumentRepository {
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
