/**
 * Isolated Functions-emulator entry. Uses production Admin composition.
 * NOT functions/src/index.ts. Do not deploy this folder.
 */
export {
  createProductionGrinCallables as createIsolatedGrinCallables,
  ISOLATED_FUNCTIONS_PROJECT,
  ISOLATED_STORAGE_BUCKET,
  PRODUCTION_COMPOSITION_KIND,
} from "../../../functions/src/goodsEvidence/productionCompose";
