/**
 * Safe mailto opener — catches Linking failures so void callers cannot leave
 * unhandled rejections (redbox / apparent freeze after tap).
 */

import { Linking } from "react-native";

import { normalizeMailtoUrl } from "@/utils/safeMailtoPolicy";

export { normalizeMailtoUrl } from "@/utils/safeMailtoPolicy";

export async function openSafeMailto(emailOrMailto: unknown): Promise<boolean> {
  const url = normalizeMailtoUrl(emailOrMailto);
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
