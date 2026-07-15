import {
  hasLiveStoreListingUrl,
  resolvePublicLink,
} from "@/config/publicLinks";

/**
 * Single source of truth for Vyaamikk Diary install / download links in share text.
 *
 * Prefer the pre-launch `/download` page until real App Store / Play Store URLs
 * are configured via EXPO_PUBLIC_APP_STORE_URL / EXPO_PUBLIC_PLAY_STORE_URL.
 * Never treat an empty store URL as a live listing.
 */
export function getVyaamikkInstallUrl(): string {
  const download = resolvePublicLink("download");
  return download.canOpen ? download.url : "";
}

export function hasVyaamikkInstallUrl(): boolean {
  return resolvePublicLink("download").canOpen;
}

/** Live App Store listing URL only — empty while pre-launch. */
export function getAppStoreUrl(): string {
  const r = resolvePublicLink("appStore");
  return r.canOpen ? r.url : "";
}

/** Live Play Store listing URL only — empty while pre-launch. */
export function getPlayStoreUrl(): string {
  const r = resolvePublicLink("playStore");
  return r.canOpen ? r.url : "";
}

export function hasAppStoreListing(): boolean {
  return hasLiveStoreListingUrl("appStore");
}

export function hasPlayStoreListing(): boolean {
  return hasLiveStoreListingUrl("playStore");
}
