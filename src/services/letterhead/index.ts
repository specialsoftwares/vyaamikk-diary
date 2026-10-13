import { getActiveBackend } from "@/config/env";

import { mockLetterheadRepository } from "./mock";

import type { LetterheadRepository } from "./types";

let cachedFirebaseLetterhead: LetterheadRepository | null = null;

export type {
  LetterheadConfig,
  LetterheadMargins,
  LetterheadDocument,
  LetterheadDocumentInput,
  LetterheadDocumentCreateInput,
  LetterheadDocumentRepository,
  LetterheadEditHistoryEntry,
  LetterheadRepository,
} from "./types";
export { DEFAULT_LETTERHEAD_MARGINS } from "./types";

export {
  A4_ASPECT_RATIO,
  A4_HEIGHT_IN,
  A4_WIDTH_IN,
  DEFAULT_LAYOUT_INCHES,
  SIGNATURE_MAX_HEIGHT_PT,
  SIGNATURE_MAX_WIDTH_PT,
  STAMP_MAX_HEIGHT_PT,
  STAMP_MAX_WIDTH_PT,
  inchesToMargins,
  marginsToInches,
  type LetterheadInchMargins,
} from "./letterheadLayoutConfig";
export {
  analyzeTemplateImage,
  type TemplateAnalysis,
  type TemplateImageMeta,
  type TemplateWarningKey,
} from "./letterheadTemplateService";
export {
  DEFAULT_GENERATED_LAYOUT,
  isLetterheadGeneratedLayout,
  validateWritingMargins,
  type LetterheadAppearance,
  type LetterheadGeneratedLayout,
  type LetterheadLogoAlign,
  type LetterheadSourceType,
} from "./letterheadGeneratedLayout";
export {
  APPEARANCE_CSS_FILTER,
  generatedHeaderFlex,
  IMPORTED_PAGE_FIT,
  IMPORTED_PAGE_POSITION,
  LETTERHEAD_A4_ASPECT,
  pdfAlignClass,
  SUPPORTED_APPEARANCES,
} from "./letterheadVisualSpec";
export {
  LETTERHEAD_DRAFT_KIND,
  LETTERHEAD_DRAFT_SCOPE,
  draftPayloadToLetterheadInput,
  isLetterheadDraftMeaningful,
  letterheadInputToDraftPayload,
  resolveDraftLetterhead,
} from "./letterheadDraftMapper";

/**
 * Mirrors the diary repository selector: Firestore whenever configured
 * (production or shared-dev), AsyncStorage otherwise.
 */
export function getLetterheadRepository(): LetterheadRepository {
  const backend = getActiveBackend();
  if (backend === "firebase-production" || backend === "firebase-shared-dev") {
    if (!cachedFirebaseLetterhead) {
      cachedFirebaseLetterhead =
        require("./firebase").firebaseLetterheadRepository as LetterheadRepository;
    }
    return cachedFirebaseLetterhead;
  }
  return mockLetterheadRepository;
}

export { getLetterheadDocumentRepository, setLetterheadDocumentRepositoryForTests } from "./documentRepository";
