/**
 * Pure public-URL classification (no React Native imports — Node-testable).
 */

export type PublicLinkKind =
  | "websiteHome"
  | "privacy"
  | "terms"
  | "support"
  | "contact"
  | "accountDeletion"
  | "download"
  | "appStore"
  | "playStore";

export type PublicLinkStatus =
  | "ready"
  | "missing"
  | "malformed"
  | "forbidden_auth"
  | "prelaunch_empty";

export interface PublicLinkResolution {
  kind: PublicLinkKind;
  url: string;
  status: PublicLinkStatus;
  canOpen: boolean;
  reason?: string;
}

const FORBIDDEN_AUTH_PATH = /\/auth\/?(\?|#|$)/i;
const ALLOWED_HTTPS = /^https:\/\//i;

function trimUrl(raw: string): string {
  return typeof raw === "string" ? raw.trim() : "";
}

export function classifyPublicUrl(
  kind: PublicLinkKind,
  raw: string
): PublicLinkResolution {
  const url = trimUrl(raw);

  if (!url) {
    const prelaunch = kind === "appStore" || kind === "playStore";
    return {
      kind,
      url: "",
      status: prelaunch ? "prelaunch_empty" : "missing",
      canOpen: false,
      reason: prelaunch
        ? "Store listing URL is not live yet (pre-launch)."
        : `Missing URL for ${kind}.`,
    };
  }

  if (FORBIDDEN_AUTH_PATH.test(url)) {
    return {
      kind,
      url,
      status: "forbidden_auth",
      canOpen: false,
      reason:
        "Website /auth is Developer Integration Sign-In only — not a mobile-app destination.",
    };
  }

  if (!ALLOWED_HTTPS.test(url) || /^(javascript|data|file|vbscript):/i.test(url)) {
    return {
      kind,
      url,
      status: "malformed",
      canOpen: false,
      reason: `URL for ${kind} must be a valid https:// address.`,
    };
  }

  if (/example\.com|\.example\b/i.test(url)) {
    return {
      kind,
      url,
      status: "malformed",
      canOpen: false,
      reason: `Placeholder URL for ${kind} is not allowed.`,
    };
  }

  if (/specialsoftwares\.in/i.test(url)) {
    return {
      kind,
      url,
      status: "malformed",
      canOpen: false,
      reason: `Retired .in hostname for ${kind} — use vyaamikk.specialsoftwares.com.`,
    };
  }

  return { kind, url, status: "ready", canOpen: true };
}
