/**
 * Mobile-side public website / store link resolver.
 *
 * Derives every end-user external destination from EXPO_PUBLIC_* values
 * (via `env.brand`). Authoritative production origin:
 * https://vyaamikk.specialsoftwares.com (see docs/WEBSITE_STORE_INTEGRATION.md).
 *
 * Website `/auth` is a Developer Integration Sign-In (MCP/OAuth) and must
 * never be used as a mobile-app or end-user destination.
 *
 * This module stays free of React Native imports so Node tests can load it.
 * Opening uses a dynamic import of `safeUrl` inside try/catch — never Expo
 * Router, and never an unhandled rejection from a failed async chunk.
 */

import { env } from "@/config/env";
import {
  classifyPublicUrl,
  type PublicLinkKind,
  type PublicLinkResolution,
} from "@/config/publicLinkValidation";
import { EXTERNAL_OPEN_FAILED_MESSAGE } from "@/utils/externalHttpsUrl";

export type {
  PublicLinkKind,
  PublicLinkResolution,
  PublicLinkStatus,
} from "@/config/publicLinkValidation";
export { classifyPublicUrl } from "@/config/publicLinkValidation";

/** Snapshot of all public destinations from current env. */
export function getPublicLinks(): Record<PublicLinkKind, PublicLinkResolution> {
  const b = env.brand;
  return {
    websiteHome: classifyPublicUrl("websiteHome", b.websiteUrl),
    privacy: classifyPublicUrl("privacy", b.privacyUrl),
    terms: classifyPublicUrl("terms", b.termsUrl),
    support: classifyPublicUrl("support", b.supportUrl),
    contact: classifyPublicUrl("contact", b.contactUrl),
    accountDeletion: classifyPublicUrl("accountDeletion", b.accountDeletionUrl),
    download: classifyPublicUrl("download", b.installUrl),
    appStore: classifyPublicUrl("appStore", b.appStoreUrl),
    playStore: classifyPublicUrl("playStore", b.playStoreUrl),
  };
}

export function resolvePublicLink(kind: PublicLinkKind): PublicLinkResolution {
  return getPublicLinks()[kind];
}

/** Production blockers for required legal destinations (no React Native imports). */
export function findPublicLinkBlockers(): string[] {
  const links = getPublicLinks();
  const required: PublicLinkKind[] = [
    "privacy",
    "terms",
    "accountDeletion",
    "download",
  ];
  const blockers: string[] = [];
  for (const kind of required) {
    const r = links[kind];
    if (r.status !== "ready") {
      blockers.push(`${kind}: ${r.reason ?? r.status}`);
    }
  }
  for (const r of Object.values(links)) {
    if (r.status === "forbidden_auth") {
      blockers.push(`${r.kind}: ${r.reason}`);
    }
  }
  return blockers;
}

/** True when a store listing URL is configured and openable. */
export function hasLiveStoreListingUrl(kind: "appStore" | "playStore"): boolean {
  return resolvePublicLink(kind).canOpen;
}

/** Approved product support mailbox (not website /auth). */
export function getSupportEmail(): string {
  return env.brand.supportEmail.trim();
}

function showUnavailableAlert(title: string, message: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Alert } = require("react-native") as {
      Alert: { alert: (t: string, m?: string) => void };
    };
    Alert.alert(title, message);
  } catch {
    // Non-RN test / SSR — no-op.
  }
}

async function openResolvedHttps(url: string): Promise<boolean> {
  // Dynamic import keeps this module Node-testable; try/catch prevents an
  // unhandled rejection if Metro fails to load the opener chunk.
  const { openSafeExternalUrl } = await import("@/utils/safeUrl");
  return openSafeExternalUrl(url);
}

/**
 * Open a public link when ready. Returns false without opening when missing,
 * malformed, empty store URL, or forbidden `/auth`. Never throws.
 */
export async function openPublicLink(kind: PublicLinkKind): Promise<boolean> {
  const resolved = resolvePublicLink(kind);
  if (!resolved.canOpen) return false;
  try {
    // Pass only the validated string — never the resolution object.
    return await openResolvedHttps(resolved.url);
  } catch {
    return false;
  }
}

/**
 * Open a public link, or show an honest Alert when the destination is not
 * available or the system browser fails (production-safe — never opens a dead
 * or `/auth` URL, never leaves callers with an unhandled rejection).
 */
export async function openPublicLinkOrExplain(
  kind: PublicLinkKind,
  opts?: { title?: string; unavailableMessage?: string }
): Promise<boolean> {
  const resolved = resolvePublicLink(kind);
  const title = opts?.title ?? "Link unavailable";

  if (!resolved.canOpen) {
    showUnavailableAlert(
      title,
      opts?.unavailableMessage ??
        resolved.reason ??
        "This web resource is not configured yet."
    );
    return false;
  }

  try {
    const ok = await openResolvedHttps(resolved.url);
    if (!ok) {
      showUnavailableAlert(title, EXTERNAL_OPEN_FAILED_MESSAGE);
    }
    return ok;
  } catch {
    showUnavailableAlert(title, EXTERNAL_OPEN_FAILED_MESSAGE);
    return false;
  }
}
