export {
  buildEntrySearchableText,
  buildLetterheadSearchableText,
  buildProfessionalPackSearchableText,
} from "./buildSearchableText";
export {
  invalidateGlobalSearchIndex,
  loadGlobalSearchIndex,
  queryGlobalSearch,
  getRecentRecordsFromIndex,
  notifySearchIndexChanged,
} from "./globalSearchRepository";
export { getRecentSearches, pushRecentSearch, clearRecentSearches } from "./recentSearches";
export { navigateToSearchResult } from "./routing";
export { isQuerySearchable } from "./match";
export { normalizeSearchText, tokenizeQuery } from "./normalize";
export type {
  GlobalSearchFilter,
  GlobalSearchResult,
  SearchCategory,
  SearchResultKind,
} from "./types";
