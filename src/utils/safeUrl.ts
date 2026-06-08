import { Linking } from "react-native";

/**
 * Allow only http(s) links for in-app browser / external opens.
 */
const ALLOWED_SCHEMES = /^https?:\/\//i;

export function isSafeExternalUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^(javascript|data|file|vbscript):/i.test(trimmed)) return false;
  return ALLOWED_SCHEMES.test(trimmed);
}

/**
 * Open http(s) URLs in the system browser.
 * Uses a bound call — passing `Linking.openURL` unbound breaks RN's internal `_validateURL`.
 */
export async function openSafeExternalUrl(url: string): Promise<boolean> {
  if (!isSafeExternalUrl(url)) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
