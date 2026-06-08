import type { ProfileSalutationId } from "@/domain/profileSalutation";
import type { ProfileTrackedField } from "@/domain/profileUpdatePolicy";
import { canEditProfileField } from "@/domain/profileUpdatePolicy";
import type { UserProfile } from "@/domain/types";
import type { useT } from "@/i18n";

type Translate = ReturnType<typeof useT>;

export type ProfileDetailField =
  | "displayName"
  | "businessName"
  | "workType"
  | "designation"
  | "businessEmail";

export interface ProfileDetailRowModel {
  key: ProfileDetailField;
  label: string;
  value: string | null;
  missing: boolean;
  locked: boolean;
  hint: string | null;
  icon: "account-outline" | "domain" | "briefcase-outline" | "badge-account-outline" | "email-outline";
}

export function formatProfileDisplayName(
  salutation: ProfileSalutationId | null | undefined,
  displayName: string | null | undefined,
  t: Translate
): string | null {
  const name = (displayName ?? "").trim();
  if (!name) return null;
  const sal = salutation && salutation !== "none" ? salutation : null;
  if (!sal) return name;
  const prefix = t(`profile.salutation.${sal}`);
  return `${prefix} ${name}`;
}

function missingHintKey(field: ProfileDetailField): string {
  switch (field) {
    case "displayName":
      return "identity.details.missing.displayName";
    case "businessName":
      return "identity.details.missing.businessName";
    case "workType":
      return "identity.details.missing.workType";
    case "designation":
      return "identity.details.missing.designation";
    case "businessEmail":
      return "identity.details.missing.businessEmail";
  }
}

function lockedHintKey(field: ProfileDetailField): string | null {
  if (field === "businessName") return "identity.details.lockedBusinessName";
  if (field === "businessEmail") return "identity.details.lockedEmail";
  return null;
}

export function buildProfileDetailRows(user: UserProfile, t: Translate): ProfileDetailRowModel[] {
  const rows: ProfileDetailRowModel[] = [
    {
      key: "displayName",
      label: t("onboarding.profile.nameLabel"),
      value: formatProfileDisplayName(user.salutation, user.displayName, t),
      missing: !(user.displayName ?? "").trim(),
      locked: false,
      hint: null,
      icon: "account-outline",
    },
    {
      key: "businessName",
      label: t("onboarding.profile.businessLabel"),
      value: (user.businessName ?? "").trim() || null,
      missing: !(user.businessName ?? "").trim(),
      locked: !canEditProfileField(user, "businessName").allowed,
      hint: null,
      icon: "domain",
    },
    {
      key: "workType",
      label: t("onboarding.profile.fieldLabel"),
      value: (user.workType ?? "").trim() || null,
      missing: !(user.workType ?? "").trim(),
      locked: false,
      hint: null,
      icon: "briefcase-outline",
    },
    {
      key: "designation",
      label: t("onboarding.profile.designationLabel"),
      value: (user.designation ?? "").trim() || null,
      missing: !(user.designation ?? "").trim(),
      locked: false,
      hint: null,
      icon: "badge-account-outline",
    },
  ];

  const email = (user.businessEmail ?? "").trim();
  rows.push({
    key: "businessEmail",
    label: t("onboarding.profile.emailLabel"),
    value: email || null,
    missing: !email,
    locked: !canEditProfileField(user, "businessEmail").allowed,
    hint: null,
    icon: "email-outline",
  });

  return rows.map((row) => {
    if (row.missing) {
      return { ...row, hint: t(missingHintKey(row.key)) };
    }
    if (row.locked) {
      return { ...row, hint: t(lockedHintKey(row.key)!) };
    }
    return row;
  });
}

export function canRequestProfileDetailsEdit(user: UserProfile): boolean {
  const fields: ProfileTrackedField[] = [
    "displayName",
    "businessName",
    "businessEmail",
    "workType",
    "designation",
    "salutation",
  ];
  const hasMissing = !(
    user.displayName?.trim() &&
    user.businessName?.trim() &&
    user.workType?.trim() &&
    user.designation?.trim()
  );
  const hasEditable = fields.some((f) => canEditProfileField(user, f).allowed);
  return hasEditable || hasMissing;
}
