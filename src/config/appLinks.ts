import { env } from "@/config/env";

/**
 * Single source of truth for Vyaamikk Diary install / download links in share text.
 * Replace via EXPO_PUBLIC_APP_INSTALL_URL when store URLs are live.
 */
export function getVyaamikkInstallUrl(): string {
  return env.brand.installUrl;
}

export function hasVyaamikkInstallUrl(): boolean {
  const url = getVyaamikkInstallUrl().trim();
  return url.length > 0 && !url.includes("example.com");
}
