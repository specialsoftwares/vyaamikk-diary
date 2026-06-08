/** Common domains for quick completion after `@` (India + global). */
export const COMMON_EMAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.in",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "rediffmail.com",
  "proton.me",
  "protonmail.com",
] as const;

const DOMAIN_SET = new Set<string>(COMMON_EMAIL_DOMAINS);

export interface EmailDomainSuggestContext {
  local: string;
  domainQuery: string;
}

/** When `null`, domain suggestions should not show. */
export function parseEmailForDomainSuggest(value: string): EmailDomainSuggestContext | null {
  const trimmed = value.trim();
  const at = trimmed.lastIndexOf("@");
  if (at < 1) return null;
  const local = trimmed.slice(0, at);
  if (!local) return null;
  const domainQuery = trimmed.slice(at + 1).toLowerCase();
  if (DOMAIN_SET.has(domainQuery)) return null;
  return { local, domainQuery };
}

export function suggestEmailDomains(
  local: string,
  domainQuery: string,
  limit = 7
): string[] {
  const matches = COMMON_EMAIL_DOMAINS.filter(
    (domain) => domainQuery === "" || domain.startsWith(domainQuery)
  );
  return matches.slice(0, limit).map((domain) => `${local}@${domain}`);
}
