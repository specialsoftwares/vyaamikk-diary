import { getVyaamikkInstallUrl, hasVyaamikkInstallUrl } from "@/config/appLinks";
import { env } from "@/config/env";
import type { UserProfile } from "@/domain/types";
import { formatDisplayPhone } from "@/utils/phone";
import { formatGreetingName } from "@/utils/profile/formatGreetingName";
import {
  DEFAULT_BUSINESS_IDENTITY_SHARE_TEMPLATE,
  type BusinessIdentityShareTemplateOptions,
} from "@/utils/profile/businessIdentityShareTemplate";

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

function businessOrProfession(user: UserProfile): string {
  return user.businessName?.trim() || user.workType?.trim() || "";
}

function roleLine(user: UserProfile, t: TranslateFn, includeContact: boolean): string | null {
  const designation = user.designation?.trim() || "";
  const workType = user.workType?.trim() || "";

  if (includeContact) {
    const parts: string[] = [];
    if (user.phoneE164?.trim()) {
      parts.push(formatDisplayPhone(user.phoneE164));
    }
    const email = user.businessEmail?.trim();
    if (email) parts.push(email);
    const contact = parts.join(" · ");
    if (designation && contact) {
      return t("you.identityCard.shareDesignationContact", { designation, contact });
    }
    if (designation && workType) {
      return t("you.identityCard.shareRoleLine", { designation, workType });
    }
    if (designation) return designation;
    if (contact) return contact;
    if (workType) return workType;
    return null;
  }

  if (designation && workType) {
    return t("you.identityCard.shareRoleLine", { designation, workType });
  }
  if (designation) return designation;
  if (workType) return workType;
  return null;
}

/**
 * Digital visiting-card text for native share sheet (WhatsApp, Messages, etc.).
 * Uses profile fields in the background; does not require displaying them on the card UI.
 */
export function buildBusinessIdentityShareMessage(
  user: UserProfile,
  t: TranslateFn,
  options: BusinessIdentityShareTemplateOptions = DEFAULT_BUSINESS_IDENTITY_SHARE_TEMPLATE
): string {
  const { includeUeid, includeContact } = {
    ...DEFAULT_BUSINESS_IDENTITY_SHARE_TEMPLATE,
    ...options,
  };

  const name =
    formatGreetingName(user.displayName?.trim() || "", user.salutation, t) ||
    user.displayName?.trim() ||
    t("you.identityCard.shareNameFallback");

  const org = businessOrProfession(user);
  const lines: string[] = [];

  if (org) {
    lines.push(t("you.identityCard.shareIntroWithBusiness", { name, business: org }));
  } else {
    lines.push(t("you.identityCard.shareIntro", { name }));
  }

  const role = roleLine(user, t, includeContact);
  if (role) {
    lines.push("");
    lines.push(role);
  }

  lines.push("");
  lines.push(t("you.identityCard.sharePitch", { app: env.brand.appName }));
  lines.push("");

  if (includeUeid && user.ueid?.trim()) {
    lines.push(t("you.identityCard.shareUeid", { ueid: user.ueid }));
    lines.push("");
  }

  if (hasVyaamikkInstallUrl()) {
    lines.push(t("you.identityCard.shareDownload", { url: getVyaamikkInstallUrl() }));
  } else {
    lines.push(t("you.identityCard.shareDownloadGeneric", { app: env.brand.appName }));
  }

  return lines.join("\n");
}
