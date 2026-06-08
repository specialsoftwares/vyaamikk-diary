import { digitsOnly, normalizeSearchText, tokenizeQuery } from "./normalize";

const MIN_QUERY_LENGTH = 2;

export function isQuerySearchable(query: string): boolean {
  return normalizeSearchText(query).length >= MIN_QUERY_LENGTH;
}

export function scoreSearchMatch(searchableText: string, query: string): number {
  const norm = searchableText;
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return 0;

  const compactQuery = tokens.join(" ");
  let score = 0;

  for (const token of tokens) {
    if (norm.includes(token)) {
      score += 3;
      continue;
    }
    const tokenDigits = digitsOnly(token);
    if (tokenDigits.length >= 2 && norm.includes(tokenDigits)) {
      score += 2;
      continue;
    }
    return 0;
  }

  if (norm.includes(compactQuery)) score += 6;

  const qDigits = digitsOnly(query);
  if (qDigits.length >= 2) {
    const normCompact = digitsOnly(norm);
    if (normCompact.includes(qDigits)) score += 4;
  }

  return score;
}
